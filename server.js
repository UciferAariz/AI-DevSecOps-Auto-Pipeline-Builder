import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, createJob, getJob, listJobs, setJobStatus } from './server/db.js';
import { ensureRuntimeDirs, safeGeneratedPath, zipDirectory } from './server/utils.js';
import { runJob } from './server/worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 50);

// Warn about missing optional configuration at startup
if (!process.env.OPENAI_API_KEY) {
  console.warn('[warn] OPENAI_API_KEY is not set — AI patch suggestions will use deterministic fallbacks instead of GPT.');
}
if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN) {
  console.warn('[warn] APP_ORIGIN is not set in production — CORS will allow all origins.');
}

ensureRuntimeDirs();
initDb();

// Simple in-memory rate limiter (no external dep required)
const rateLimitStore = new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count++;
    rateLimitStore.set(key, entry);
    if (entry.count > maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment before retrying.' });
      return;
    }
    next();
  };
}

const app = express();
const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

app.use(cors({ origin: process.env.APP_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/jobs', (req, res) => {
  res.json({ jobs: listJobs() });
});

// Rate-limit analysis endpoint: 10 requests per 60 seconds per IP
app.post('/api/repos/analyze', rateLimit(10, 60_000), upload.single('zipFile'), async (req, res) => {
  const repoUrl = typeof req.body.repoUrl === 'string' ? req.body.repoUrl.trim() : '';
  const zipPath = req.file?.path;

  if (!repoUrl && !zipPath) {
    res.status(400).json({ error: 'Provide a public GitHub repo URL or ZIP file.' });
    return;
  }

  // Basic GitHub URL validation when a URL is provided
  if (repoUrl && !/^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/.test(repoUrl)) {
    res.status(400).json({ error: 'Please provide a valid public GitHub repository URL (e.g. https://github.com/owner/repo).' });
    return;
  }

  const job = createJob({ repoUrl, uploadPath: zipPath, uploadName: req.file?.originalname || null });
  res.status(202).json({ jobId: job.id });

  runJob(job.id).catch((error) => {
    setJobStatus(job.id, 'failed', error.stack || String(error));
  });
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }
  res.json(job);
});

app.get('/api/jobs/:jobId/report', (req, res) => {
  const reportPath = path.join(process.cwd(), 'reports', req.params.jobId, 'security-report.json');
  if (!fs.existsSync(reportPath)) {
    res.status(404).json({ error: 'Report is not ready.' });
    return;
  }
  res.sendFile(reportPath);
});

app.get('/api/jobs/:jobId/files', (req, res) => {
  const manifestPath = path.join(process.cwd(), 'generated', req.params.jobId, 'generated-files.json');
  if (!fs.existsSync(manifestPath)) {
    res.status(404).json({ error: 'Generated files are not ready.' });
    return;
  }
  res.sendFile(manifestPath);
});

app.get(/^\/api\/jobs\/([^/]+)\/files\/(.+)$/, (req, res) => {
  const jobId = req.params[0];
  const encodedFilePath = req.params[1];
  const filePath = decodeURIComponent(encodedFilePath);
  const resolved = safeGeneratedPath(jobId, filePath);
  if (!resolved || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Generated file not found.' });
    return;
  }
  res.type('text/plain').send(fs.readFileSync(resolved, 'utf8'));
});

app.get('/api/jobs/:jobId/download', (req, res) => {
  const generatedDir = path.join(process.cwd(), 'generated', req.params.jobId);
  const reportDir = path.join(process.cwd(), 'reports', req.params.jobId);
  if (!fs.existsSync(generatedDir) || !fs.existsSync(reportDir)) {
    res.status(404).json({ error: 'Download bundle is not ready.' });
    return;
  }

  const zip = zipDirectory(generatedDir, 'generated');
  zip.addLocalFolder(reportDir, 'reports');
  const buffer = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="devsecops-${req.params.jobId}.zip"`);
  res.send(buffer);
});

app.get(/.*/, (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }
  res.status(503).send('Frontend build not found. Run npm run build, then restart the server.');
});

app.listen(PORT, () => {
  console.log(`AI DevSecOps Auto-Pipeline Builder running at http://localhost:${PORT}`);
});
