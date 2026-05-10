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
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export function createJob({ repoUrl, uploadPath, uploadName }) {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO jobs (id, repo_url, upload_path, upload_name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', ?, ?)
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
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM jobs
    WHERE id = ?
  `).get(id);
}

export function listJobs() {
  return db.prepare(`
    SELECT
      id,
      repo_url AS repoUrl,
      upload_name AS uploadName,
      status,
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
    UPDATE jobs
    SET status = ?, error = ?, updated_at = ?
    WHERE id = ?
  `).run(status, error, new Date().toISOString(), id);
}
