export type FeedbackTemplate = {
  id: string;
  criterionCode: string;
  title: string;
  comment: string;
  teacherNote: string;
};

const commonTemplates: FeedbackTemplate[] = [
  {
    id: "common-evidence-needed",
    criterionCode: "common",
    title: "Evidence is too general",
    comment:
      "Your explanation makes a claim, but it needs clearer evidence from the document, product, test results, or appendix. Add a specific example and explain how it supports the point you are making.",
    teacherNote:
      "Use when the student has a plausible claim but the evidence is not specific enough.",
  },
  {
    id: "common-link-back",
    criterionCode: "common",
    title: "Link back to earlier criteria",
    comment:
      "This section should connect more explicitly to the earlier IA criteria. Refer back to the relevant requirement, success criterion, design decision, or test result so the reader can see the development of your argument.",
    teacherNote:
      "Useful when the work is fragmented and does not show continuity across A-E.",
  },
];

const criterionTemplates: Record<string, FeedbackTemplate[]> = {
  A: [
    {
      id: "a-measurable-success-criteria",
      criterionCode: "A",
      title: "Success criteria are not measurable",
      comment:
        "Your success criteria need to be more measurable. Rewrite them so that each one can be tested later, with a clear expected outcome or observable condition.",
      teacherNote:
        "Use when success criteria are vague, subjective, or hard to evaluate in Criterion E.",
    },
    {
      id: "a-problem-context-broad",
      criterionCode: "A",
      title: "Problem context is too broad",
      comment:
        "The problem context is currently too broad. Make the client/user, problem situation, and need more specific so the proposed solution is clearly justified.",
      teacherNote:
        "Use when the student describes a general app idea rather than a specific problem.",
    },
    {
      id: "a-computational-context",
      criterionCode: "A",
      title: "Computational context needs clarity",
      comment:
        "Clarify why this problem is suitable for a computational solution. Identify the data, processes, users, and constraints that make a coded solution appropriate.",
      teacherNote:
        "Use when the project goal is clear but the CS relevance is weak.",
    },
  ],
  B: [
    {
      id: "b-decomposition-needed",
      criterionCode: "B",
      title: "Decomposition needs more structure",
      comment:
        "Break the project into clearer components or tasks. The plan should show how the main problem is decomposed into parts that can be designed, developed, tested, and evaluated.",
      teacherNote:
        "Use when planning is a timeline only and lacks system/component decomposition.",
    },
    {
      id: "b-plan-not-linked-to-a",
      criterionCode: "B",
      title: "Plan not linked to Criterion A",
      comment:
        "Link the plan more clearly to the requirements and success criteria from Criterion A. The reader should be able to see how each planned task supports the agreed product goals.",
      teacherNote:
        "Use when the plan exists but does not follow from the problem specification.",
    },
    {
      id: "b-tools-research-missing",
      criterionCode: "B",
      title: "Tools or research need justification",
      comment:
        "Explain why the chosen tools, libraries, data structures, or development approach are appropriate for this project. Avoid only listing tools; justify the choices.",
      teacherNote:
        "Use when technical choices are named without rationale.",
    },
  ],
  C: [
    {
      id: "c-system-model-relationships",
      criterionCode: "C",
      title: "System model lacks relationships",
      comment:
        "The system model should show how the main components relate to one another. Add or improve diagrams/explanations that make data flow, user interaction, and component responsibilities clear.",
      teacherNote:
        "Use when diagrams list parts but do not explain relationships.",
    },
    {
      id: "c-algorithms-not-clear",
      criterionCode: "C",
      title: "Algorithms need clearer representation",
      comment:
        "Present the key algorithms more clearly. Use pseudocode, flowcharts, or structured explanation so that a reader can understand the logic without relying only on final code.",
      teacherNote:
        "Use when algorithmic thinking is implied but not documented.",
    },
    {
      id: "c-testing-strategy-alignment",
      criterionCode: "C",
      title: "Testing strategy not aligned",
      comment:
        "Align the testing strategy with the success criteria. For each important criterion, show what will be tested, the expected result, and why that test demonstrates success.",
      teacherNote:
        "Use when tests are generic or not connected to Criterion A.",
    },
  ],
  D: [
    {
      id: "d-techniques-listed-not-explained",
      criterionCode: "D",
      title: "Techniques listed but not explained",
      comment:
        "Do not only list implementation techniques. Explain where each technique is used, why it was chosen, and how it contributes to the product's functionality or complexity.",
      teacherNote:
        "Use when Criterion D contains a feature/technology inventory without analysis.",
    },
    {
      id: "d-testing-evidence-general",
      criterionCode: "D",
      title: "Testing evidence is too general",
      comment:
        "Make the testing evidence more specific. Include test cases, expected outcomes, actual outcomes, and references to screenshots, code, appendix evidence, or video evidence where relevant.",
      teacherNote:
        "Use when the student says testing was done but does not document results.",
    },
    {
      id: "d-implementation-choices",
      criterionCode: "D",
      title: "Implementation choices need justification",
      comment:
        "Explain important implementation choices rather than only describing what the code does. Include trade-offs, alternatives considered, or why the chosen approach fits the problem.",
      teacherNote:
        "Use when implementation is descriptive but lacks evaluative explanation.",
    },
  ],
  E: [
    {
      id: "e-not-linked-to-success-criteria",
      criterionCode: "E",
      title: "Evaluation not linked to success criteria",
      comment:
        "Evaluate the product directly against the success criteria from Criterion A. For each criterion, state whether it was met and support the judgement with evidence.",
      teacherNote:
        "Use when evaluation is a general reflection rather than criterion-by-criterion evaluation.",
    },
    {
      id: "e-limitations-unsupported",
      criterionCode: "E",
      title: "Limitations need evidence",
      comment:
        "When discussing limitations, support each point with evidence from testing, user feedback, product behavior, or implementation constraints.",
      teacherNote:
        "Use when limitations are asserted but not justified.",
    },
    {
      id: "e-improvements-specific",
      criterionCode: "E",
      title: "Improvements need specificity",
      comment:
        "Make the proposed improvements more specific and realistic. Explain what would change, why it matters, and how it follows from the evaluation evidence.",
      teacherNote:
        "Use when improvements are generic future features.",
    },
  ],
};

export function getFeedbackTemplatesForCriterion(criterionCode: string) {
  return [
    ...(criterionTemplates[criterionCode] ?? []),
    ...commonTemplates,
  ];
}
