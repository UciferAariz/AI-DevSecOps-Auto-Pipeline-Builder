import fs from 'node:fs';
import path from 'node:path';
import { getJob, setJobStatus, setJobProgress, setJobScore } from './db.js';
import { calculateScore, summarizeFindings, buildMarkdownReport } from './report.js';
import { analyzeDependencies, detectProject, runTrivy } from './scanners.js';
import { generateDevSecOpsFiles } from './generators.js';
import { generateAiSuggestions } from './ai.js';
import { downloadFile, extractZipSafely, findRepoRoot, githubZipUrl } from './utils.js';

export async function runJob(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  setJobStatus(jobId, 'running');
  setJobProgress(jobId, 'downloading', 5);

  const workspaceDir = path.join(process.cwd(), 'workspaces', jobId);
  const archivePath = path.join(process.cwd(), 'uploads', `${jobId}.zip`);
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  let repoName = job.uploadName ? job.uploadName.replace(/\.zip$/i, '') : 'uploaded-repo';
  if (job.repoUrl) {
    const github = githubZipUrl(job.repoUrl);
    repoName = github.repoName;
    try {
      await downloadFile(github.url, archivePath);
    } catch {
      await downloadFile(github.fallbackUrl, archivePath);
    }
    setJobProgress(jobId, 'extracting', 18);
    extractZipSafely(archivePath, workspaceDir);
  } else {
    setJobProgress(jobId, 'extracting', 18);
    extractZipSafely(job.uploadPath, workspaceDir);
  }

  setJobProgress(jobId, 'detecting', 30);
  const repoRoot = findRepoRoot(workspaceDir);
  const detection = detectProject(repoRoot);
  const dependencies = analyzeDependencies(repoRoot, detection.manifests);

  setJobProgress(jobId, 'scanning', 45);
  const findings = await runTrivy(repoRoot);

  setJobProgress(jobId, 'scoring', 62);
  const context = { ...detection, repoName };
  const score = calculateScore(findings, context);
  setJobScore(jobId, score);

  setJobProgress(jobId, 'generating', 72);
  const generatedFiles = generateDevSecOpsFiles(jobId, context);
  const reportFileEntries = [
    { path: 'security-report.md', description: 'Markdown report for executive and engineering review.' },
    { path: 'security-report.json', description: 'Normalized machine-readable security report.' }
  ];
  const reportDir = path.join(process.cwd(), 'reports', jobId);
  fs.mkdirSync(reportDir, { recursive: true });

  const baseReport = {
    jobId,
    repoName,
    projectTypes: detection.projectTypes,
    score,
    summary: summarizeFindings(findings),
    findings,
    dependencies,
    generatedFiles: [...generatedFiles, ...reportFileEntries],
    aiSuggestions: []
  };

  setJobProgress(jobId, 'ai_suggestions', 85);
  baseReport.aiSuggestions = await generateAiSuggestions({
    ...baseReport,
    manifestSnippets: readManifestSnippets(repoRoot, detection.manifests)
  });

  setJobProgress(jobId, 'finalizing', 96);
  fs.writeFileSync(path.join(reportDir, 'security-report.json'), JSON.stringify(baseReport, null, 2));
  fs.writeFileSync(path.join(reportDir, 'security-report.md'), buildMarkdownReport(baseReport));
  fs.copyFileSync(path.join(reportDir, 'security-report.json'), path.join(process.cwd(), 'generated', jobId, 'security-report.json'));
  fs.copyFileSync(path.join(reportDir, 'security-report.md'), path.join(process.cwd(), 'generated', jobId, 'security-report.md'));
  fs.writeFileSync(
    path.join(process.cwd(), 'generated', jobId, 'generated-files.json'),
    JSON.stringify(baseReport.generatedFiles, null, 2)
  );

  setJobProgress(jobId, 'completed', 100);
  setJobStatus(jobId, 'completed');
}

function readManifestSnippets(root, manifests) {
  const snippets = {};
  for (const manifest of manifests.slice(0, 8)) {
    const content = fs.readFileSync(path.join(root, manifest), 'utf8');
    snippets[manifest] = content.slice(0, 5000);
  }
  return snippets;
}
