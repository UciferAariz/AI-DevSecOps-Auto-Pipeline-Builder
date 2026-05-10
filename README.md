# AI DevSecOps Auto-Pipeline Builder

Demo SaaS-style app that accepts a public GitHub repo URL or ZIP upload, runs local security analysis, generates DevSecOps assets, scores the repo, and creates AI remediation suggestions.

## Prerequisites

- Node.js 24+
- Optional: Trivy installed and available on `PATH`
- Optional: `OPENAI_API_KEY` and `OPENAI_MODEL` for AI patch suggestions

## Run

```bash
npm install
npm run build
npm run server
```

Open `http://localhost:3000`.

For frontend-only development:

```bash
npm run dev
```

The Vite dev server proxies API requests to `http://localhost:3000`.

## Notes

- The app never writes back to the scanned repository.
- Generated files and reports are stored locally under `generated/` and `reports/`.
- If Trivy is not installed, the scanner returns an informational finding and continues.
- If OpenAI credentials are missing, the AI suggestions panel shows deterministic local guidance.
