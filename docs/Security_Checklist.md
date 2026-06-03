# IA Supervisor Security Checklist

Last updated: 2026-05-25

This checklist summarizes the current MVP security posture. It is not a penetration test, but it documents the
authorization and audit controls currently implemented before adding more production features.

## Authentication

- NextAuth Credentials provider validates email/password against `User.passwordHash`.
- Passwords are hashed with bcrypt before storage.
- Session strategy is JWT-based.
- Demo accounts are seeded for local development only.
- Teacher registration requires `TEACHER_SIGNUP_CODE`.
- Student registration requires a valid active class invite code.

## Role Boundaries

- Teacher pages require `user.role === "teacher"`.
- Student pages require `user.role === "student"`.
- Admin assessment reference pages require `user.role === "admin"`.
- Student class and criterion pages query enrollment by both `classId` and `studentId`.
- Teacher class, student, criterion, analytics, report, and export pages query class ownership by `teacherId`.
- File download allows access only to:
  - admin users
  - the file owner
  - the enrolled student
  - the teacher who owns the class

## Server Actions

- Student submission updates verify the slot belongs to the current student and class.
- Student final submission verifies the enrollment belongs to the current student.
- Teacher feedback updates verify the slot belongs to a class owned by the current teacher.
- Teacher reopen final submission verifies the slot belongs to a class owned by the current teacher.
- Teacher milestone create/update/delete verifies class ownership.
- Teacher AI review, semantic extraction, consistency review, marking assistant, and final mark actions verify class
  ownership before running.
- Admin assessment reference updates require an admin user.

## High-Risk Workflow Audit

The following actions are recorded in `AuditLog`:

- `auth.user_registered`
- `class.created`
- `enrollment.joined`
- `submission.version_submitted`
- `submission.note_saved`
- `submission.final_submitted`
- `review.status_changed`
- `review.feedback_saved`
- `review.final_submission_reopened`
- `ai_review.completed`
- `ai_review.failed`
- `semantic_extraction.generated`
- `semantic_extraction.failed`
- `semantic_extraction.teacher_confirmed`
- `semantic_extraction.student_confirmed`
- `consistency_review.completed`
- `marking_assistant.completed`
- `marking.final_mark_saved`
- `assessment_reference.updated`
- `export.package_downloaded`

## Export Controls

- Final package ZIP export is teacher-only.
- Export requires package readiness with no blocking issues:
  - all criteria final submitted
  - latest submitted version exists
  - latest files exist
  - sent feedback exists
  - teacher final mark exists
- Export ZIP includes `manifest.json` with entry sizes and SHA-256 checksums.
- Export audit metadata stores package filename, source file count, ZIP entry count, ZIP size, and generated timestamp.

## Response Hardening

- Middleware sets:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security` on HTTPS requests

## Remaining Risks / Deferred Production Work

- No request rate limiting yet for login, registration, invite-code join, AI review, or export routes.
- No email verification or password reset workflow yet.
- No account lockout or suspicious login detection.
- Uploaded files are stored on local disk, not object storage with malware scanning.
- No CSRF-specific custom protection beyond Next.js Server Action mechanics and same-site session behavior.
- No persistent `FinalPackage` model yet; exports are generated on demand and logged through audit records.
- No organization/school-level tenancy model yet.
- No formal security tests or dependency vulnerability gate in CI yet.
