# IA Supervisor

MVP foundation for IA Supervisor: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui-compatible components, Prisma, PostgreSQL, Docker Compose, NextAuth Credentials, class creation, invite-code enrollment, seeded IB CS criteria, milestones, teacher/student dashboards, criterion-level submission slots, local PDF/DOCX upload, semantic extraction, cross-criterion consistency review, marking assistant, teacher feedback snapshots, submission version history, audit logs, final submission locking, admin-managed assessment references, class analytics, teacher final reports, ZIP final package export, and an AI review assistant foundation.

Automated final grading is intentionally not implemented. AI review remains advisory and teacher judgement remains final.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui component conventions
- Prisma
- PostgreSQL 16 through Docker Compose
- NextAuth Credentials provider

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment variables:

   ```bash
   cp .env.example .env
   ```

   Replace `NEXTAUTH_SECRET` with a long random value before using real accounts.
   Set `TEACHER_SIGNUP_CODE` to a private code that only teachers should know.
   Keep `AI_REVIEW_PROVIDER="mock"` for local AI review workflow testing without an API key.

   To use DeepSeek for real AI review, set:

   ```bash
   AI_REVIEW_PROVIDER="deepseek"
   DEEPSEEK_API_KEY="your-deepseek-api-key"
   DEEPSEEK_BASE_URL="https://api.deepseek.com"
   DEEPSEEK_MODEL="deepseek-chat"
   ```

3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Create the database schema:

   ```bash
   npx prisma migrate dev --name init
   ```

5. Seed IB Computer Science criteria and demo users:

   ```bash
   npx prisma db seed
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

7. Open the app:

   - Login: [http://localhost:3000/login](http://localhost:3000/login)
   - Register: [http://localhost:3000/register](http://localhost:3000/register)
   - Teacher dashboard: [http://localhost:3000/teacher/dashboard](http://localhost:3000/teacher/dashboard)
   - Student dashboard: [http://localhost:3000/student/dashboard](http://localhost:3000/student/dashboard)
   - Admin assessment reference: [http://localhost:3000/admin/assessment](http://localhost:3000/admin/assessment)

## Demo Accounts

The seed script creates these accounts with password `password123`:

- `teacher@example.com`
- `student@example.com`
- `admin@example.com`

## Project Structure

```text
app/
  (auth)/login/
  (auth)/register/
  api/auth/[...nextauth]/
  teacher/classes/[classId]/
  teacher/classes/[classId]/students/[enrollmentId]/report/
  student/classes/[classId]/
  student/classes/[classId]/criteria/[criterionId]/
  teacher/dashboard/
  student/dashboard/
  admin/assessment/
components/
  navigation/
  ui/
lib/
prisma/
types/
```

## Roles

The Prisma schema defines three user roles:

- `teacher`
- `student`
- `admin`

## Notes

- The Credentials provider validates email/password against `User.passwordHash`.
- Students can register publicly with a class invite code and are enrolled immediately.
- Teachers can register only with `TEACHER_SIGNUP_CODE`.
- Teachers can create classes from `/teacher/dashboard`.
- Each class receives a unique invite code and default IA milestones.
- Teachers can edit class milestones and link them to criteria.
- Students can join a class from `/student/dashboard` with the invite code.
- The seeded IB CS criteria are shown in each teacher class dashboard.
- Students can open a class from `/student/classes/[classId]` and then submit each criterion from its own criterion page.
- Students can see a completion status panel for the class, including passed count, waiting review count, revision count, final-submitted count, and reasons final submission is not yet available.
- Students can upload PDF/DOCX files up to 25 MB for each criterion slot.
- Teachers can view each enrolled student's criterion status from `/teacher/classes/[classId]`.
- Teachers can set review status and save feedback drafts or send student-visible feedback.
- Teachers can insert built-in IB CS IA 2027 comment templates into feedback drafts by criterion.
- Teachers can reopen a final-submitted criterion for revision with a required student-visible reason.
- Feedback is stored as `FeedbackSnapshot` records with draft, sent, and superseded lifecycle states.
- Submission, review, feedback, AI review, and final submission events are recorded in `AuditLog`.
- Students can see teacher feedback from `/student/classes/[classId]` and resubmit when revision is needed.
- Every student submit creates an immutable `SubmissionVersion` record.
- Files are attached to submission versions, and teacher feedback is copied onto the latest reviewed version.
- Semantic extraction records structured IA elements from submitted files and can be confirmed by teachers.
- Teachers can run cross-criterion consistency review from the student detail page to check A-C, A-E, B-D, and C-D alignment.
- Teachers can run a conservative marking assistant on a criterion review page. It suggests a mark range and evidence notes.
- Teachers can save final marks and final comments on the latest marking snapshot. Final marks remain teacher-controlled and are not student-facing yet.
- Teachers can view class-level final mark overview from the analytics page, including A-E marks, totals, missing marks, and final submission state.
- Teachers can open a student final report from the student detail page. The report summarizes criterion status, latest files, sent feedback, final marks, consistency checks, recent audit events, and final package readiness checks.
- Teachers can download a ZIP final package from the student final report when package readiness has no blocking issues.
- The ZIP package includes latest A-E files plus report, audit, feedback, marks, consistency JSON summaries, and a manifest with SHA-256 checksums.
- The student final report shows the latest package export record after a teacher downloads a ZIP.
- Students can final-submit the IA after all criteria are passed. Final-submitted criteria are locked from further student edits.
- Uploaded files are stored locally in `/uploads` and served through authenticated `/api/files/[fileId]` routes.
- Teachers can run an AI review assistant on a single student criterion page. The AI review saves provider, model, summary, findings, and confidence.
- AI review uses assessment references from `/docs/assessment/ib-cs-ia-2027`.
- AI review extracts text from submitted PDF and DOCX files before sending criterion-specific context to the configured provider.
- AI review generation also refreshes semantic extraction for the latest submitted version.
- AI review shows extraction status, evidence snippets, rubric alignment, and current/stale review state.
- Teachers can copy AI review content into editable teacher feedback.
- AI review does not change status, assign final marks, or replace teacher judgement.
- AI review output quality can be checked locally with `npm run ai-review:evaluate`.
- Admins can edit the IB CS IA 2027 assessment reference files from `/admin/assessment`.
- Teachers can open class analytics from `/teacher/classes/[classId]/analytics`.
- Current implementation status and designed-but-unbuilt backlog are tracked in `docs/Implementation_Status_2026-05-22.md`.
- Current security posture and remaining production risks are tracked in `docs/Security_Checklist.md`.
