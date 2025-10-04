# Jira Sprint MCP Server

Automates Jira epic reporting, extracts dashboards, and generates sprint-ready Excel workbooks enriched with GPT-assisted narratives. Provides both a CLI toolset and an Express server for Jira API exposure and webhook intake.

## Prerequisites

- Node.js 18+
- Jira Cloud account with REST API access
- OpenAI API key (for GPT summaries); optional but recommended
- Atlassian API token for the configured Jira user

## Installation

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```
JIRA_BASE_URL=https://<your-domain>.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=<jira-api-token>
OPENAI_API_KEY=<openai-api-key>
PROJECT_KEY=<default-project-key>
# Optional
CORS_ORIGIN=http://localhost:3000
PORT=4000
```

> Replace tokens immediately if they were ever committed. Git push protection flagged the initial `.env`; history has been rewritten, but rotating credentials is strongly advised.

## Scripts

- `npm run dev` – Run CLI commands with ts-node
- `npm run build` – Compile TypeScript to `dist`
- `npm start` – Boot the HTTP server (expects prior `npm run build`)
- `npm run typecheck` – Validate types without emitting JS

## CLI Usage

Invoke through `npm run dev -- <command>` or run compiled JS from `dist/index.js`. Commands support optional `--out` to persist JSON payloads.

### Jira Discovery Commands

- `whoami` – Verify credentials by fetching the authenticated Jira user
- `dashboards` – List visible dashboards
- `epics` – Fetch epics for `PROJECT_KEY`; accepts `--fields`, `--max`, `--start`
- `tasks` – Fetch Jira Task issues for `PROJECT_KEY`
- `issues --jql "..."` – Run arbitrary JQL searches; accepts `--fields`, pagination options
- `worklog <issueKey>` – Pull worklogs for a single issue
- `epic-issues <epic>` – Retrieve child issues; supports `--summary`, `--tasks`, `--comments`, `--assignee`

### Sprint Report Command (Core Value)

- `fill-template <epic>` – Clones the sprint template Excel workbook, enriches it with epic tasks, and populates roster, work distribution, due dates, and AI-generated narratives.
  - `--out` – Destination XLSX path (defaults to `outputs/epic-<KEY>-filled.xlsx`)
  - `--max` – Limit number of tasks pulled (default 20)
  - `--yes` – Skip overwrite prompt if file exists
  - `--noGPT` – Disable GPT usage; falls back to deterministic summaries

**Why it matters:** The Excel report synthesizes Jira data into the sprint artifact required by leadership. GPT-generated sections (balanced workload, due-date strategy, timeliness, adherence, rework narrative, and member performance) convert raw metrics into review-ready insights, turning hours of manual summarization into a single command. Missing or outdated reports block sprint acceptance; keeping them current is critical.

## HTTP Server

Run with:

```bash
npm run build
npm start
```

Endpoints (serves JSON):

- `GET /api/jira/myself` – Health/auth check
- `GET /api/jira/dashboards`
- `GET /api/jira/issues?jql=...&fields=...`
- `GET /api/jira/issues/:key/worklog`
- `GET /api/jira/tasks/:taskId` – Long-running background task info
- `POST /webhook/jira` – Receives Jira webhooks (logs payload, extend as needed)

Expose locally via ngrok if Jira must reach webhooks. Respect rate limits; the client auto-times out after 20s.

## Reports Workflow

1. Configure `.env` with Jira/OpenAI creds and default `PROJECT_KEY`
2. Run `npm run dev -- fill-template <EPIC-KEY>`
3. Inspect generated `outputs/epic-<KEY>-filled.xlsx`
4. Distribute to stakeholders or upload to shared drive
5. Optionally commit sanitized snapshots under version control (without secrets)

Ensure comments and time tracking in Jira stay current—the AI summaries rely on that data. Consider scheduling the command post-standup to capture latest progress.

## Webhook Integration Roadmap

- `POST /webhook/jira` currently logs events; extend to trigger auto-regeneration or push notifications.
- For production, persist webhook events (queue/DB) and gate template rebuilds on change detection.

## Troubleshooting

- Authentication failures: verify Jira token and base URL; run `npm run dev -- whoami`
- Missing OpenAI key: use `--noGPT` flag to bypass summaries, but prioritize restoring AI access since leadership depends on narrative insights
- Push blocked by secrets: ensure `.env` stays local; rotate tokens after accidental exposure

## Contributing

1. Fork & clone
2. Create feature branch
3. Keep `.env` out of commits (`.gitignore` covers it)`
4. Submit PR with context on workflow impact—focus on improving report accuracy or turnaround time


