export const defaultClassMilestones = [
  { title: "Project proposal approved", criterionCode: null },
  { title: "Criterion A: Problem specification", criterionCode: "A" },
  { title: "Criterion B: Planning", criterionCode: "B" },
  { title: "Criterion C: System overview", criterionCode: "C" },
  { title: "Criterion D: Development checkpoint", criterionCode: "D" },
  { title: "Criterion E: Evaluation draft", criterionCode: "E" },
  { title: "Final IA package ready", criterionCode: null },
] as const;

export const milestoneCriterionTitleMap = new Map(
  defaultClassMilestones
    .filter((milestone) => milestone.criterionCode)
    .map((milestone) => [milestone.title, milestone.criterionCode]),
);
