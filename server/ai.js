import OpenAI from 'openai';

export async function generateAiSuggestions(reportInput) {
  const fallback = fallbackSuggestions(reportInput.findings);
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    return fallback;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const payload = {
    repoName: reportInput.repoName,
    projectTypes: reportInput.projectTypes,
    score: reportInput.score,
    findings: reportInput.findings.slice(0, 10),
    dependencies: reportInput.dependencies.slice(0, 25),
    manifests: reportInput.manifestSnippets
  };

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL,
      instructions: [
        'You are a senior DevSecOps engineer.',
        'Return only JSON with this shape: {"suggestions":[{"title":"...","summary":"...","patch":"diff-style patch or command block"}]}.',
        'Do not invent repository files that were not included in the manifest snippets.',
        'Prefer concrete dependency upgrades, Docker hardening, CI gates, and secret handling guidance.',
        'Never include secrets or ask to auto-commit changes.'
      ].join(' '),
      input: JSON.stringify(payload),
      max_output_tokens: 1800
    });

    const text = response.output_text || '';
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.suggestions)) {
      return parsed.suggestions.slice(0, 6).map((suggestion) => ({
        title: String(suggestion.title || 'AI remediation suggestion'),
        summary: String(suggestion.summary || ''),
        patch: String(suggestion.patch || '')
      }));
    }
  } catch (error) {
    return [
      {
        title: 'AI suggestions unavailable',
        summary: `OpenAI request failed, so local deterministic guidance was used. Reason: ${error.message}`,
        patch: ''
      },
      ...fallback
    ];
  }

  return fallback;
}

function fallbackSuggestions(findings) {
  const top = findings.filter((finding) => ['critical', 'high'].includes(finding.severity)).slice(0, 5);
  if (!top.length) {
    return [{
      title: 'Keep scan gates active',
      summary: 'No critical or high findings were available for AI patch generation. Keep generated Trivy gates enabled in CI.',
      patch: 'No patch required.'
    }];
  }
  return top.map((finding) => ({
    title: `Remediate ${finding.title}`,
    summary: finding.remediation,
    patch: finding.packageName && finding.fixedVersion
      ? `- ${finding.packageName}@${finding.installedVersion || 'current'}\n+ ${finding.packageName}@${finding.fixedVersion}`
      : `# Review ${finding.file || 'affected file'}\n# Apply remediation: ${finding.remediation}`
  }));
}
