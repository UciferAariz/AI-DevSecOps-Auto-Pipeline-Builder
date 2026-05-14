import { Component, useEffect, useMemo, useState } from 'react';

const API = '';
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };

// ─── Error Boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Score Gauge ─────────────────────────────────────────────────────────────

function ScoreGauge({ score }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? score / 100 : 0;
  const dashOffset = circ * (1 - pct);
  const color =
    score == null ? '#94a3b8'
    : score >= 90 ? '#16a34a'
    : score >= 70 ? '#0f766e'
    : score >= 50 ? '#d97706'
    : '#b42318';
  const grade =
    score == null ? '—'
    : score >= 90 ? 'A'
    : score >= 70 ? 'B'
    : score >= 50 ? 'C'
    : score >= 30 ? 'D'
    : 'F';

  return (
    <svg className="score-svg" viewBox="0 0 100 100" width="110" height="110" aria-label={`Security score ${score ?? 'unknown'}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--gauge-track)" strokeWidth="10" />
      <circle
        cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={dashOffset}
        strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50" y="44" textAnchor="middle" fontSize="20" fontWeight="800" fill={color}>{score ?? '--'}</text>
      <text x="50" y="60" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text-muted)">{grade}</text>
    </svg>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const STEP_LABELS = {
  queued: 'Queued — waiting to start',
  downloading: 'Downloading repository…',
  extracting: 'Extracting archive…',
  detecting: 'Detecting project type…',
  scanning: 'Running Trivy security scan…',
  scoring: 'Calculating security score…',
  generating: 'Generating DevSecOps files…',
  ai_suggestions: 'Generating AI patch suggestions…',
  finalizing: 'Writing reports…',
  completed: 'Scan complete',
};

function ProgressBar({ job }) {
  if (!job || job.status === 'completed' || job.status === 'failed') return null;
  const pct = job.progress || 0;
  const label = STEP_LABELS[job.step] || job.step || 'Working…';
  return (
    <div className="progress-wrap">
      <div className="progress-label">{label}</div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-pct">{pct}%</div>
    </div>
  );
}

// ─── Simple syntax highlighter ───────────────────────────────────────────────

function highlight(code, filename) {
  if (!code) return '';
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const name = (filename || '').toLowerCase();
  const ext = name.split('.').pop();

  if (ext === 'json') return highlightJson(escaped);
  if (ext === 'yml' || ext === 'yaml') return highlightYaml(escaped);
  if (ext === 'tf') return highlightTf(escaped);
  if (name === 'dockerfile' || ext === 'dockerfile') return highlightDockerfile(escaped);
  if (ext === 'md') return highlightMd(escaped);
  return escaped;
}

function highlightJson(s) {
  return s
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="hl-key">$1</span>$2')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="hl-str">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="hl-kw">$1</span>')
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="hl-num">$1</span>');
}

function highlightYaml(s) {
  return s
    .replace(/(^|\n)(#[^\n]*)/g, '$1<span class="hl-comment">$2</span>')
    .replace(/(^|\n)(\s*)([\w-]+)(\s*:)/g, '$1$2<span class="hl-key">$3</span>$4')
    .replace(/:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, ': <span class="hl-str">$1</span>')
    .replace(/\b(true|false|null|yes|no)\b/g, '<span class="hl-kw">$1</span>');
}

function highlightTf(s) {
  return s
    .replace(/(#[^\n]*)/g, '<span class="hl-comment">$1</span>')
    .replace(/\b(resource|variable|output|module|provider|terraform|locals|data)\b/g, '<span class="hl-kw">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="hl-str">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="hl-kw">$1</span>');
}

function highlightDockerfile(s) {
  return s
    .replace(/(#[^\n]*)/g, '<span class="hl-comment">$1</span>')
    .replace(/^(FROM|RUN|CMD|ENTRYPOINT|ENV|COPY|ADD|EXPOSE|WORKDIR|ARG|LABEL|USER|VOLUME|HEALTHCHECK|SHELL|ONBUILD|STOPSIGNAL)(\s)/gm,
      '<span class="hl-kw">$1</span>$2');
}

function highlightMd(s) {
  return s
    .replace(/^(#{1,6} .+)$/gm, '<span class="hl-key">$1</span>')
    .replace(/(`[^`]+`)/g, '<span class="hl-str">$1</span>')
    .replace(/^([-*+] .+)$/gm, '<span class="hl-num">$1</span>');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jobDisplayName(job) {
  const raw = job.repoUrl || job.uploadName || job.id;
  if (raw.includes('github.com/')) {
    const after = raw.split('github.com/')[1] || '';
    const parts = after.split('/').filter(Boolean);
    return parts.slice(0, 2).join('/') || raw;
  }
  return raw.length > 32 ? raw.slice(0, 30) + '…' : raw;
}

function scoreColor(score) {
  if (score == null) return '';
  if (score >= 90) return 'score-a';
  if (score >= 70) return 'score-b';
  if (score >= 50) return 'score-c';
  return 'score-d';
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [repoUrl, setRepoUrl] = useState('');
  const [zipFile, setZipFile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [report, setReport] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');   // only shown under the form
  const [pollingError, setPollingError] = useState(''); // shown in main content
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('severity');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedRow, setExpandedRow] = useState(null);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [copied, setCopied] = useState('');

  // Apply / persist dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Poll jobs list every 3 s
  useEffect(() => {
    loadJobs();
    const timer = setInterval(loadJobs, 3000);
    return () => clearInterval(timer);
  }, []);

  // Poll active job every 2.5 s
  useEffect(() => {
    if (!activeJobId) return;
    setPollingError('');
    let settled = false; // stop retrying once report is loaded or permanently unavailable
    const load = async () => {
      const job = await fetchJson(`/api/jobs/${activeJobId}`);
      setActiveJob(job);
      if (job.status === 'completed' && !settled) {
        try {
          const [rep, fls] = await Promise.all([
            fetchJson(`/api/jobs/${activeJobId}/report`),
            fetchJson(`/api/jobs/${activeJobId}/files`),
          ]);
          setReport(rep);
          setFiles(fls);
          setShowAllFindings(false);
          setSeverityFilter('all');
          settled = true;
        } catch {
          // Report files may not exist (server restarted / files cleared).
          // Show a soft notice rather than a red error banner.
          setPollingError('report-missing');
          settled = true;
        }
      }
      if (job.status === 'failed') settled = true;
    };
    load().catch((err) => setPollingError(err.message));
    const timer = setInterval(() => {
      if (!settled) load().catch((err) => setPollingError(err.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [activeJobId]);

  // Load file content when selection changes
  useEffect(() => {
    if (!activeJobId || !selectedFile) return;
    fetch(`/api/jobs/${activeJobId}/files/${encodeURIComponent(selectedFile.path)}`)
      .then((r) => r.text())
      .then(setFileContent)
      .catch(() => setFileContent('// File content unavailable.'));
  }, [activeJobId, selectedFile]);

  const severityRows = useMemo(() => {
    const summary = report?.summary || { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    return Object.entries(summary);
  }, [report]);

  // Filtered + sorted findings
  const filteredFindings = useMemo(() => {
    let items = report?.findings || [];
    if (severityFilter !== 'all') items = items.filter((f) => f.severity === severityFilter);
    return [...items].sort((a, b) => {
      let diff = 0;
      if (sortBy === 'severity') diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      else if (sortBy === 'title') diff = a.title.localeCompare(b.title);
      else if (sortBy === 'package') {
        diff = (a.packageName || a.file || '').localeCompare(b.packageName || b.file || '');
      }
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [report, severityFilter, sortBy, sortDir]);

  const displayedFindings = showAllFindings ? filteredFindings : filteredFindings.slice(0, 30);
  const trivyMissing = report?.findings?.some((f) => f.toolError === 'trivy-not-installed');

  async function loadJobs() {
    const data = await fetchJson('/api/jobs');
    setJobs(data.jobs || []);
  }

  async function submitAnalysis(event) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    setPollingError('');
    setReport(null);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setExpandedRow(null);

    try {
      const form = new FormData();
      if (repoUrl.trim()) form.append('repoUrl', repoUrl.trim());
      if (zipFile) form.append('zipFile', zipFile);
      const response = await fetch('/api/repos/analyze', { method: 'POST', body: form });
      if (!response.ok) {
        let msg = 'Unable to start analysis.';
        try { msg = (await response.json()).error || msg; } catch { /* non-JSON error page */ }
        throw new Error(msg);
      }
      const data = await response.json();
      setActiveJobId(data.jobId);
      await loadJobs();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }

  function SortIcon({ col }) {
    if (sortBy !== col) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  async function handleCopy(text, key) {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    }
  }

  const hasActiveResult = report || (activeJob && activeJob.status === 'running');

  return (
    <ErrorBoundary>
      <main className="app-shell">
        {/* ── Top bar ───────────────────────────────────────────────── */}
        <section className="topbar">
          <div>
            <p className="eyebrow">DevSecOps automation</p>
            <h1>AI Auto-Pipeline Builder</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="btn-ghost"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Toggle dark mode"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? '☀ Light' : '☾ Dark'}
            </button>
            <a
              className="download-link"
              href={activeJobId && report ? `/api/jobs/${activeJobId}/download` : '#'}
              aria-disabled={!report}
            >
              ↓ Download bundle
            </a>
          </div>
        </section>

        <section className="layout">
          {/* ── Sidebar ───────────────────────────────────────────────── */}
          <aside className="sidebar">
            <form className="panel" onSubmit={submitAnalysis}>
              <h2>Analyze repository</h2>
              <label>
                GitHub repo URL
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                />
              </label>
              <label>
                ZIP upload
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                />
              </label>
              <button type="submit" disabled={busy || (!repoUrl.trim() && !zipFile)}>
                {busy ? 'Starting…' : 'Run security pipeline'}
              </button>
              {formError ? <p className="error">{formError}</p> : null}
            </form>

            <section className="panel jobs">
              <h2>Recent scans</h2>
              {jobs.length ? jobs.map((job) => (
                <button
                  className={`job${job.id === activeJobId ? ' active' : ''}`}
                  key={job.id}
                  onClick={() => { setActiveJobId(job.id); setReport(null); setFiles([]); setSelectedFile(null); setFileContent(''); }}
                >
                  <span className="job-name">{jobDisplayName(job)}</span>
                  <div className="job-meta">
                    <strong className={`job-status status-${job.status}`}>{job.status}</strong>
                    {job.score != null && (
                      <span className={`job-score-badge ${scoreColor(job.score)}`}>{job.score}</span>
                    )}
                  </div>
                  {job.status === 'running' && job.progress != null && (
                    <div className="job-progress-mini">
                      <div className="job-progress-mini-fill" style={{ width: `${job.progress}%` }} />
                    </div>
                  )}
                  {job.status === 'completed' && (
                    <a
                      className="job-download-link"
                      href={`/api/jobs/${job.id}/download`}
                      onClick={(e) => e.stopPropagation()}
                      title="Download bundle"
                    >
                      ↓ Download
                    </a>
                  )}
                </button>
              )) : <p className="muted">No scans yet.</p>}
            </section>
          </aside>

          {/* ── Main content ──────────────────────────────────────────── */}
          <section className="content">
            {/* Polling error (report/files fetch failures) */}
            {pollingError === 'report-missing' ? (
              <div className="banner banner-warn">
                <strong>Report files not found</strong> — this scan's data was cleared when the server restarted.
                Run a new scan to generate fresh results.
              </div>
            ) : pollingError ? (
              <div className="banner banner-error">
                <strong>Failed to load results</strong> — {pollingError}
              </div>
            ) : null}

            {/* Trivy warning */}
            {trivyMissing && (
              <div className="banner banner-warn">
                <strong>⚠ Trivy not detected</strong> — install Trivy and add it to PATH for real vulnerability, secrets, and IaC scanning.
                Results shown are placeholders only.
              </div>
            )}

            {/* Empty state */}
            {!hasActiveResult && !report && (
              <div className="empty-state">
                <div className="empty-icon">🔒</div>
                <h2>Scan a repository to get started</h2>
                <p>Paste a public GitHub URL or upload a ZIP file. The pipeline will:</p>
                <ul>
                  <li>Run a Trivy vulnerability, secrets &amp; IaC scan</li>
                  <li>Generate a hardened Dockerfile, CI/CD workflow, K8s manifests &amp; Terraform</li>
                  <li>Produce an AI-powered remediation report</li>
                </ul>
              </div>
            )}

            {/* Progress bar */}
            {activeJob && activeJob.status === 'running' && (
              <div className="panel">
                <ProgressBar job={activeJob} />
              </div>
            )}

            {/* Metrics grid */}
            {(report || activeJob) && (
              <section className="status-grid">
                <div className="metric score-metric">
                  <span>Security score</span>
                  <ScoreGauge score={report?.score ?? activeJob?.score ?? null} />
                  <small>{activeJob?.status === 'running' ? 'Scanning…' : activeJob?.status || 'waiting'}</small>
                </div>
                {severityRows.map(([name, count]) => (
                  <div className={`metric ${name}`} key={name}>
                    <span>{name}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </section>
            )}

            {/* Findings */}
            {(report || activeJob) && (
              <section className="panel">
                <div className="section-title">
                  <h2>Findings</h2>
                  <span>{report?.projectTypes?.join(', ') || 'Project type appears after scan'}</span>
                </div>

                {/* Severity filter chips */}
                {report && (
                  <div className="filter-chips">
                    {['all', 'critical', 'high', 'medium', 'low', 'unknown'].map((sev) => {
                      const count = sev === 'all'
                        ? report.findings.length
                        : (report.summary[sev] || 0);
                      return (
                        <button
                          key={sev}
                          className={`chip chip-${sev}${severityFilter === sev ? ' chip-active' : ''}`}
                          onClick={() => { setSeverityFilter(sev); setShowAllFindings(false); setExpandedRow(null); }}
                        >
                          {sev === 'all' ? 'All' : sev} <span className="chip-count">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => toggleSort('severity')}>
                          Severity <SortIcon col="severity" />
                        </th>
                        <th className="sortable" onClick={() => toggleSort('title')}>
                          Finding <SortIcon col="title" />
                        </th>
                        <th className="sortable" onClick={() => toggleSort('package')}>
                          Package / File <SortIcon col="package" />
                        </th>
                        <th>Fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedFindings.map((finding, i) => (
                        <>
                          <tr
                            key={`${finding.title}-${i}`}
                            className={`finding-row${expandedRow === i ? ' expanded' : ''}`}
                            onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                          >
                            <td><span className={`pill ${finding.severity}`}>{finding.severity}</span></td>
                            <td>{finding.title}</td>
                            <td className="col-package">{finding.packageName || finding.file || 'n/a'}</td>
                            <td>{finding.fixedVersion || finding.remediation || '—'}</td>
                          </tr>
                          {expandedRow === i && (
                            <tr key={`${finding.title}-${i}-detail`} className="finding-detail">
                              <td colSpan="4">
                                <div className="finding-detail-inner">
                                  {finding.cveId && <p><strong>CVE ID:</strong> {finding.cveId}</p>}
                                  {finding.installedVersion && <p><strong>Installed version:</strong> {finding.installedVersion}</p>}
                                  {finding.fixedVersion && <p><strong>Fixed in:</strong> {finding.fixedVersion}</p>}
                                  <p><strong>Remediation:</strong> {finding.remediation}</p>
                                  {finding.source && <p><strong>Scanner:</strong> {finding.source}</p>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                      {!report && (
                        <tr><td colSpan="4" className="muted">Start a scan to populate security findings.</td></tr>
                      )}
                      {report && filteredFindings.length === 0 && (
                        <tr><td colSpan="4" className="muted">No findings for this filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredFindings.length > 30 && (
                  <button
                    className="btn-ghost show-more"
                    onClick={() => setShowAllFindings((v) => !v)}
                  >
                    {showAllFindings
                      ? 'Show fewer findings'
                      : `Show all ${filteredFindings.length} findings`}
                  </button>
                )}
              </section>
            )}

            {/* Generated files + preview */}
            {(files.length > 0 || report) && (
              <section className="split">
                <div className="panel">
                  <h2>Generated files</h2>
                  <div className="file-list">
                    {files.map((file) => (
                      <button
                        key={file.path}
                        className={`file${selectedFile?.path === file.path ? ' active' : ''}`}
                        onClick={() => setSelectedFile(file)}
                      >
                        <strong>{file.path}</strong>
                        <span>{file.description}</span>
                      </button>
                    ))}
                    {!files.length && <p className="muted">Generated DevSecOps files appear after completion.</p>}
                  </div>
                </div>

                <div className="panel file-viewer">
                  <div className="panel-header">
                    <h2>{selectedFile?.path || 'File preview'}</h2>
                    {fileContent && (
                      <button
                        className="btn-copy"
                        onClick={() => handleCopy(fileContent, 'file')}
                        title="Copy to clipboard"
                      >
                        {copied === 'file' ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  {fileContent
                    ? (
                      <pre
                        className="code-block"
                        dangerouslySetInnerHTML={{ __html: highlight(fileContent, selectedFile?.path) }}
                      />
                    )
                    : <pre className="code-block muted">Select a generated file to preview its contents.</pre>
                  }
                </div>
              </section>
            )}

            {/* AI patch suggestions */}
            {report && (
              <section className="panel">
                <h2>AI patch suggestions</h2>
                <div className="suggestions">
                  {(report.aiSuggestions || []).map((suggestion, i) => (
                    <article className="suggestion" key={`${suggestion.title}-${i}`}>
                      <div className="suggestion-header">
                        <h3>{suggestion.title}</h3>
                        {suggestion.severity && (
                          <span className={`pill ${suggestion.severity}`}>{suggestion.severity}</span>
                        )}
                      </div>
                      <p>{suggestion.summary}</p>
                      {suggestion.patch && (
                        <>
                          <div className="code-header">
                            <span>Patch</span>
                            <button
                              className="btn-copy"
                              onClick={() => handleCopy(suggestion.patch, `patch-${i}`)}
                            >
                              {copied === `patch-${i}` ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="code-block diff">{suggestion.patch}</pre>
                        </>
                      )}
                    </article>
                  ))}
                  {!report.aiSuggestions?.length && (
                    <p className="muted">No AI suggestions were generated for this scan.</p>
                  )}
                </div>
              </section>
            )}

            {!hasActiveResult && !report && null}
          </section>
        </section>
      </main>
    </ErrorBoundary>
  );
}

async function fetchJson(url) {
  const response = await fetch(`${API}${url}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed: ${url}`);
  return data;
}
