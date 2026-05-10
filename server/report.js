export function summarizeFindings(findings) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const finding of findings) {
    summary[finding.severity] = (summary[finding.severity] ?? 0) + 1;
  }
  return summary;
}

export function calculateScore(findings, context) {
  const summary = summarizeFindings(findings);
  let score = 100;
  score -= summary.critical * 20;
  score -= summary.high * 10;
  score -= summary.medium * 4;
  score -= summary.low * 1;
  if (!context.hasDockerfile) score -= 10;
  if (!context.hasCiWorkflow) score -= 10;
  if (findings.some((finding) => finding.source === 'trivy-secret')) score -= 10;
  return Math.max(0, Math.min(100, score));
}

export function buildMarkdownReport(report) {
  const lines = [
    `# Security Report: ${report.repoName}`,
    '',
    `Security score: **${report.score}/100**`,
    '',
    '## Summary',
    '',
    `- Critical: ${report.summary.critical}`,
    `- High: ${report.summary.high}`,
    `- Medium: ${report.summary.medium}`,
    `- Low: ${report.summary.low}`,
    `- Unknown: ${report.summary.unknown}`,
    '',
    '## Findings',
    ''
  ];

  if (!report.findings.length) {
    lines.push('No security findings were detected by the configured scanners.', '');
  } else {
    for (const finding of report.findings.slice(0, 50)) {
      lines.push(`### ${finding.severity.toUpperCase()}: ${finding.title}`);
      lines.push(`- Source: ${finding.source}`);
      lines.push(`- Location: ${finding.file || 'n/a'}`);
      if (finding.packageName) lines.push(`- Package: ${finding.packageName}`);
      if (finding.installedVersion) lines.push(`- Installed: ${finding.installedVersion}`);
      if (finding.fixedVersion) lines.push(`- Fixed: ${finding.fixedVersion}`);
      if (finding.cveId) lines.push(`- ID: ${finding.cveId}`);
      lines.push(`- Remediation: ${finding.remediation}`);
      lines.push('');
    }
  }

  lines.push('## Generated DevSecOps Files', '');
  for (const file of report.generatedFiles) {
    lines.push(`- ${file.path}: ${file.description}`);
  }

  lines.push('', '## AI Suggestions', '');
  for (const suggestion of report.aiSuggestions) {
    lines.push(`### ${suggestion.title}`);
    lines.push(suggestion.summary);
    if (suggestion.patch) {
      lines.push('', '```diff', suggestion.patch, '```');
    }
    lines.push('');
  }

  return lines.join('\n');
}
