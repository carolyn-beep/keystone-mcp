# Brainlift MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that lets any MCP-compatible AI agent work with Brainlifts programmatically — create them, grade them, curate them, and drive a 30-day execution sprint. Built as a Cloudflare Worker with Google OAuth, backed by the DOK1Grader platform.

## Two server variants

This repo ships two workers from the same codebase:

| Worker | Entrypoint | Toolset | Intended user |
|---|---|---|---|
| `brainlift-mcp` | `src/index.ts` | Brainlift CRUD, grading, DOK-item curation | General MCP clients — authors building and grading Brainlifts |
| `brainlift-mcp-student` | `src/index.student.ts` | All of the above plus 30-day sprint planning and deliverables | Students going through the Scope Breaker sprint flow with a coach-agent |

The student variant composes the general Brainlift instructions with a sprint-specific coaching appendix and registers the additional sprint tools.

## What it does

An AI agent connects via MCP, authenticates with Google, and gets access to the tools listed below. The agent never talks to DOK1Grader directly — the MCP server handles auth, user provisioning, and API communication behind the scenes.

### Shared tools (both variants)

| Tool | Description | Pattern |
|------|-------------|---------|
| `get_template` | Returns the Brainlift markdown template with format rules and quality guidelines | Synchronous |
| `grade_brainlift` | Submits markdown for grading, returns a slug to track progress | Fire-and-forget |
| `list_brainlifts` | Lists the user's brainlifts with slugs, scores, and status | Paginated |
| `get_brainlift_assessment` | Returns grading status or per-DOK-level results | Paginated poll |
| `create_dok1` / `create_dok2` / `create_dok3` / `create_dok4` | Append a new item to an existing graded brainlift | Fire-and-forget |
| `edit_dok_item` | Edit an existing DOK item; retriggers grading | Fire-and-forget |
| `delete_dok_item` | Delete a DOK item; cascades staleness to linked downstream items | Synchronous |
| `link_dok3` / `link_dok4` | Link newly-created DOK2s / DOK3s to an existing DOK3 / DOK4 item | Synchronous |
| `get_stale_items` | List items flagged stale after upstream edits | Paginated |
| `dismiss_stale` | Mark a stale item as still valid without editing it | Synchronous |

### Student-only tools

| Tool | Description | Pattern |
|------|-------------|---------|
| `generate_plan` | Kick off a 30-day sprint plan after a short diagnosis conversation; returns immediately with a `generating` plan | Async (background job) |
| `get_plan` | Poll plan status (`generating` / `active` / `failed`) and read the active plan | Synchronous |
| `list_tasks` | Surface today's tasks plus overdue items for the active plan | Synchronous |
| `get_task` | Full task detail including stage, milestone flag, and deliverable status | Synchronous |
| `save_deliverable` | Create a Google Doc deliverable for a task | Synchronous |
| `read_deliverable` | Read the current contents of a task's deliverable | Synchronous |
| `update_deliverable` | Replace the contents of a deliverable with new markdown | Synchronous |
| `list_deliverables` | List all deliverables across plans for a brainlift | Paginated |

## Architecture

```
                          Google OAuth
  MCP Client  <------------------------------>  Brainlift MCP
  (AI Agent)          MCP Protocol              (Cloudflare Worker)
                                                      |
                                              Service API Key +
                                              User email header
                                                      |
                                                DOK1Grader
                                                Internal API
                                                /api/internal/*
```

**Two repos, two deployment targets:**

- **This repo** (`brainlift-mcp/`) -- Cloudflare Worker. Handles MCP protocol, Google OAuth, tool dispatch, and response formatting.
- **DOK1GraderV3** -- Node/Express on Render. Handles parsing, extraction, grading pipeline, and data storage. Exposes `/api/internal/*` endpoints behind service API key auth.

The MCP server is a thin orchestration layer. All grading logic lives in DOK1Grader.

## Auth flow

1. AI agent connects to MCP server
2. MCP redirects to Google OAuth (scopes: `openid email profile`)
3. User consents, MCP stores Google profile (name, email) as Durable Object props
4. On each tool call, MCP sends to DOK1Grader:
   - `X-Service-Key` header (validates the MCP server itself)
   - `X-User-Email` / `X-User-Name` headers (identifies the end user)
5. DOK1Grader's `requireServiceAuth` middleware validates the key, finds or creates the user, and sets auth context as if they logged in natively

Users who arrive via MCP and later sign into the web UI with the same Google account merge seamlessly -- same email, same user.

## Grading workflow

The fire-and-forget pattern avoids long-lived connections:

```
Agent --> grade_brainlift(markdown)
      --> MCP --> POST /api/internal/grade
                  |
                  +-- Parse markdown (sync)
                  +-- Extract DOK levels (sync)
                  +-- Queue grading pipeline (async)
                  +-- Return { slug, status: 'grading' }

Agent --> get_brainlift_assessment(slug, statusOnly=true)   // poll
      --> MCP --> GET /api/internal/brainlifts/:slug/status
                  +-- Return { progress: { dok1: 35/42, ... }, retryAfter: 15 }

Agent --> get_brainlift_assessment(slug, dok=1)             // read results
      --> MCP --> GET /api/internal/brainlifts/:slug/assessment?dok=1
                  +-- Return paginated facts with scores and feedback
```

## Agent-first design

Everything about this server is designed for AI agent consumption, not humans.

**Server instructions** -- The MCP `instructions` field (sent on connection) tells agents what a Brainlift is, why less is more, and the exact workflow to follow. Agents read this before calling any tool.

**Human-readable responses** -- Tools return formatted text, not JSON. An agent sees:

```
DOK1 Assessment (Page 1 of 3, 42 total facts)

1. [Score: 4/5] "The Supreme Court ruled unanimously in Alston v. NCAA (2021)..."
   Source: NCAA NIL Policy Guidelines
   Note: Verified against source. Claim is accurate and well-sourced.
```

Not `{"score":4,"fact":"The Supreme Court..."}`.

**Contextual error guidance** -- Every error tells the agent what to do next:

| Error | Agent sees |
|-------|-----------|
| 400 on `grade_brainlift` | "...markdown format is wrong. Call `get_template` to see the required format -- structural mistakes silently drop content." |
| 404 on `get_brainlift_assessment` | "Brainlift not found. Use `list_brainlifts` to see your available brainlifts and their slugs." |
| 429 (rate limit) | "Rate limit exceeded. Wait 60 seconds before trying again." |
| 500+ (server error) | "The grading server encountered an internal error. Wait a minute and try again." |
| Network failure | "Cannot reach the grading server. It may be starting up or temporarily unavailable." |

**Autonomous polling** -- Grading takes 30 seconds to several minutes depending on brainlift size. A naive MCP server would return "grading started, check back later" and leave the agent to bother the user about it. Ours doesn't. Tool responses explicitly instruct the agent to `bash sleep` for the `retryAfter` interval, re-poll autonomously, and only surface results to the user once grading is complete. The agent handles the entire wait-poll-read loop without any user interaction. The `statusOnly` mode keeps poll queries cheap (COUNT aggregations, no JOINs) so the database stays happy during the wait.

**Slug deduplication** -- Submitting a brainlift with a title that already exists doesn't error. The server appends `-2`, `-3`, etc. to the slug automatically.

## Project structure

```
brainlift-mcp/
  src/
    index.ts                      # brainlift-mcp entrypoint — general author variant
    index.student.ts              # brainlift-mcp-student entrypoint — author + sprint tools
    google-handler.ts             # Google OAuth authorize/callback flow
    instructions/
      brainlift.ts                # Shared server instructions (DOK levels, workflows, curation posture)
      student-sprint.ts           # Sprint appendix composed into the student variant only
    tools/
      get-template.ts             # Brainlift markdown template
      grade-brainlift.ts          # Submit brainlift for grading
      list-brainlifts.ts          # List the user's brainlifts
      get-brainlift-assessment.ts # Grading status + per-DOK results
      create-dok{1,2,3,4}.ts      # Append items to a graded brainlift
      edit-dok-item.ts            # Edit an existing DOK item
      delete-dok-item.ts          # Delete with staleness cascade preview
      link-dok{3,4}.ts            # Link new items into existing DOK3/DOK4
      get-stale-items.ts          # Read items flagged stale
      dismiss-stale.ts            # Mark stale items as still valid
      generate-plan.ts            # [student] Kick off 30-day sprint generation
      get-plan.ts                 # [student] Poll or read the active plan
      get-task.ts                 # [student] Full task detail
      list-tasks.ts               # [student] Today + overdue tasks
      save-deliverable.ts         # [student] Create a task's Google Doc
      read-deliverable.ts         # [student] Read a deliverable
      update-deliverable.ts       # [student] Replace a deliverable's content
      list-deliverables.ts        # [student] List deliverables per plan
    utils/
      dok1grader-client.ts        # HTTP client for DOK1Grader internal API
      formatters.ts               # Human-readable response formatters + error guidance
    types/
      env.d.ts                    # Env and Props interfaces
    __tests__/                    # Vitest suite for tools, formatters, and client
  wrangler.jsonc                  # brainlift-mcp (author) Cloudflare Worker config
  wrangler.student.jsonc          # brainlift-mcp-student Cloudflare Worker config (incl. staging env)
  package.json
  tsconfig.json
  vitest.config.ts
```

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- Google Cloud project with OAuth 2.0 credentials
- Running DOK1Grader instance with service API key

### Environment variables

Create `.dev.vars` for local development:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
COOKIE_ENCRYPTION_KEY=random-32-char-string
DOK1GRADER_BASE_URL=http://localhost:5000
DOK1GRADER_SERVICE_KEY=your-service-api-key
```

For production, set these as Cloudflare Worker secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npx wrangler secret put DOK1GRADER_SERVICE_KEY
```

`DOK1GRADER_BASE_URL` is set in `wrangler.jsonc` as a plaintext var (different per environment).

### Cloudflare resources

Before first deploy, create the KV namespace:

```bash
npx wrangler kv namespace create BRAINLIFT_MCP_OAUTH_KV
```

Update the `id` in `wrangler.jsonc` with the returned namespace ID.

### Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `https://your-worker.workers.dev/callback`
4. Copy Client ID and Client Secret to your env vars

### DOK1Grader service key

The DOK1Grader side needs a row in the `api_keys` table:

```sql
INSERT INTO api_keys (key, name, rate_limit, is_active)
VALUES ('your-service-api-key', 'brainlift-mcp-production', 60, true);
```

This key goes into the MCP server's `DOK1GRADER_SERVICE_KEY` env var.

### Run locally

```bash
npm install
npm run dev              # brainlift-mcp (author variant) on port 8787
npm run dev:student      # brainlift-mcp-student (author + sprint) on port 8788
```

### Run tests

```bash
npm test                 # vitest run
npm run test:watch       # vitest watch mode
```

### Deploy

**Author variant (brainlift-mcp → prod):**

```bash
npm run deploy                                         # wrangler deploy (default config)
```

**Student variant — prod:**

```bash
npx wrangler deploy --config wrangler.student.jsonc    # → brainlift-mcp-student (prod: brainliftcentral.com)
```

**Student variant — staging:**

```bash
npx wrangler deploy --config wrangler.student.jsonc --env staging
# → brainlift-mcp-student-staging (staging: brainlift-platform.onrender.com)
```

The staging env block lives in `wrangler.student.jsonc` under `env.staging`. It publishes as a separate Cloudflare Worker (`brainlift-mcp-student-staging`) with its own `DOK1GRADER_BASE_URL` pointing at the staging backend. Secrets (OAuth credentials, cookie key, staging service API key) must be set per-env:

```bash
npx wrangler secret put DOK1GRADER_SERVICE_KEY --config wrangler.student.jsonc --env staging
npx wrangler secret put GOOGLE_CLIENT_ID       --config wrangler.student.jsonc --env staging
npx wrangler secret put GOOGLE_CLIENT_SECRET   --config wrangler.student.jsonc --env staging
npx wrangler secret put COOKIE_ENCRYPTION_KEY  --config wrangler.student.jsonc --env staging
```

The staging worker needs its own row in the DOK1Grader staging `api_keys` table. Generate a new plaintext key, insert its record into staging's DB, then pipe the plaintext into `DOK1GRADER_SERVICE_KEY` above.

### Google OAuth redirect URIs

Each worker hostname needs its own authorized redirect URI in the Google Cloud Console OAuth client:

- `https://brainlift-mcp.<subdomain>.workers.dev/callback`
- `https://brainlift-mcp-student.<subdomain>.workers.dev/callback`
- `https://brainlift-mcp-student-staging.<subdomain>.workers.dev/callback`

You can share one OAuth client across all three as long as all callbacks are registered; or use separate clients per worker if you want isolation.

## Connecting an MCP client

### Claude Desktop / Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "brainlift-mcp": {
      "url": "https://your-worker.workers.dev/sse"
    }
  }
}
```

On first tool call, you'll be prompted to authenticate with Google.

### Cursor / other MCP clients

Point your client's MCP server URL to `https://your-worker.workers.dev/sse`. The server uses SSE transport over the `/sse` endpoint.

## Rate limiting

- 60 requests/minute per service API key (configurable per key in `api_keys.rate_limit`)
- In-memory sliding window on DOK1Grader side
- Assessment polling responses include `retryAfter` hints
- Tool descriptions guide agents on appropriate polling intervals

## How it was built

This project was developed using a spec-driven development workflow:

1. **Research** -- Explored the DOK1Grader codebase, designed the architecture, decomposed into 4 specs with dependency ordering
2. **Spec 01** (DOK1Grader) -- Service API keys, `requireServiceAuth` middleware, rate limiter, user provisioning
3. **Spec 02** (both repos) -- Cloudflare Worker scaffold, Google OAuth, `DOK1GraderClient`, `get_template` tool, template endpoint
4. **Test gate** -- Deployed specs 01+02, verified auth end-to-end before proceeding
5. **Spec 03** (DOK1Grader) -- Grade, list, status, and assessment endpoints with paginated queries
6. **Spec 04** (this repo) -- Remaining MCP tools, response formatters, error guidance

Each spec followed TDD discipline: tests committed before implementation, separate commits for each phase.
