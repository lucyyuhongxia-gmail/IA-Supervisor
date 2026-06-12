# IA Supervisor Deployment Runbook

This runbook prepares the current MVP for a private pilot deployment. It assumes one application instance, PostgreSQL,
and persistent private storage for `uploads/`.

## Deployment Profile

- Runtime: Node.js 20+.
- Database: PostgreSQL 16 or compatible.
- App framework: Next.js App Router.
- Auth: NextAuth Credentials.
- AI provider: DeepSeek/OpenAI-compatible chat completions.
- Upload storage: local `uploads/` path in the app, backed by a persistent volume for deployment.

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

3. Apply database migrations:

   ```bash
   npm run prisma:deploy
   ```

4. Seed assessment reference data without demo accounts:

   ```bash
   SEED_DEMO_USERS=false npx prisma db seed
   ```

   This creates the IB Computer Science IA 2027 subject, criteria, deliverable templates, milestone templates, and
   assessment reference file mappings. It intentionally skips `teacher@example.com`, `student@example.com`, and
   `admin@example.com`.

5. Create the real admin account:

   ```bash
   ADMIN_EMAIL="admin@your-school.example" \
   ADMIN_NAME="System Admin" \
   ADMIN_PASSWORD="replace-with-a-strong-temporary-password" \
   npm run admin:create
   ```

6. Confirm production readiness:

   ```bash
   npm run readiness:check -- --production
   ```

7. Confirm DeepSeek connectivity:

   ```bash
   npm run ai-review:check-provider
   ```

8. Build the app:

   ```bash
   npm run build
   ```

9. Start the app:

   ```bash
   npm run start
   ```

10. Sign in as admin and check:

   - `/admin/system`
   - `/admin/subjects`
   - `/admin/assessment`

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

Uploaded files are stored in `uploads/` and are served only through authenticated file routes. For deployment:

- mount `uploads/` as a persistent private volume
- include it in backup policy
- do not serve it as a public static directory
- restore it together with the PostgreSQL database when recovering from backup

Object storage is the preferred future production path, but it is not implemented in the current MVP.

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

- Restore the `uploads/` volume from the backup taken at the same time as the database backup.
- Keep database and uploads snapshots paired, because file records reference upload paths.

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

- File storage is local-volume based, not object storage.
- Rate limiting is in-memory and not distributed.
- No email verification or password reset workflow.
- No school/organization tenant model.
- No CI-hosted security/dependency vulnerability gate yet.
