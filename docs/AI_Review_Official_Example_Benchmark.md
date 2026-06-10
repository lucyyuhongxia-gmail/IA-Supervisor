# AI Review Official Example Benchmark

This benchmark checks IA Supervisor AI feedback against the official IB Computer Science IA 2027 example submissions and examiner comments stored locally under:

```text
docs/test/IA-example for 2027/
```

It is a teacher/developer quality-control tool. It does not send feedback to students and does not change submission status.

## Setup

Load the official example data:

```bash
npm run demo:official-examples
```

This creates:

- one class: `IB CS IA 2027 Official Examples`
- eight students: `official-example-1@student.test` through `official-example-8@student.test`
- submitted versions for Criteria A-E
- deliverable evidence for criterion documents, the 5-minute video, and the final package

## Run

Check the configured provider first:

```bash
npm run ai-review:check-provider
```

Preview which official reviews would run:

```bash
npm run ai-review:run-official -- --dry-run
```

Run a small batch first:

```bash
npm run ai-review:run-official -- --limit 5
```

Run all missing or stale official-example AI reviews:

```bash
npm run ai-review:run-official
```

The runner reuses the production AI review service and writes normal `AIReviewRun` rows. It skips completed reviews that already cover the latest submitted version unless `--force` is used.

After AI reviews have been run for the official examples:

```bash
npm run ai-review:benchmark-official
```

While setting up the official data, use:

```bash
npm run ai-review:benchmark-official -- --allow-missing
```

`--allow-missing` lets the command complete when AI reviews have not yet been generated.

## Output

Reports are written to:

```text
tmp/ai-review-benchmark/
  official-examples-ai-review-benchmark.json
  official-examples-ai-review-benchmark.md
```

The report checks:

- 40 expected AI reviews: 8 examples x 5 criteria
- official examiner comment extraction
- criterion-specific focus-term overlap
- evidence-grounded feedback structure
- `studentFeedbackDraft` Markdown headings
- rubric alignment presence
- no mark, score, grade, or level prediction

## Useful Commands

Run one criterion for one student:

```bash
npm run ai-review:run-official -- --student official-example-1@student.test --criterion A
```

Rerun one review even if it is already current:

```bash
npm run ai-review:run-official -- --student official-example-1@student.test --criterion A --force
```

Run all Criterion A reviews:

```bash
npm run ai-review:run-official -- --criterion A
```

## Interpretation

Missing reviews mean the teacher/developer still needs to run AI review for that criterion.

Quality warnings do not automatically mean the AI review is wrong. They identify places where teacher judgement should inspect whether the feedback is too generic, insufficiently aligned to the 2027 syllabus, or weakly connected to official examiner concerns.

The benchmark is not an examiner replacement. It is a regression tool to keep AI feedback close to experienced IB CS teacher feedback.
