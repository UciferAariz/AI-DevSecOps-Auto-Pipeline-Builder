import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore, summarizeFindings } from '../server/report.js';

test('summarizes findings by severity', () => {
  const summary = summarizeFindings([
    { severity: 'critical' },
    { severity: 'critical' },
    { severity: 'high' },
    { severity: 'low' }
  ]);

  assert.deepEqual(summary, { critical: 2, high: 1, medium: 0, low: 1, unknown: 0 });
});

test('calculates clamped security score with missing controls', () => {
  const score = calculateScore([
    { severity: 'critical', source: 'trivy' },
    { severity: 'high', source: 'trivy-secret' },
    { severity: 'medium', source: 'trivy' },
    { severity: 'low', source: 'trivy' }
  ], { hasDockerfile: false, hasCiWorkflow: false });

  assert.equal(score, 35);
});
