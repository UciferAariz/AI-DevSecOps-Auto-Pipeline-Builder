import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dbPath = path.join(process.cwd(), '.data', 'jobs.sqlite');
let db;

export function initDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      repo_url TEXT,
      upload_path TEXT,
      upload_name TEXT,
      status TEXT NOT NULL,
      step TEXT,
      progress INTEGER DEFAULT 0,
      score INTEGER,
      report_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // Migrate existing databases
  try { db.exec('ALTER TABLE jobs ADD COLUMN step TEXT'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE jobs ADD COLUMN progress INTEGER DEFAULT 0'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE jobs ADD COLUMN score INTEGER'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE jobs ADD COLUMN report_json TEXT'); } catch { /* exists */ }
}

export function createJob({ repoUrl, uploadPath, uploadName }) {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO jobs (id, repo_url, upload_path, upload_name, status, step, progress, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', 'queued', 0, ?, ?)
  `).run(id, repoUrl || null, uploadPath || null, uploadName || null, now, now);
  return getJob(id);
}

export function getJob(id) {
  return db.prepare(`
    SELECT
      id,
      repo_url AS repoUrl,
      upload_path AS uploadPath,
      upload_name AS uploadName,
      status,
      step,
      progress,
      score,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM jobs
    WHERE id = ?
  `).get(id);
}

export function getJobReport(id) {
  const row = db.prepare(`SELECT report_json FROM jobs WHERE id = ?`).get(id);
  if (!row?.report_json) return null;
  try { return JSON.parse(row.report_json); } catch { return null; }
}

export function listJobs() {
  return db.prepare(`
    SELECT
      id,
      repo_url AS repoUrl,
      upload_name AS uploadName,
      status,
      step,
      progress,
      score,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM jobs
    ORDER BY created_at DESC
    LIMIT 20
  `).all();
}

export function setJobStatus(id, status, error = null) {
  db.prepare(`
    UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?
  `).run(status, error, new Date().toISOString(), id);
}

export function setJobProgress(id, step, progress) {
  db.prepare(`
    UPDATE jobs SET step = ?, progress = ?, updated_at = ? WHERE id = ?
  `).run(step, progress, new Date().toISOString(), id);
}

export function setJobScore(id, score) {
  db.prepare(`
    UPDATE jobs SET score = ?, updated_at = ? WHERE id = ?
  `).run(score, new Date().toISOString(), id);
}

export function setJobReport(id, reportObject) {
  db.prepare(`
    UPDATE jobs SET report_json = ?, updated_at = ? WHERE id = ?
  `).run(JSON.stringify(reportObject), new Date().toISOString(), id);
}
