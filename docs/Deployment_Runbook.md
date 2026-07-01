# IA Supervisor Deployment Runbook

This runbook prepares the current MVP for a private pilot deployment. It assumes one application instance, PostgreSQL,
and private file storage through Supabase Storage or a persistent local volume.

## Deployment Profile

- Runtime: Node.js 20+.
- Database: PostgreSQL 16 or compatible.
- App framework: Next.js App Router.
- Auth: NextAuth Credentials.
- AI provider: DeepSeek/OpenAI-compatible chat completions.
- Upload storage: Supabase Storage for online deployment, or local `uploads/` backed by a persistent volume.

## Required Environment Variables

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?schema=public"
NEXTAUTH_URL="https://your-ia-supervisor-domain.example"
NEXTAUTH_SECRET="generate-a-long-random-secret"
TEACHER_SIGNUP_CODE="generate-a-private-teacher-signup-code"

AI_REVIEW_PROVIDER="deepseek"
DEEPSEEK_API_KEY="your-deepseek-api-key"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-flash"

FILE_STORAGE_PROVIDER="supabase"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
SUPABASE_STORAGE_BUCKET="ia-supervisor-uploads"
```

For one-time admin bootstrap:

```env
ADMIN_EMAIL="admin@your-school.example"
ADMIN_NAME="System Admin"
ADMIN_PASSWORD="generate-a-strong-temporary-password"
```

Remove `ADMIN_PASSWORD` from hosted environment settings after the admin account is created.

## First Deployment

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Generate Prisma client:

   ```bash
   npx prisma generate
   ```

3. Create a private Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET`.

   The bucket should not be public. IA Supervisor serves files through authenticated app routes after checking the
   current user role and class membership.

4. Apply database migrations:

   ```bash
   npm run prisma:deploy
   ```

5. Seed assessment reference data without demo accounts:

   ```bash
   SEED_DEMO_USERS=false npx prisma db seed
   ```

   This creates the IB Computer Science IA 2027 subject, criteria, deliverable templates, milestone templates, and
   assessment reference file mappings. It intentionally skips `teacher@example.com`, `student@example.com`, and
   `admin@example.com`.

6. Create the real admin account:

   ```bash
   ADMIN_EMAIL="admin@your-school.example" \
   ADMIN_NAME="System Admin" \
   ADMIN_PASSWORD="replace-with-a-strong-temporary-password" \
   npm run admin:create
   ```

7. Confirm production readiness:

   ```bash
   npm run readiness:check -- --production
   ```

8. Confirm DeepSeek connectivity:

   ```bash
   npm run ai-review:check-provider
   ```

9. Build the app:

   ```bash
   npm run build
   ```

10. Start the app:

   ```bash
   npm run start
   ```

11. Sign in as admin and check:

   - `/admin/system`
   - `/admin/subjects`
   - `/admin/assessment`

## Vercel + Supabase Pilot

Use this path for a low-cost online pilot.

1. Create a Supabase project.
2. Copy the Supabase Postgres connection string into `DATABASE_URL`.
   - For serverless hosting, prefer the pooled connection string if available.
   - Run migrations from a trusted local machine or CI job before opening the app to users.
3. Create a private Supabase Storage bucket:

   ```text
   ia-supervisor-uploads
   ```

4. Import the GitHub repository into Vercel.
5. Set Vercel environment variables:

   ```env
   DATABASE_URL="postgresql://..."
   NEXTAUTH_URL="https://your-vercel-domain.vercel.app"
   NEXTAUTH_SECRET="generate-a-long-random-secret"
   TEACHER_SIGNUP_CODE="generate-a-private-teacher-signup-code"

   FILE_STORAGE_PROVIDER="supabase"
   SUPABASE_URL="https://your-project.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
   SUPABASE_STORAGE_BUCKET="ia-supervisor-uploads"

   AI_REVIEW_PROVIDER="deepseek"
   DEEPSEEK_API_KEY="your-deepseek-api-key"
   DEEPSEEK_BASE_URL="https://api.deepseek.com"
   DEEPSEEK_MODEL="deepseek-v4-flash"
   ```

6. Deploy from Vercel.
7. From local terminal, pointed at the same production database, run:

   ```bash
   npm run prisma:deploy
   SEED_DEMO_USERS=false npx prisma db seed
   ADMIN_EMAIL="admin@your-school.example" ADMIN_NAME="System Admin" ADMIN_PASSWORD="temporary-strong-password" \
   npm run admin:create
   npm run readiness:check -- --production
   npm run ai-review:check-provider
   ```

8. Sign in with the real admin account and verify `/admin/system`.

Do not expose the Supabase service role key to browser code or public logs. IA Supervisor uses it only in server-side
file storage code.

## Local Pilot Deployment

For a local teacher-only pilot, use:

```bash
docker compose up -d
npm install
npx prisma migrate dev
npx prisma db seed
npm run readiness:check
npm run smoke:local
npm run dev
```

The default local seed creates demo accounts. Do not expose those accounts on a public deployment.

## Persistent Files

Uploaded files are served only through authenticated file routes.

Recommended online deployment:

- set `FILE_STORAGE_PROVIDER=supabase`
- create a private Supabase Storage bucket
- set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`
- keep the service role key server-side only

Local or single-server deployment:

- set `FILE_STORAGE_PROVIDER=local`
- mount `uploads/` as a persistent private volume
- include it in backup policy
- do not serve it as a public static directory
- restore it together with the PostgreSQL database when recovering from backup

## Pre-Release Verification

Run these commands before a release:

```bash
npm run lint
npm run build
npm run readiness:check
npm run smoke:local
```

For a production environment, run:

```bash
npm run readiness:check -- --production
npm run ai-review:check-provider
```

Optional full local QA with official fixtures:

```bash
npm run qa:local
```

This requires the official example files under `docs/test/IA-example for 2027/` and does not call DeepSeek.

## Release Acceptance Checklist

- `npm run lint` passes.
- `npm run build` passes.
- `npm run readiness:check -- --production` has no failures.
- `npm run ai-review:check-provider` passes for the configured provider.
- Admin can sign in and open `/admin/system`.
- Teacher can create a class and copy an invite code.
- Student can register with an invite code.
- Student can submit a readable PDF.
- Teacher can open the submitted item, run AI review, send feedback, and change status.
- Student can view feedback and print feedback.
- Final report and export package are available after required items pass.

## Rollback Plan

Application rollback:

1. Stop the current app process.
2. Deploy the previous known-good git tag or commit.
3. Run `npm ci` and `npm run build`.
4. Start the app with the same environment variables.

Database rollback:

- Take a PostgreSQL backup before every migration.
- Prisma migrations are forward-only. If a migration causes data or schema problems, restore the latest backup rather
  than trying to manually reverse production data changes.

File rollback:

- For Supabase Storage, restore the affected bucket objects from the same backup window as the database.
- For local storage, restore the `uploads/` volume from the backup taken at the same time as the database backup.
- Keep database and file snapshots paired, because file records reference storage paths.

## Commands That Must Stay Local Only

Do not run these against production:

```bash
npm run demo:reset
npm run demo:official-examples
npm run qa:local
```

`npm run demo:reset` and official example seeding include local fixture behavior and are intended for development or
benchmarking only.

## Known Production Gaps

- Supabase Storage is supported, but direct bucket backup/restore automation is not included.
- Rate limiting is in-memory and not distributed.
- No email verification or password reset workflow.
- No school/organization tenant model.
- No CI-hosted security/dependency vulnerability gate yet.
