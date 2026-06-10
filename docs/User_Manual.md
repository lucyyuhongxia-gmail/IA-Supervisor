# IA Supervisor User Manual

This manual describes the current MVP workflow for teachers, students, and administrators.

## 1. Roles

- `teacher`: creates classes, reviews submissions, runs AI review, sends feedback, and tracks progress.
- `student`: joins classes, submits IA files or evidence links, reads feedback, and submits revisions.
- `admin`: manages assessment references and subject templates.

## 2. Teacher Workflow

### 2.1 Create A Class

1. Sign in with a teacher account.
2. Open `/teacher/dashboard`.
3. Use `Create class`.
4. Select the subject template.
5. Enter the class name and exam session.
6. Share the generated invite code with students.

The class receives default criteria, deliverables, and milestones from the subject template.

### 2.2 Review Queue

The teacher dashboard contains a cross-class `Review queue`.

The queue includes:

- Criterion document submissions.
- Deliverable submissions such as the final package or 5-minute video evidence.

Use the queue filters:

- `Active`: submitted, under review, and revision-needed items.
- `Awaiting`: newly submitted items.
- `Under review`: items already opened or being reviewed.
- `Needs revision`: items returned to students.
- `Passed`: accepted items.
- `All`: all reviewable items.

Each queue row shows:

- Student.
- Item type: `Criterion` or `Deliverable`.
- Status.
- AI review state, or `Manual review` for deliverables.
- Class and exam session.
- Version number and submitted timestamp.

Click `Open review` to review the item.

### 2.3 Criterion Review

Use criterion review for rubric-specific IA documents.

1. Open a criterion item from the queue or student page.
2. Check latest files and extracted text.
3. Run AI review when the PDF is readable.
4. Read the AI summary, concerns, suggestions, rubric alignment, and evidence snippets.
5. Copy the AI draft into the teacher feedback box if useful.
6. Edit the feedback using teacher judgement.
7. Save one of the statuses:
   - `Under Review`: teacher-only work in progress.
   - `Revision Needed`: sends feedback to the student.
   - `Passed`: accepts the criterion.

AI feedback is advisory. Teacher judgement remains final.

### 2.4 Deliverable Review

Use deliverable review for template-level submissions.

Examples:

- Criterion A document.
- Criterion B document.
- Criterion D document.
- 5-minute video evidence.
- Final package.

1. Open a deliverable item from the review queue or the student page.
2. Inspect the submitted file or evidence link.
3. Check version history and extracted text when available.
4. Enter teacher feedback if needed.
5. Set:
   - `Under Review`
   - `Revision Needed`
   - `Passed`

Students see deliverable feedback on the corresponding deliverable page.

### 2.5 Deliverable And Criterion Status

Deliverables can be linked to one or more criteria.

The system keeps criterion progress aligned with linked deliverables when the student has not submitted a separate criterion document version.

The aggregation rule is:

- If any linked deliverable needs revision, the criterion shows `Revision Needed`.
- If any linked deliverable is under review, the criterion shows `Under Review`.
- If any linked deliverable is submitted, the criterion shows `Submitted`.
- If some linked deliverables are passed but others are not complete yet, the criterion shows `Submitted`.
- If every linked non-final-package deliverable is passed, the criterion shows `Passed`.
- Final package deliverables do not change criterion status.

For IB Computer Science IA 2027, Criterion D is linked to both the development document and the 5-minute video evidence. Criterion D is only treated as passed after both linked deliverables are passed.

Derived criterion statuses do not create separate teacher queue items. Teachers review the actual deliverable item from the queue.

### 2.6 Class Pages

Class pages show:

- Students enrolled in the class.
- Criterion progress.
- Deliverable progress.
- Milestones.
- Analytics link.

Open a student to see the student's full submission map.

## 3. Student Workflow

### 3.1 Join A Class

1. Register or sign in as a student.
2. Open `/student/dashboard`.
3. Enter the class invite code.
4. Click `Join class`.

### 3.2 Submit Work

1. Open the class.
2. Open the required deliverable or criterion.
3. Upload the required PDF, or provide an evidence link when the deliverable asks for a link.
4. Add a short note to the teacher if needed.
5. Submit.

Document uploads must be readable PDFs. Scanned/image-only PDFs are not suitable for AI review.

### 3.3 Read Feedback

When a teacher returns work:

1. Open the class.
2. Open the relevant criterion or deliverable.
3. Read the teacher feedback.
4. Revise the work.
5. Submit a new version.

Students can print or save feedback as PDF from the feedback page.

## 4. Admin Workflow

### 4.1 Assessment References

Admins manage the active assessment reference used by AI review.

Open:

```text
/admin/assessment
```

The current default reference is:

```text
IB Computer Science IA 2027
```

The local reference files are stored in:

```text
docs/assessment/ib-cs-ia-2027/
  criteria.md
  rubric.md
  prompt-guidance.md
```

### 4.2 Subject Templates

Subject templates define:

- Criteria.
- Rubrics.
- Deliverable templates.
- Milestone templates.

Teachers create classes from published subject templates. Teachers can adjust class-level deadlines, while the subject-level assessment structure stays controlled by admin.

## 5. Current Product Rules

- PDF document submissions only.
- Video deliverables use evidence links.
- PDF upload limit: 25 MB.
- Every submission creates a new immutable version.
- Teacher feedback is attached to the reviewed version.
- AI review must follow the active assessment reference.
- AI review is not visible to students until the teacher sends edited feedback.
- Criterion progress is synchronized from linked deliverables unless the student has submitted a separate criterion version.
- Final package deliverables are for final archiving and do not change criterion status.

## 6. Common Problems

### PDF Text Cannot Be Extracted

Use a text-based PDF. Avoid scanned PDFs unless OCR has been applied.

### Student Cannot See Feedback

Feedback is visible only after the teacher saves the item as `Revision Needed` or `Passed`.

### DeepSeek Authentication Fails

Check:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- Account permissions for the selected model

Restart the development server after changing `.env`.
