# IA Supervisor MVP1.0 Release Notes

Release tag: `MVP1.0`

Date: 2026-06-04

## Summary

MVP1.0 is a usable local MVP for teacher-led IB Computer Science IA supervision.
It supports class setup, student PDF submissions by criterion, teacher review,
AI-assisted draft feedback, student-visible feedback, printable feedback, milestones,
analytics, audit logs, and teacher final package tooling.

AI review is advisory only. Teacher judgement remains final.

## Included Workflows

### Authentication And Roles

- Credentials login through NextAuth.
- Roles:
  - teacher
  - student
  - admin
- Public student registration with a class invite code.
- Teacher registration gated by `TEACHER_SIGNUP_CODE`.

### Teacher Workflow

- Create and select classes.
- Share invite codes with students.
- View class students and criterion progress.
- Edit class milestones and link milestones to criteria.
- Open a student criterion review page.
- Preview submitted PDFs.
- Check extracted text status.
- Run AI review on readable PDF submissions.
- Copy AI review draft feedback into the teacher feedback box.
- Save teacher-only drafts.
- Send student-visible feedback by setting `Revision Needed` or `Passed`.
- Continue through a review queue.
- Reopen final-submitted criteria when necessary.

### Student Workflow

- Join a class with an invite code.
- Open A-E criterion submission pages.
- Upload readable PDF files.
- Submit new immutable versions.
- See teacher feedback when revision is needed.
- Print or save feedback as PDF.
- Final-submit once all criteria are passed.

### Admin Workflow

- Edit active IB Computer Science IA 2027 assessment reference files from `/admin/assessment`.

## AI Review

MVP1.0 includes AI review support for a single criterion submission.

Current behavior:

- Supports mock mode for local workflow testing.
- Supports DeepSeek/OpenAI-compatible chat completions through environment variables.
- Uses `docs/assessment/ib-cs-ia-2027` as the assessment reference.
- Locks review to the IB Computer Science IA 2027 standard.
- Requires a readable submitted PDF.
- Saves provider, model, summary, findings, confidence, raw structured response, and rubric alignment.
- Shows extraction status and current/stale review state.
- Generates a Markdown-ready `studentFeedbackDraft`.
- Does not assign final marks.
- Does not change submission status.
- Does not send feedback automatically.

Local evaluator:

```bash
npm run ai-review:evaluate -- --slot-id <submissionSlotId>
```

The evaluator checks evidence grounding, criterion alignment, forbidden extraction contradictions,
mark/grade prediction, rubric alignment, and student-facing feedback structure.

## Validation Completed

The following checks were completed on 2026-06-04:

- Repository hygiene check:
  - `.env` ignored.
  - `.env.local` ignored.
  - `uploads/*` ignored except `uploads/.gitkeep`.
  - `.env.example` uses placeholders only.
  - No committed DeepSeek-style `sk-...` API keys found.
- Temporary local database demo reset check:
  - migrations applied successfully.
  - `npx prisma db seed` completed successfully.
  - `npm run demo:reset` completed successfully against a temporary local database.
  - demo reset produced 4 users, 1 subject, 5 criteria, 1 class, 1 enrollment, 7 milestones, and 5 criterion slots.
- Clean install and build check:
  - `npm install` completed.
  - `npx prisma migrate dev` reported database already in sync.
  - `npx prisma db seed` completed.
  - `npm run build` completed.
- End-to-end feedback loop:
  - teacher ran AI review.
  - teacher copied AI draft feedback.
  - teacher sent feedback as `Revision Needed`.
  - student viewed feedback.
  - student print feedback page rendered.
  - AI review evaluator passed `52/52` checks for the tested Criterion B review.

## Known Non-Blocking Warnings

- `npm install` reported an engine warning because the local Node version was `22.12.0` while one eslint dependency prefers `22.13.0+`.
- `npm audit` reported 4 moderate vulnerabilities. These were not fixed during MVP1.0 to avoid dependency churn.

## Current Limitations

- PDF-only student submissions.
- Uploaded PDFs must contain extractable text.
- No online document editing.
- No email notifications.
- No password reset workflow.
- No request rate limiting.
- Local file storage only; production needs durable private object storage.
- No malware scanning for uploads.
- No school/organization tenancy model.
- AI review is a teacher support tool, not an examiner or grading authority.
- Marking assistant is conservative and teacher-facing.
- Final marks are not student-facing yet.

## Suggested MVP1.1 Priorities

1. Production readiness light:
   - Node version alignment.
   - Dependency audit triage.
   - deployment environment checklist.
2. Release-quality demo data:
   - stable demo class and sample PDF submissions.
   - documented invite code.
3. Teacher review polish:
   - clearer current feedback vs draft feedback separation.
   - review queue filtering.
4. AI review quality:
   - more fixture-based evaluator tests.
   - more criterion-specific prompt fixtures.
5. Storage hardening:
   - object storage integration.
   - upload scanning strategy.
