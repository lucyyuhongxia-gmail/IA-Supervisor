# AI Review Evaluation Harness

Last updated: 2026-05-25

The AI review evaluation harness checks whether stored or fixture AI review output is evidence-grounded and aligned
with the IB Computer Science IA 2027 feedback expectations. It does not call DeepSeek or any other LLM.

## Commands

Evaluate a specific AI review run:

```bash
npm run ai-review:evaluate -- --run-id <aiReviewRunId>
```

Evaluate the latest AI review run for a submission slot:

```bash
npm run ai-review:evaluate -- --slot-id <submissionSlotId>
```

Evaluate a JSON fixture:

```bash
npm run ai-review:evaluate -- --file path/to/review.json
```

Allow failures while still returning exit code `0`:

```bash
npm run ai-review:evaluate -- --run-id <aiReviewRunId> --allow-fail
```

## Checks

The harness reports pass, warning, and failure checks for:

- completed review status
- summary presence
- concern/suggestion presence
- evidence cited for concerns and suggestions
- `Issue`, `Why it matters`, and `Revision guidance` structure
- action-oriented suggestion text
- 2027 syllabus alignment signal
- forbidden extraction contradictions
- accidental mark, score, grade, or level prediction
- rubric alignment status and evidence
- generic one-line feedback

## Expected AI Review Shape

The harness accepts both:

- current stored `AIReviewRun` + `AIReviewFinding` database records
- JSON fixtures with `summary`, `strengths`, `concerns`, `suggestions`, `rubricAlignment`, and `confidence`

For best results, concerns should normalize into this text pattern:

```text
Evidence: file.pdf · visible heading · "student quote"
Issue type: weak · moderate
Issue: specific problem
Why it matters: criterion-specific explanation
Revision guidance: concrete student action
```

## Exit Code

- Exits `0` when no failure-level checks fail.
- Exits `1` when any failure-level check fails.
- Use `--allow-fail` for exploratory analysis where you still want a complete printed report.
