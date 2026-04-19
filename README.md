# AI Banner Generator

Internal MVP for AI-powered banner ad generation with brand-safe templates, multi-round review workflow, and optional Slack integration.

---

## Stack

| Layer | Technology |
|---|---|
| Web app | Next.js 15 (App Router, server components) |
| Database | PostgreSQL via Prisma 6 |
| AI generation | Anthropic Claude API (`claude-opus-4-6`) |
| Object storage | AWS S3 or Cloudflare R2 |
| Auth | NextAuth v4 (credentials / email) |
| Notifications | Slack Web API (optional) |
| Deployment | Vercel (web) + Railway / Supabase (DB) |

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ running locally, or a connection string to a remote DB
- An Anthropic API key
- An S3 bucket (AWS or Cloudflare R2)

### 1. Install dependencies

```bash
npm install
```

`postinstall` automatically runs `prisma generate` to build the Prisma client.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in at minimum:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Local Postgres or Railway/Supabase/Neon |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` | AWS IAM or R2 API token |
| `S3_BUCKET_NAME` | Your bucket name |

Slack variables are optional — all Slack calls are no-ops if `SLACK_BOT_TOKEN` is unset.

### 3. Set up the database

```bash
# Run all migrations (creates tables)
npm run db:migrate

# Seed initial users and a default brand template
npm run db:seed
```

Seed creates one account per role — log in with any of these emails (any password accepted in MVP mode):

| Role | Email |
|---|---|
| Admin | admin@example.com |
| Creative Head | creative@example.com |
| Designer | designer@example.com |
| Approver | approver@example.com |
| Requester | requester@example.com |

### 4. Start the web app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Banner generation (background jobs)

The generation job runs via `setImmediate` in the same Node.js process — no separate worker needed locally. When a request is submitted and generation is triggered, the job runs in the background and the page updates on the next refresh.

To watch job logs, check the terminal running `npm run dev`.

---

## Database Scripts

| Script | Purpose |
|---|---|
| `npm run db:migrate` | Create a new migration from schema changes (dev) |
| `npm run db:migrate:deploy` | Apply pending migrations without prompting (production / CI) |
| `npm run db:seed` | Seed initial users and default template |
| `npm run db:reset` | Drop all tables, re-migrate, and re-seed (destructive) |
| `npm run db:push` | Push schema without a migration file (prototyping only) |
| `npm run db:studio` | Open Prisma Studio at localhost:5555 |

---

## Project Structure

```
app/
  (auth)/login/          Login page
  (dashboard)/           All authenticated pages
    page.tsx             Dashboard (role-aware: reviewer / designer / requester)
    requests/            Request list + detail + new + edit
    review/              Reviewer queue + review detail
    templates/           Brand template library
    admin/               User management + Slack settings
  api/
    auth/                NextAuth endpoint
    requests/            Request CRUD
    banners/             Generation trigger + variant status + presign
    review/              Review decisions + checklist
    templates/           Template CRUD
    admin/               User role management + Slack config
    uploads/             S3 presigned URL issuer
    webhooks/slack/      Slack interactive actions webhook
    health/              Health check (GET /api/health)

components/
  layout/                Sidebar + header
  requests/              RequestForm, RequestActions, CommentThread, AttachmentList
  review/                ReviewPanel (gallery + checklist + decision)
  banners/               BannerGrid
  templates/             TemplateForm, ArchiveToggle
  dashboard/             StatCard, ActivityFeed
  admin/                 UserRoleSelector, SlackConnectionTester

lib/
  auth.ts                NextAuth config + getSession helper
  permissions.ts         Single source of truth for role checks
  db.ts                  Prisma singleton
  ai.ts                  Anthropic API wrapper + prompt builder
  jobs.ts                Generation job runner + queue transport
  storage.ts             S3 upload / presign helpers
  slack.ts               Slack Block Kit notifications
  activity.ts            Audit log helpers
  dashboard.ts           Dashboard data layer
  validations.ts         Zod schemas for all API inputs

prisma/
  schema.prisma          Full database schema
  seed.ts                Dev/first-deploy seed data
  migrations/            SQL migration files (committed to git)
```

---

## Roles and Permissions

| Role | Can do |
|---|---|
| **REQUESTER** | Create requests, view own requests, comment |
| **DESIGNER** | Everything above + view all requests + trigger generation |
| **APPROVER** | Review, approve, reject, request revisions |
| **CREATIVE_HEAD** | Everything above + manage brand templates + Slack settings |
| **ADMIN** | Everything + manage users and roles |

---

## Deployment

### Recommended: Vercel + Railway (or Supabase)

#### 1. Provision a PostgreSQL database

**Railway**: Create a project → Add PostgreSQL service → copy the `DATABASE_URL`.

**Supabase**: Create a project → Settings → Database → copy the connection string.
Use the **pooled** connection string for `DATABASE_URL` and the **direct** connection for `DIRECT_URL` (used by Prisma migrate).

**Neon**: Create a database → copy the connection string (includes `?sslmode=require`).

#### 2. Create an S3 bucket or Cloudflare R2 bucket

**AWS S3**:
1. Create a bucket (block public access).
2. Create an IAM user with policy: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::your-bucket/*`.
3. Generate access keys.

**Cloudflare R2** (recommended — no egress fees):
1. Create a bucket in the R2 dashboard.
2. Create an API token with Object Read & Write.
3. Set `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com` and `S3_REGION=auto`.

#### 3. Deploy to Vercel

```bash
# Install Vercel CLI (once)
npm i -g vercel

# Deploy
vercel --prod
```

Or connect the GitHub repository in the Vercel dashboard.

Set all environment variables from `.env.example` in **Vercel → Project → Settings → Environment Variables**.

#### 4. Run migrations on first deploy

```bash
# With DATABASE_URL pointing at production:
npx prisma migrate deploy

# Then seed (first deploy only):
npx tsx prisma/seed.ts
```

Or add this as a Vercel build command:

```
prisma migrate deploy && next build
```

#### 5. Configure Slack (optional)

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. Add OAuth scopes: `chat:write`, `chat:write.public`, `views:open`.
3. Install to workspace → copy Bot User OAuth Token → set `SLACK_BOT_TOKEN`.
4. Under **Interactivity & Shortcuts** → enable → set Request URL to:
   `https://your-app.vercel.app/api/webhooks/slack`
5. Copy Signing Secret → set `SLACK_SIGNING_SECRET`.
6. Test at **Admin → Slack Settings** in the web app.

---

### Alternative: Railway (web + DB in one project)

Railway can host both the Next.js app and PostgreSQL in the same project.

1. Create a new Railway project.
2. Add a **PostgreSQL** service — copy `DATABASE_URL`.
3. Add a **Node.js** service from your GitHub repo.
4. Set environment variables (all from `.env.example`).
5. Set the start command: `npm run db:migrate:deploy && npm start`

Generation jobs run in-process via `setImmediate` — no separate worker service needed at MVP scale.

---

### Production worker note

The current generation transport (`lib/jobs.ts`) uses `setImmediate`, which works fine on a **long-running Node.js server** (Railway, Fly.io, self-hosted). It works on **Vercel** only if generation completes within the function timeout (max 60s on Pro plan).

For high-volume production or long-running generations, swap `enqueueBannerGeneration()` to use one of:

| Option | When to use |
|---|---|
| `import { after } from "next/server"` | Vercel — defers work past the response, keeps serverless |
| [Inngest](https://inngest.com) | Vercel — durable background jobs, retries, step functions |
| pgBoss / BullMQ | Dedicated Node.js server — persistent queue with retry |

Only the body of `enqueueBannerGeneration()` in `lib/jobs.ts` needs to change. `runBannerGeneration()` is transport-agnostic.

---

## Deployment Checklist

### Infrastructure

- [ ] PostgreSQL database provisioned and `DATABASE_URL` set
- [ ] S3 / R2 bucket created; CORS configured to allow PUT from app domain
- [ ] All required environment variables set in hosting platform

### Database

- [ ] `prisma migrate deploy` run on production DB
- [ ] `prisma/seed.ts` run on first deploy to create admin user
- [ ] Migrations directory committed to git (not gitignored)

### Auth

- [ ] `NEXTAUTH_SECRET` is a random 32-byte string (not the placeholder)
- [ ] `NEXTAUTH_URL` matches the public production URL exactly
- [ ] Before opening to real users: add password hashing to `lib/auth.ts` (currently email-only)

### AI Generation

- [ ] `ANTHROPIC_API_KEY` set; confirm credit balance
- [ ] Test a generation run end-to-end after deploy
- [ ] Review generation timeout vs. hosting platform limit (see worker note above)

### Storage

- [ ] S3 bucket CORS policy allows `PUT` from your app's origin for presigned uploads
- [ ] S3 bucket policy allows `GetObject` (or use presigned URLs — default behavior)

### Slack (optional)

- [ ] Slack app created with required scopes
- [ ] `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` set
- [ ] Webhook URL configured in Slack app settings: `https://your-app.com/api/webhooks/slack`
- [ ] Test connection from Admin → Slack Settings

### Operations

- [ ] Health check reachable: `GET https://your-app.com/api/health` returns `{"status":"ok"}`
- [ ] Uptime monitor pointed at `/api/health`
- [ ] Error monitoring configured (Sentry, Axiom, etc.)
- [ ] Admin user role confirmed in production (run seed or manually set via Prisma Studio)

---

## Health Check

```
GET /api/health
```

Returns `200 {"status":"ok"}` when the app and database are reachable.  
Returns `503 {"status":"error","message":"Database unreachable"}` on DB failure.

---

## Environment Variables Reference

See [.env.example](.env.example) for the full annotated list.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret (32-byte random) |
| `NEXTAUTH_URL` | Yes | Public app URL (no trailing slash) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `S3_ACCESS_KEY_ID` | Yes | S3 / R2 access key |
| `S3_SECRET_ACCESS_KEY` | Yes | S3 / R2 secret key |
| `S3_REGION` | Yes | `us-east-1` for AWS, `auto` for R2 |
| `S3_BUCKET_NAME` | Yes | Storage bucket name |
| `S3_ENDPOINT` | No | R2 or other S3-compatible endpoint |
| `NEXT_PUBLIC_APP_URL` | Yes | Used in Slack deep links |
| `SLACK_BOT_TOKEN` | No | Bot OAuth token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | No | HMAC request signing secret |
| `SLACK_NOTIFY_CHANNEL` | No | Channel for new request notifications |
| `SLACK_APPROVER_CHANNEL` | No | Channel for review-ready notifications |
