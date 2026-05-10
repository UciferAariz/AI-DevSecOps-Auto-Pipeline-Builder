import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectProject, normalizeTrivy } from '../server/scanners.js';

test('detects node project and missing DevSecOps controls', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devsecops-node-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"dependencies":{"express":"^5.0.0"}}');

  const detected = detectProject(root);

  assert.deepEqual(detected.projectTypes, ['node']);
  assert.equal(detected.hasDockerfile, false);
  assert.equal(detected.hasCiWorkflow, false);
  assert.deepEqual(detected.manifests, ['package.json']);
});

test('normalizes trivy vulnerabilities and secrets', () => {
  const findings = normalizeTrivy({
    Results: [{
      Target: 'package-lock.json',
      Vulnerabilities: [{
        VulnerabilityID: 'CVE-1',
        Severity: 'HIGH',
        PkgName: 'demo',
        InstalledVersion: '1.0.0',
        FixedVersion: '1.0.1'
      }],
      Secrets: [{ Title: 'GitHub token' }]
    }]
  });

  assert.equal(findings.length, 2);
  assert.equal(findings[0].severity, 'high');
  assert.equal(findings[0].fixedVersion, '1.0.1');
  assert.equal(findings[1].source, 'trivy-secret');
  assert.equal(findings[1].severity, 'critical');
});
