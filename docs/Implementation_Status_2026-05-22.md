# IA Supervisor Implementation Status

Last updated: 2026-06-10

This document compares the current application implementation with the original v1 design documents in `docs/`.
The original `.docx` files should be treated as architecture references. This file is the current implementation
and backlog supplement.

## Source Documents Reviewed

- `Product Architecture-v1.docx`
- `Domain Model V1.docx`
- `Submission State Machine V1.docx`
- `AI Review JSON Schema V1.docx`
- `API Route Design V1.docx`
- `Teacher Workflow Ui Spec V1.docx`
- `Mvp Build Plan V1.docx`
- `docs/assessment/ib-cs-ia-2027/*`

## Implemented

### Foundation

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui-style components.
- Prisma with PostgreSQL.
- NextAuth Credentials authentication.
- Role support for `teacher`, `student`, and `admin`.
- Demo seed users for teacher, student, and admin.
- Public student registration with class invite code.
- Teacher registration gated by `TEACHER_SIGNUP_CODE`.
- Global role-aware navigation, breadcrumbs, sign out, and teacher class switcher.
- README now documents local setup, demo accounts, teacher/student/admin workflows, AI review configuration,
  product rules, quality checks, current limitations, and common commands.

### Class And Enrollment Workflow

- Teachers can create classes.
- Classes receive invite codes.
- Students can join classes with invite codes.
- Teachers can view class students and per-student criterion progress.
- Student and teacher dashboards show compact progress metrics.
- Teacher class analytics page uses Chart.js.

### Assessment Reference

- IB Computer Science IA 2027 criteria are seeded.
- Current criterion marks are:
  - Criterion A: 4
  - Criterion B: 4
  - Criterion C: 6
  - Criterion D: 12
  - Criterion E: 4
- Admins can edit active assessment reference files from `/admin/assessment`.
- AI review resolves the active assessment reference for the subject.

### Milestones

- Classes receive default milestones.
- Teachers can edit class milestones.
- Milestones can be linked to criteria or left as general milestones.
- Student and teacher UIs show milestone due status, including upcoming, due today, and overdue.

### Student Submission Workflow

- Criterion-level submission pages exist for A-E.
- Student class page includes a student-facing completion status panel.
- The completion panel shows:
  - passed criterion count
  - waiting review count
  - revision-needed count
  - final-submitted count
  - per-criterion status, file presence, and pass state
  - student-facing reasons why final submission is not yet available
- Students upload PDF files per criterion.
- Upload limit is 25 MB.
- PDF uploads must contain readable text. Scanned, image-only, encrypted, or otherwise unreadable PDFs are rejected
  before a submission version is created.
- Each student submission creates an immutable `SubmissionVersion`.
- Submitted file records are stored as `FileAsset`.
- Semantic extraction is generated after student file submission when readable text is available.
- Version history is shown collapsed by default with the latest version visible.
- Student notes are stored with the submitted version and cleared after submission.
- Student resubmission clears prior teacher feedback on the active slot.
- Final IA submission is available when all criteria are passed or already final submitted.
- Final submission updates passed criteria to `final_submitted` and locks further student editing.
- Student-facing completion status does not expose teacher final marks, AI internal review details, marking assistant
  output, or audit logs.

### Teacher Review Workflow

- Teacher dashboard includes a cross-class review queue.
- Teacher class page shows student list and criterion status.
- Teacher student detail page shows one student's criterion progress.
- Teacher criterion review page shows submission files, extraction preview, AI review history, and feedback controls.
- Teacher criterion review page includes a collapsed audit history for the latest workflow events.
- Teachers can set review status:
  - `submitted`
  - `under_review`
  - `revision_needed`
  - `passed`
- Teachers can reopen a `final_submitted` criterion back to `revision_needed` from the criterion review page.
- Reopening requires a reason, sends that reason to the student as feedback, and records an audit event.
- Standard teacher feedback status changes are blocked from directly changing a `final_submitted` criterion; teachers must
  use the explicit reopen flow.
- Teachers can write feedback and save it to the current slot and latest version.
- Teacher feedback form includes a built-in criterion-specific comment bank for IB CS IA 2027 feedback.
- Comment templates append to the teacher draft only; teachers must edit and save/send them manually.
- Teachers can save internal feedback drafts while a submission remains submitted or under review.
- Setting a criterion to revision needed or passed sends the feedback to the student.
- Passing a criterion requires teacher feedback, unless the slot is already final submitted.
- Students can see teacher feedback and revise when needed.

### Feedback Lifecycle

- `FeedbackSnapshot` records are stored per submission version.
- Current statuses:
  - `draft`
  - `approved`
  - `sent`
  - `superseded`
- Saving feedback while status is `submitted` or `under_review` stores a teacher-only draft.
- Saving feedback while status is `revision_needed` or `passed` sends the feedback to the student.
- New sent feedback supersedes older sent feedback for the same submission version.
- Teacher review page shows feedback history for the latest submitted version.
- Student pages read sent feedback first, with legacy fallback to mirrored version/slot feedback.

### Audit Log

- `AuditLog` records are stored for key workflow events.
- Current recorded actions include:
  - user registration
  - class creation
  - enrollment join
  - student submission version creation
  - student note save
  - student final submission
  - teacher final submission reopen
  - teacher review status changes
  - teacher feedback saves
  - assessment reference update
  - AI review completion
  - AI review failure
- Security checklist and residual production risks are tracked in `docs/Security_Checklist.md`.
- Audit entries store actor, role, entity, action, from/to state, reason, metadata, and timestamp.

### AI Review

- AI review can run against a single criterion submission.
- DeepSeek and OpenAI-compatible providers are supported through environment configuration.
- Mock mode is supported for local workflow testing.
- AI review extracts text from PDF submissions before calling the provider.
- AI review run guardrails block calls unless the latest criterion version has a readable PDF and a reviewable status.
- AI review refreshes semantic extraction for the latest submitted version before running.
- AI review saves:
  - provider
  - model
  - status
  - summary
  - confidence
  - raw structured response
  - findings
  - assessment reference key
- AI review shows extraction status and evidence snippets where available.
- AI review separates strengths, concerns, suggestions, and rubric alignment.
- AI review prompt v2 asks the model to act like an experienced IB DP CS teacher/examiner, follow only the 2027
  syllabus, cite evidence for each concern/suggestion, and provide specific revision guidance.
- AI review prompt v3 strengthens student-facing feedback quality by requiring Markdown-ready feedback with Summary,
  What is working, What to revise, and Next actions sections. Revision bullets must include evidence, issue, why it
  matters, and action.
- AI review normalization accepts both object-based examiner feedback and older string arrays, then stores evidence
  grounded feedback in the existing strengths/concerns/suggestions UI.
- Teacher copy-to-feedback now prefers the model's `studentFeedbackDraft` when present, while preserving summary,
  concerns, suggestions, and full-draft fallback copy buttons.
- Local AI review evaluation harness is available through `npm run ai-review:evaluate`.
- The harness checks stored AI review runs or JSON fixtures for evidence grounding, issue/why/revision structure,
  2027 syllabus alignment, forbidden extraction contradictions, grade/mark predictions, and generic feedback.
- The harness also checks whether `studentFeedbackDraft` uses the expected Markdown headings and includes evidence,
  why-it-matters, and action signals.
- AI provider preflight is available through `npm run ai-review:check-provider`. It loads `.env`, masks secrets, and
  verifies mock or DeepSeek/OpenAI-compatible chat completions configuration before real review batches run.
- Official IB CS IA 2027 example test data can be loaded through `npm run demo:official-examples` when the official
  files are present under `docs/test/IA-example for 2027/`.
- Official example batch AI review runner is available through `npm run ai-review:run-official`. It can dry-run, limit,
  filter by student or criterion, skip current reviews, and fail fast on provider errors before creating review rows.
- Official example benchmark is available through `npm run ai-review:benchmark-official`. It compares stored AI review
  output against official examiner comments and reports missing reviews, focus-term overlap, evidence grounding,
  Markdown feedback structure, rubric alignment, and prohibited mark/grade predictions.
- Teacher can copy AI summary, concerns, suggestions, or full draft into teacher feedback.
- AI review does not change submission status, assign final marks, or send feedback automatically.
- Current/stale AI review state is shown to help teachers know whether the latest version has been reviewed.

### Semantic Extraction

- `SemanticExtraction` records are stored per submission version and criterion.
- Extraction captures criterion-specific IA elements:
  - Criterion A: problem scenario, solution requirements, success criteria, computational context.
  - Criterion B: decomposition, planning items, design rationale.
  - Criterion C: system model, algorithms, testing strategy.
  - Criterion D: implementation techniques, implementation evidence, testing effectiveness.
  - Criterion E: evaluation against success criteria, limitations, future improvements.
- Teacher criterion review page shows a semantic extraction panel with extracted sections, status, snippets, confidence,
  and source character count.
- Teachers can regenerate or confirm semantic extraction.
- Semantic extraction generation and confirmation are recorded in audit history.

### Cross-Criterion Consistency Review

- `ConsistencyCheck` records are stored per student consistency review run.
- Teacher student detail page can run and display a cross-criterion consistency report.
- Current rule-based checks:
  - A-C: Criterion A success criteria / requirements aligned with Criterion C testing strategy.
  - A-E: Criterion A success criteria / requirements aligned with Criterion E evaluation.
  - B-D: Criterion B planning / decomposition aligned with Criterion D development evidence.
  - C-D: Criterion C system model / algorithms aligned with Criterion D implementation evidence.
- The report shows status, severity, summary, shared terms, source snippets, and target snippets.
- Consistency review is currently rule-based over semantic extraction snippets, not LLM-generated.
- Consistency review completion is recorded in audit history.

### Delta Review

- `DeltaReview` records are stored per criterion submission slot.
- Teacher criterion review page can compare the latest submitted version with the previous submitted version.
- Delta review uses previous teacher feedback as the issue list and checks the latest extracted text for possible
  response evidence.
- Delta review shows:
  - previous issues that are possibly addressed
  - previous issues that still need teacher review
  - new or substantially changed evidence from the latest version
- Delta review is teacher-facing only and does not change status, send feedback, assign marks, or replace teacher
  judgement.
- Current implementation is conservative and rule-based. It is not yet an LLM examiner-mode delta review.
- Delta review completion is recorded in audit history.

### Marking Assistant

- `MarkingSnapshot` records are stored per submission version and criterion.
- Teacher criterion review page includes a marking assistant panel.
- Current implementation is conservative and rule-based over semantic extraction sections and latest AI review confidence.
- The marking assistant stores:
  - suggested mark range
  - suggested single mark
  - confidence
  - rationale
  - descriptor evidence JSON
- Teachers can save final marks and final comments on the latest marking snapshot.
- Marking assistant results are teacher-facing only.
- Marking assistant does not assign final marks or change submission status.
- Teacher final mark saves are recorded in audit history.
- Marking assistant completion is recorded in audit history.

### Class Mark Overview

- Teacher class analytics page includes a final marks overview.
- Summary cards show:
  - fully marked students
  - average total for fully marked students
  - missing final marks
  - final submitted students
- Marks table shows each student across Criteria A-E, criterion max marks, total `/30`, missing marks, and final
  submitted state.
- Marks are read from the latest `MarkingSnapshot.teacherFinalMark` per criterion.

### Student Final Report

- Teacher student detail page links to a teacher-only final report.
- The report summarizes:
  - class, subject, exam session, student identity, and latest submission date
  - final package readiness as `Ready` or `Not ready`
  - criterion status for A-E
  - latest submitted files
  - sent teacher feedback
  - teacher-saved final marks and total `/30`
  - latest cross-criterion consistency checks
  - recent audit events for the enrollment and criterion slots
- Readiness checks list blocking issues for missing final-submitted status, missing submitted versions/files, missing
  sent feedback, and missing teacher final marks.
- Readiness warnings show missing or unresolved consistency review signals and missing audit history.
- The report includes a ZIP export section. Export is enabled only when readiness has no blocking issues.
- The ZIP export includes:
  - latest A-E uploaded files
  - `report.html`
  - `report.json`
  - `manifest.json` with entry sizes and SHA-256 checksums
  - `audit-summary.json`
  - `feedback-summary.json`
  - `marks-summary.json`
  - `consistency-summary.json`
- ZIP export is teacher-only and records `export.package_downloaded` in the audit log.
- Export audit metadata stores package filename, source file count, ZIP entry count, ZIP size, and generation time.
- Student final report shows the latest export record, including teacher, timestamp, package filename, file count, entry
  count, and package size when available.
- The report is currently an HTML/printable page plus ZIP package. It is not yet a formal rendered PDF moderation package.

### File Access

- Uploaded files are stored locally under `/uploads`.
- Files are served through authenticated `/api/files/[fileId]`.
- PDF files can be previewed inline from teacher criterion review pages through the same authenticated file route.
- Students can access their own files.
- Teachers can access files for classes they own.
- Deliverable file assets are served through the same authenticated route and are accessible to the owning student,
  class teacher, or admin.

## Designed But Not Yet Implemented

### Teacher-Only Semantic Extraction Confirmation

The v1 design included possible student-facing confirmation where students confirm or edit extracted IA elements.
Current product direction keeps AI data quality verification teacher-owned rather than student-owned.

Current implementation has the `SemanticExtraction` table, automatic generation, teacher confirmation, and teacher
review UI. It does not include student-facing extraction editing/confirmation by design.

### LLM Delta Review Upgrade

The v1 design includes AI review of differences between two versions of the same criterion, especially whether a
student addressed previous feedback.

Current implementation stores version history and rule-based `DeltaReview` records with resolved/remaining/new evidence
sections. It does not yet run LLM examiner-mode delta review.

### Student-Facing Marks

The v1 design separates teacher final marks from AI suggestions.

Current implementation stores teacher final marks on `MarkingSnapshot`, but final marks are teacher-facing only. There
is no student-facing final mark release workflow yet.

### Formal Feedback Approval Workflow

The v1 design separates draft, approved, sent, and superseded feedback states.

Current implementation has `FeedbackSnapshot` records and supports draft, sent, and superseded behavior. It does not
yet have a separate approve step, correction notes, or exported feedback artifacts.

### Feedback Templates And Formal PDF Exports

The v1 design includes reusable feedback templates plus Markdown/PDF feedback export.

Current implementation has built-in code-defined comment templates grouped by criterion and student printable feedback
pages that can be saved as PDF through the browser. It does not yet have a database-backed `FeedbackTemplate` model,
teacher-customizable templates, or server-rendered formal feedback PDF artifacts.

### Lock/Withdraw Workflow

The state machine includes `locked`, `withdrawn`, and reopen flows with audit reasons.

Current implementation has the `locked` enum value, final submission locking behavior from the student side, and an
explicit teacher reopen flow for final-submitted criterion slots with audit reason capture. It does not yet include
teacher lock, admin lock, or withdraw UI.

### REST API Route Parity

The API design document proposes REST-style `/api/...` routes for most operations.

Current implementation uses Next.js Server Actions for most mutations and page-level data loading. The only major API
routes currently implemented are NextAuth and authenticated file downloads.

### Reminder Rules And Notifications

The domain model includes reminder rules, reminder logs, and milestone notification concepts.

Current implementation shows due statuses in the UI but does not send email reminders or store reminder history.

### Compliance Reports

The v1 design includes compliance-oriented checks such as file validation, missing sections, word count, final package
readiness, and audit-safe submission reports.

Current implementation validates file type and size and shows final package readiness checks in the student report.
It does not yet generate a formal standalone compliance report.

### Final Package Export

The state machine notes that per-criterion `final_submitted` is not the same as a complete exported IA package.

Current implementation supports final submission locking across passed criteria, a teacher-facing HTML student report,
readiness checks for the final package, and a teacher-only downloadable ZIP package. It does not build a persistent
`FinalPackage` model or formal rendered PDF moderation package.

### Advanced Teacher Queue Controls

The teacher UI spec includes filters by criterion, late status, student, and milestone, plus batch actions.

Current implementation has status-focused review queues and compact class/student pages. Student scale is currently
small, so broader search/filter work has been intentionally deprioritized.

## Intentional Or Deferred Scope

- No online IA document editor.
- No plagiarism detection.
- No authenticity verification.
- No AI writing assistant for students.
- No video semantic review yet.
- No multi-school SaaS administration.
- No IBIS integration.

## Key Implementation Deviations From V1 Design

- Server Actions are used for most workflows instead of REST routes.
- Feedback now has `FeedbackSnapshot` records; sent feedback is still mirrored onto slot/version records for legacy
  student-facing reads.
- AI review output is stored in `AIReviewRun.rawResponse` and `AIReviewFinding`, not a separate `CriterionReview`
  table.
- Marking assistant has its own `MarkingSnapshot` table, but it is currently rule-based rather than full examiner-mode
  LLM marking.
- Semantic extraction has its own `SemanticExtraction` table, but it is currently heuristic/text-snippet based rather
  than a full AI-validated semantic model.
- Final submission is represented by criterion slot status `final_submitted`, not a separate `FinalPackage` model.
- Navigation uses a top/global layout rather than the sidebar-first teacher UI described in the original spec.

## Recommended Next Sprints

1. **LLM Marking Assistant Upgrade**
   Upgrade the current rule-based marking assistant to LLM-assisted examiner-mode review.

2. **LLM Consistency Review Upgrade**
   Upgrade the current rule-based consistency checks to LLM-assisted checks using confirmed semantic extraction.

3. **LLM Delta Review Upgrade**
   Upgrade the current rule-based delta review to LLM-assisted comparison against previous teacher feedback.

4. **Formal Feedback Approval Step**
   Add an explicit approve action before sent feedback if the workflow needs stricter review control.

5. **Teacher Semantic Extraction Editor**
   Add a teacher-facing semantic extraction editor if the current confirm/regenerate flow proves too coarse. Student
   confirmation is intentionally not planned for the current simple-teacher-tool direction.

6. **Formal PDF Package Export**
   Add a rendered PDF report and optional persistent `FinalPackage` model after ZIP export is stable.
