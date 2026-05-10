import { useEffect, useMemo, useState } from 'react';

const API = '';

export default function App() {
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
  const [error, setError] = useState('');

  useEffect(() => {
    loadJobs();
    const timer = setInterval(loadJobs, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    const load = async () => {
      const job = await fetchJson(`/api/jobs/${activeJobId}`);
      setActiveJob(job);
      if (job.status === 'completed') {
        setReport(await fetchJson(`/api/jobs/${activeJobId}/report`));
        setFiles(await fetchJson(`/api/jobs/${activeJobId}/files`));
      }
    };
    load().catch((err) => setError(err.message));
    const timer = setInterval(() => load().catch((err) => setError(err.message)), 2500);
    return () => clearInterval(timer);
  }, [activeJobId]);

  useEffect(() => {
    if (!activeJobId || !selectedFile) return;
    fetch(`/api/jobs/${activeJobId}/files/${encodeURIComponent(selectedFile.path)}`)
      .then((response) => response.text())
      .then(setFileContent)
      .catch((err) => setError(err.message));
  }, [activeJobId, selectedFile]);

  const severityRows = useMemo(() => {
    const summary = report?.summary || { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    return Object.entries(summary);
  }, [report]);

  async function loadJobs() {
    const data = await fetchJson('/api/jobs');
    setJobs(data.jobs || []);
  }

  async function submitAnalysis(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setReport(null);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');

    try {
      const form = new FormData();
      if (repoUrl.trim()) form.append('repoUrl', repoUrl.trim());
      if (zipFile) form.append('zipFile', zipFile);
      const response = await fetch('/api/repos/analyze', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to start analysis.');
      setActiveJobId(data.jobId);
      await loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">DevSecOps automation</p>
          <h1>AI Auto-Pipeline Builder</h1>
        </div>
        <a className="download-link" href={activeJobId ? `/api/jobs/${activeJobId}/download` : '#'} aria-disabled={!report}>
          Download bundle
        </a>
      </section>

      <section className="layout">
        <aside className="sidebar">
          <form className="panel" onSubmit={submitAnalysis}>
            <h2>Analyze repository</h2>
            <label>
              GitHub repo URL
              <input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo" />
            </label>
            <label>
              ZIP upload
              <input type="file" accept=".zip" onChange={(event) => setZipFile(event.target.files?.[0] || null)} />
            </label>
            <button type="submit" disabled={busy || (!repoUrl.trim() && !zipFile)}>
              {busy ? 'Starting...' : 'Run security pipeline'}
            </button>
            {error ? <p className="error">{error}</p> : null}
          </form>

          <section className="panel jobs">
            <h2>Recent scans</h2>
            {jobs.length ? jobs.map((job) => (
              <button className={job.id === activeJobId ? 'job active' : 'job'} key={job.id} onClick={() => setActiveJobId(job.id)}>
                <span>{job.repoUrl || job.uploadName || job.id}</span>
                <strong>{job.status}</strong>
              </button>
            )) : <p className="muted">No scans yet.</p>}
          </section>
        </aside>

        <section className="content">
          <section className="status-grid">
            <div className="metric score">
              <span>Security score</span>
              <strong>{report ? report.score : '--'}</strong>
              <small>{activeJob?.status || 'waiting for scan'}</small>
            </div>
            {severityRows.map(([name, count]) => (
              <div className={`metric ${name}`} key={name}>
                <span>{name}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="section-title">
              <h2>Findings</h2>
              <span>{report?.projectTypes?.join(', ') || 'Project type appears after scan'}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Finding</th>
                    <th>Package/File</th>
                    <th>Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.findings || []).slice(0, 30).map((finding, index) => (
                    <tr key={`${finding.title}-${index}`}>
                      <td><span className={`pill ${finding.severity}`}>{finding.severity}</span></td>
                      <td>{finding.title}</td>
                      <td>{finding.packageName || finding.file || 'n/a'}</td>
                      <td>{finding.fixedVersion || finding.remediation}</td>
                    </tr>
                  ))}
                  {!report ? <tr><td colSpan="4">Start a scan to populate security findings.</td></tr> : null}
                  {report && !report.findings.length ? <tr><td colSpan="4">No findings reported.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="split">
            <div className="panel">
              <h2>Generated files</h2>
              <div className="file-list">
                {files.map((file) => (
                  <button key={file.path} className={selectedFile?.path === file.path ? 'file active' : 'file'} onClick={() => setSelectedFile(file)}>
                    <strong>{file.path}</strong>
                    <span>{file.description}</span>
                  </button>
                ))}
                {!files.length ? <p className="muted">Generated DevSecOps files appear after completion.</p> : null}
              </div>
            </div>

            <div className="panel file-viewer">
              <h2>{selectedFile?.path || 'File preview'}</h2>
              <pre>{fileContent || 'Select a generated file to preview its contents.'}</pre>
            </div>
          </section>

          <section className="panel">
            <h2>AI patch suggestions</h2>
            <div className="suggestions">
              {(report?.aiSuggestions || []).map((suggestion, index) => (
                <article className="suggestion" key={`${suggestion.title}-${index}`}>
                  <h3>{suggestion.title}</h3>
                  <p>{suggestion.summary}</p>
                  {suggestion.patch ? <pre>{suggestion.patch}</pre> : null}
                </article>
              ))}
              {!report ? <p className="muted">Suggestions are generated from high-risk findings and manifest snippets.</p> : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

async function fetchJson(url) {
  const response = await fetch(`${API}${url}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed: ${url}`);
  return data;
}
