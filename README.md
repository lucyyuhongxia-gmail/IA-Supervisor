# IA Supervisor

IA Supervisor is a teacher-led IB Computer Science IA supervision workspace.

The current MVP supports class setup, invite-code enrollment, criterion-level PDF submissions, teacher review, AI-assisted draft feedback, student-visible feedback, printable feedback, milestones, analytics, audit logs, final reports, and final package export.

AI review is advisory only. Teacher judgement remains final.

## Current Version

- Stable tag: `v1.0`
- Current main includes v1.1 feedback-loop polish after `v1.0`.
- Assessment standard: IB Computer Science IA 2027.
- Supported student submission file type: PDF only.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style local components
- Prisma
- PostgreSQL 16 through Docker Compose
- NextAuth Credentials
- DeepSeek/OpenAI-compatible chat completions for AI review

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment variables:

   ```bash
   cp .env.example .env
   ```

   Required local values:

   ```env
   DATABASE_URL="postgresql://ia_supervisor:ia_supervisor@localhost:5432/ia_supervisor?schema=public"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="replace-with-a-long-random-secret"
   TEACHER_SIGNUP_CODE="replace-with-a-private-teacher-code"
   ```

3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Create the database schema:

   ```bash
   npx prisma migrate dev
   ```

5. Seed reference data and demo users:

   ```bash
   npx prisma db seed
   ```

   For a non-demo deployment, seed reference data without demo users:

   ```bash
   SEED_DEMO_USERS=false npx prisma db seed
   ```

6. Optional: reset the local demo database:

   ```bash
   npm run demo:reset
   ```

   This command only runs against local database URLs. It clears workflow data, removes local uploads except `uploads/.gitkeep`, recreates demo users, creates a demo class, enrolls a demo student, and creates a fixed class invite code.

7. Optional: load the official IB CS IA 2027 example submissions:

   ```bash
   npm run demo:official-examples
   ```

   This command only runs against local database URLs. It expects the official example files under `docs/test/IA-example for 2027/`, then creates an `IB CS IA 2027 Official Examples` class, 8 student accounts, submitted criterion versions, deliverable versions, and file evidence linked to the local example files. It is idempotent and does not clear unrelated class data.

   Default test accounts:

   | Role | Email | Password |
   | --- | --- | --- |
   | Teacher | `lucy_yu@ulink.cn` or `teacher@example.com` fallback | `password123` |
   | Student 1 | `official-example-1@student.test` | `password123` |
   | Student 8 | `official-example-8@student.test` | `password123` |

8. Start the app:

   ```bash
   npm run dev
   ```

9. Open:

   - Login: [http://localhost:3000/login](http://localhost:3000/login)
   - Register: [http://localhost:3000/register](http://localhost:3000/register)
   - Teacher dashboard: [http://localhost:3000/teacher/dashboard](http://localhost:3000/teacher/dashboard)
   - Student dashboard: [http://localhost:3000/student/dashboard](http://localhost:3000/student/dashboard)
   - Admin assessment reference: [http://localhost:3000/admin/assessment](http://localhost:3000/admin/assessment)
   - Admin system status: [http://localhost:3000/admin/system](http://localhost:3000/admin/system)

## Demo Accounts

The seed script creates:

| Role | Email | Password |
| --- | --- | --- |
| Teacher | `teacher@example.com` | `password123` |
| Student | `student@example.com` | `password123` |
| Admin | `admin@example.com` | `password123` |

Local demo reset may also create project-specific demo users used during development.

## AI Review Configuration

For local workflow testing without an API key:

```env
AI_REVIEW_PROVIDER="mock"
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-flash"
```

For real DeepSeek review:

```env
AI_REVIEW_PROVIDER="deepseek"
DEEPSEEK_API_KEY="your-deepseek-api-key"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-flash"
```

Use the model name supported by your DeepSeek account. The project default is `deepseek-v4-flash`, but `.env` can override it.

Check the provider before running real reviews:

```bash
npm run ai-review:check-provider
```

This command loads `.env`, masks the API key in output, and performs one minimal chat-completions request. Use it before batch-running official example reviews.

The official-example batch runner also performs this provider check automatically in write mode, before creating any `AIReviewRun` records.

## Production Readiness Check

Use the deployment runbook for a complete handoff sequence:

```text
docs/Deployment_Runbook.md
```

Run the local readiness check before handoff:

```bash
npm run readiness:check
```

Run the stricter production check before deploying or demonstrating with real AI review:

```bash
npm run readiness:check -- --production
```

The production check validates:

- required database and auth environment variables
- non-placeholder `NEXTAUTH_SECRET` and `TEACHER_SIGNUP_CODE`
- HTTPS `NEXTAUTH_URL`
- DeepSeek provider configuration when real AI review is expected
- readable/writable `uploads/` directory

Known production constraints are still intentional for this MVP:

- uploads use local disk storage and need durable private storage or a persistent volume in production
- rate limiting is in-memory and should be backed by Redis or a database for multi-instance deployment

## Local QA Gate

Run the deterministic local QA gate before committing workflow changes:

```bash
npm run qa:local
```

This runs lint, build, a mock AI provider preflight, base seed, official IA example fixture seed, fixture verification, a
one-item official review dry-run, the official benchmark in setup mode, and an authenticated admin/teacher/student app
smoke test. It does not call DeepSeek. It does reset AI review artifacts for the `IB CS IA 2027 Official Examples` class,
but it does not clear unrelated classes.

AI review uses the local assessment reference files in:

```text
docs/assessment/ib-cs-ia-2027/
  criteria.md
  rubric.md
  prompt-guidance.md
```

The AI review prompt is locked to the IB Computer Science IA 2027 assessment reference. It asks for evidence-grounded, criterion-specific feedback and a Markdown-ready `studentFeedbackDraft`.

## Teacher Workflow

1. Sign in as a teacher.
2. Create or select a class from `/teacher/dashboard`.
3. Share the class invite code with students.
4. Open a class to view enrolled students and criterion status.
5. Use the dashboard review queue to open criterion submissions or deliverable submissions that need attention.
6. For criterion review, check the uploaded PDF and extracted text status.
7. Run AI review if the latest submitted PDF has readable text.
8. Review AI summary, concerns, suggestions, rubric alignment, and evidence snippets.
9. Use `Copy full draft`, `Copy concerns`, or `Copy suggestions` to move AI notes into the editable feedback box.
10. Edit the feedback as the teacher.
11. Set status:
    - `Submitted` or `Under Review` saves a teacher-only draft.
    - `Revision Needed` sends feedback to the student.
    - `Passed` sends feedback and marks the criterion passed.
12. For deliverable review, open the deliverable item, inspect the submitted PDF or evidence link, then set `Under Review`, `Revision Needed`, or `Passed`.
13. Continue through the review queue or return to the dashboard.

Teacher review pages also include collapsed advanced tools:

- Semantic extraction
- Delta review
- Marking assistant
- Feedback history
- Version history
- Audit history

## Student Workflow

1. Register or sign in as a student.
2. Join a class using the invite code from the teacher.
3. Open the class from `/student/dashboard`.
4. Open one deliverable or criterion at a time.
5. Upload a readable PDF for document deliverables. For video deliverables, provide the required evidence link.
6. Submit the deliverable or criterion.
7. Wait for teacher review.
8. If revision is needed, read teacher feedback, revise the file or evidence, and submit a new version.
9. Use `Print feedback` to print or save teacher feedback as PDF.
10. Final-submit the IA only after all criteria are passed.

## Admin Workflow

Admins can open `/admin/assessment` to edit active assessment reference files for the AI review system.
Admins can open `/admin/system` to check seed data, assessment reference readiness, masked AI provider configuration,
official example fixture status, AI review run counts, and feedback snapshot counts.

The active reference is currently:

```text
IB Computer Science IA 2027
```

## Important Product Rules

- Students can submit PDF files only.
- Video/evidence deliverables use a link field instead of a file upload.
- Uploaded PDFs must contain readable text. Scanned or image-only PDFs are rejected.
- File upload limit is 25 MB.
- Every student submit creates an immutable `SubmissionVersion`.
- Deliverable submissions also create immutable version history and can be reviewed from the teacher queue.
- Linked deliverables synchronize criterion progress when the student has not submitted a separate criterion version.
- Final package deliverables do not change criterion status.
- Final submission requires all criteria and all class deliverables to be passed; final submission locks both criteria and deliverables.
- Student notes are saved with the submitted version and cleared after submission.
- Sent teacher feedback is stored as a `FeedbackSnapshot`.
- New sent feedback supersedes older sent feedback for the same submission version.
- Teacher feedback drafts are teacher-only until sent.
- AI review never changes status, assigns marks, or sends feedback automatically.
- Final marks are teacher-controlled and not automatically generated by AI.
- Final-submitted criteria are locked from further student edits unless reopened by the teacher.
- Uploaded files are stored locally in `uploads/` and served through authenticated `/api/files/[fileId]` routes.

## AI Feedback Quality Checks

Run the local evaluator against the latest AI review for a submission slot:

```bash
npm run ai-review:evaluate -- --slot-id <submissionSlotId>
```

Or against a specific AI review run:

```bash
npm run ai-review:evaluate -- --run-id <aiReviewRunId>
```

The evaluator checks:

- completed review status
- summary presence
- evidence-grounded concerns and suggestions
- issue / why it matters / revision guidance structure
- 2027 syllabus alignment
- rubric alignment evidence
- no forbidden extraction contradiction
- no mark or grade prediction
- Markdown-ready student feedback draft headings
- evidence / why-it-matters / action signals in student-facing feedback

Run the official-example benchmark after loading the local official IA examples:

```bash
npm run demo:official-examples
npm run ai-review:run-official -- --dry-run
npm run ai-review:benchmark-official -- --allow-missing
```

After AI reviews have been generated for all 8 official examples, run without `--allow-missing`:

```bash
npm run ai-review:benchmark-official
```

The benchmark compares stored AI review output with the official examiner comments and writes reports under `tmp/ai-review-benchmark/`.

## Common Commands

```bash
npm run dev
npm run build
npm run lint
npm run admin:create
npm run readiness:check
npm run ai-review:check-provider
npm run ai-review:evaluate -- --slot-id <submissionSlotId>
npm run ai-review:run-official -- --dry-run
npm run ai-review:benchmark-official -- --allow-missing
npm run demo:reset
npm run demo:official-examples
npm run qa:local
npm run smoke:local
npx prisma migrate dev
npm run prisma:deploy
npx prisma db seed
npx prisma studio
```

## Project Structure

```text
app/
  (auth)/login/
  (auth)/register/
  api/auth/[...nextauth]/
  api/files/[fileId]/
  teacher/dashboard/
  teacher/classes/[classId]/
  teacher/classes/[classId]/analytics/
  teacher/classes/[classId]/students/[enrollmentId]/
  teacher/classes/[classId]/students/[enrollmentId]/criteria/[criterionId]/
  teacher/classes/[classId]/students/[enrollmentId]/report/
  student/dashboard/
  student/classes/[classId]/
  student/classes/[classId]/criteria/[criterionId]/
  student/classes/[classId]/criteria/[criterionId]/feedback/
  admin/assessment/
  admin/system/
components/
lib/
prisma/
types/
docs/
uploads/
```

## Current Limitations

- AI review is a draft assistant, not an examiner decision.
- AI review quality depends on PDF text extraction quality.
- Student submissions are PDF-only.
- The system does not perform online document editing.
- The marking assistant is conservative and teacher-facing.
- Final marks are not student-facing yet.
- Local file storage is used; production deployment needs durable private storage.
- Email notifications are not implemented.
- Multi-school tenant isolation and production hardening are not complete.

## Documentation

- Current implementation and backlog: `docs/Implementation_Status_2026-05-22.md`
- Deployment runbook: `docs/Deployment_Runbook.md`
- MVP1.0 release notes: `docs/releases/MVP1.0.md`
- Security checklist: `docs/Security_Checklist.md`
- Official example AI review benchmark: `docs/AI_Review_Official_Example_Benchmark.md`
- Assessment reference: `docs/assessment/ib-cs-ia-2027/`
