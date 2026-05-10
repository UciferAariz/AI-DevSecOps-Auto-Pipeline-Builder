import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);

export function ensureRuntimeDirs() {
  for (const dir of ['.data', 'uploads', 'workspaces', 'reports', 'generated']) {
    fs.mkdirSync(path.join(process.cwd(), dir), { recursive: true });
  }
}

export function safeGeneratedPath(jobId, relativePath) {
  const root = path.resolve(process.cwd(), 'generated', jobId);
  const resolved = path.resolve(root, relativePath);
  return resolved.startsWith(root + path.sep) || resolved === root ? resolved : null;
}

export function safeWorkspacePath(jobId, relativePath = '') {
  const root = path.resolve(process.cwd(), 'workspaces', jobId);
  const resolved = path.resolve(root, relativePath);
  return resolved.startsWith(root + path.sep) || resolved === root ? resolved : null;
}

export function extractZipSafely(zipPath, destination) {
  const zip = new AdmZip(zipPath);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of zip.getEntries()) {
    if (!isSafeArchiveEntry(entry.entryName)) {
      throw new Error(`Unsafe ZIP entry path: ${entry.entryName}`);
    }
    const target = path.resolve(destination, entry.entryName);
    if (!target.startsWith(path.resolve(destination) + path.sep) && target !== path.resolve(destination)) {
      throw new Error(`Unsafe ZIP entry path: ${entry.entryName}`);
    }
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
}

export function isSafeArchiveEntry(entryName) {
  const normalized = String(entryName || '').replaceAll('\\', '/');
  if (!normalized || path.posix.isAbsolute(normalized)) return false;
  return !normalized.split('/').includes('..');
}

export function zipDirectory(directory, rootName) {
  const zip = new AdmZip();
  zip.addLocalFolder(directory, rootName);
  return zip;
}

export async function downloadFile(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'AI-DevSecOps-Builder' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        downloadFile(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
      file.on('error', reject);
    });
    request.on('error', reject);
  });
}

export function githubZipUrl(repoUrl) {
  const parsed = new URL(repoUrl);
  if (!['github.com', 'www.github.com'].includes(parsed.hostname)) {
    throw new Error('Only public GitHub repository URLs are supported.');
  }
  const parts = parsed.pathname.replace(/^\/|\/$/g, '').split('/');
  if (parts.length < 2) {
    throw new Error('GitHub URL must include owner and repository name.');
  }
  const [owner, repo] = parts;
  const cleanRepo = repo.replace(/\.git$/, '');
  return {
    repoName: cleanRepo,
    url: `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/main.zip`,
    fallbackUrl: `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/master.zip`
  };
}

export function findRepoRoot(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const hasManifest = files.some((file) => ['package.json', 'requirements.txt', 'pyproject.toml', 'pom.xml', 'go.mod'].includes(file));
  if (hasManifest || dirs.length !== 1) {
    return directory;
  }
  return path.join(directory, dirs[0].name);
}

export function walkFiles(root, options = {}) {
  const ignored = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.venv', '__pycache__']);
  const maxFiles = options.maxFiles || 5000;
  const files = [];
  function walk(current) {
    if (files.length >= maxFiles) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  walk(root);
  return files;
}
