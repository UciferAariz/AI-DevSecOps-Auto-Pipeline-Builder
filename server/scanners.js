import fs from 'node:fs';
import path from 'node:path';
import { execFileAsync, walkFiles } from './utils.js';

const manifestNames = new Set(['package.json', 'requirements.txt', 'pyproject.toml', 'pom.xml', 'go.mod']);

export function detectProject(root) {
  const files = walkFiles(root, { maxFiles: 1000 });
  const relativeFiles = files.map((file) => path.relative(root, file).replaceAll(path.sep, '/'));
  const has = (name) => relativeFiles.includes(name) || relativeFiles.some((file) => file.endsWith(`/${name}`));
  const projectTypes = [];

  if (has('package.json')) projectTypes.push('node');
  if (has('requirements.txt') || has('pyproject.toml')) projectTypes.push('python');
  if (has('pom.xml')) projectTypes.push('java');
  if (has('go.mod')) projectTypes.push('go');
  if (has('main.tf')) projectTypes.push('terraform');
  if (relativeFiles.some((file) => file.startsWith('k8s/') || file.includes('/k8s/'))) projectTypes.push('kubernetes');

  return {
    projectTypes: [...new Set(projectTypes.length ? projectTypes : ['generic'])],
    hasDockerfile: relativeFiles.some((file) => /^Dockerfile(\..+)?$/.test(path.basename(file))),
    hasCiWorkflow: relativeFiles.some((file) => file.startsWith('.github/workflows/') && (file.endsWith('.yml') || file.endsWith('.yaml'))),
    manifests: files
      .filter((file) => manifestNames.has(path.basename(file)))
      .map((file) => path.relative(root, file).replaceAll(path.sep, '/')),
    files: relativeFiles
  };
}

export function analyzeDependencies(root, manifests) {
  const dependencies = [];
  for (const manifest of manifests) {
    const fullPath = path.join(root, manifest);
    const basename = path.basename(manifest);
    try {
      if (basename === 'package.json') {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        for (const section of ['dependencies', 'devDependencies']) {
          for (const [name, version] of Object.entries(parsed[section] || {})) {
            dependencies.push({ name, version, ecosystem: 'npm', manifest, dev: section === 'devDependencies' });
          }
        }
      }
      if (basename === 'requirements.txt') {
        const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const clean = line.trim();
          if (!clean || clean.startsWith('#')) continue;
          const [name, version = 'unbounded'] = clean.split(/==|>=|<=|~=|>|</);
          dependencies.push({ name: name.trim(), version: version.trim(), ecosystem: 'pip', manifest, dev: false });
        }
      }
      if (basename === 'go.mod') {
        const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const match = line.trim().match(/^([a-zA-Z0-9_.\/-]+)\s+(v[^\s]+)/);
          if (match && !match[1].startsWith('module')) {
            dependencies.push({ name: match[1], version: match[2], ecosystem: 'go', manifest, dev: false });
          }
        }
      }
    } catch (error) {
      dependencies.push({ name: basename, version: 'parse-error', ecosystem: 'unknown', manifest, error: error.message });
    }
  }
  return dependencies;
}

// Resolve the real trivy executable, handling Windows .exe / .cmd / .bat extensions
// (Node's child_process does not consult PATHEXT the way PowerShell does)
function resolveTrivyBinary() {
  const isWin = process.platform === 'win32';
  const candidates = isWin ? ['trivy.exe', 'trivy.cmd', 'trivy.bat', 'trivy'] : ['trivy'];
  const pathDirs = (process.env.PATH || process.env.Path || '').split(path.delimiter);
  for (const name of candidates) {
    for (const dir of pathDirs) {
      if (!dir) continue;
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return null;
}

export async function runTrivy(root) {
  const trivyBin = resolveTrivyBinary();
  if (!trivyBin) {
    return [{
      severity: 'unknown',
      title: 'Trivy scan unavailable',
      file: 'local environment',
      packageName: null,
      installedVersion: null,
      fixedVersion: null,
      cveId: null,
      source: 'trivy',
      remediation: 'Install Trivy and ensure it is available on PATH to enable full vulnerability, secret, and IaC scans.',
      toolError: 'trivy-not-installed'
    }];
  }
  try {
    const { stdout } = await execFileAsync(trivyBin, ['fs', '--scanners', 'vuln,secret,misconfig', '--format', 'json', '--quiet', root], {
      maxBuffer: 25 * 1024 * 1024
    });
    return normalizeTrivy(JSON.parse(stdout || '{}'));
  } catch (error) {
    return [{
      severity: 'unknown',
      title: 'Trivy scan failed',
      file: 'local environment',
      packageName: null,
      installedVersion: null,
      fixedVersion: null,
      cveId: null,
      source: 'trivy',
      remediation: 'The Trivy binary was found but the scan errored. Check the server logs for details.',
      toolError: error.message
    }];
  }
}

export function normalizeTrivy(report) {
  const findings = [];
  for (const result of report.Results || []) {
    for (const vulnerability of result.Vulnerabilities || []) {
      findings.push({
        severity: normalizeSeverity(vulnerability.Severity),
        title: vulnerability.Title || vulnerability.VulnerabilityID || 'Dependency vulnerability',
        file: result.Target,
        packageName: vulnerability.PkgName || null,
        installedVersion: vulnerability.InstalledVersion || null,
        fixedVersion: vulnerability.FixedVersion || null,
        cveId: vulnerability.VulnerabilityID || null,
        source: 'trivy',
        remediation: vulnerability.FixedVersion
          ? `Upgrade ${vulnerability.PkgName} to ${vulnerability.FixedVersion}.`
          : 'Review vendor advisory and apply the recommended upgrade or mitigation.'
      });
    }
    for (const secret of result.Secrets || []) {
      findings.push({
        severity: 'critical',
        title: secret.Title || 'Potential secret detected',
        file: result.Target,
        packageName: null,
        installedVersion: null,
        fixedVersion: null,
        cveId: null,
        source: 'trivy-secret',
        remediation: 'Rotate the exposed credential, remove it from history, and move secret access to a managed secret store.'
      });
    }
    for (const misconfiguration of result.Misconfigurations || []) {
      findings.push({
        severity: normalizeSeverity(misconfiguration.Severity),
        title: misconfiguration.Title || misconfiguration.ID || 'Infrastructure misconfiguration',
        file: result.Target,
        packageName: null,
        installedVersion: null,
        fixedVersion: null,
        cveId: misconfiguration.ID || null,
        source: 'trivy-misconfig',
        remediation: misconfiguration.Resolution || 'Apply least-privilege and hardening guidance for this configuration.'
      });
    }
  }
  return findings;
}

function normalizeSeverity(value) {
  const normalized = String(value || 'unknown').toLowerCase();
  return ['critical', 'high', 'medium', 'low'].includes(normalized) ? normalized : 'unknown';
}
