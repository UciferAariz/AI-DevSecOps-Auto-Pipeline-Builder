import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { extractZipSafely, isSafeArchiveEntry } from '../server/utils.js';

test('identifies unsafe zip path traversal entries', () => {
  assert.equal(isSafeArchiveEntry('../escape.txt'), false);
  assert.equal(isSafeArchiveEntry('nested/../../escape.txt'), false);
  assert.equal(isSafeArchiveEntry('/absolute.txt'), false);
  assert.equal(isSafeArchiveEntry('safe/file.txt'), true);
});

test('extracts safe zip entries under destination', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devsecops-zip-'));
  const zipPath = path.join(dir, 'safe.zip');
  const out = path.join(dir, 'out');
  const zip = new AdmZip();
  zip.addFile('nested/file.txt', Buffer.from('ok'));
  zip.writeZip(zipPath);

  extractZipSafely(zipPath, out);
  assert.equal(fs.readFileSync(path.join(out, 'nested', 'file.txt'), 'utf8'), 'ok');
});
