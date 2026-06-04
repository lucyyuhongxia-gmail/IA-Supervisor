type FeedbackDisplayProps = {
  content: string;
  className?: string;
};

type FeedbackSection = {
  title: string | null;
  lines: string[];
};

const sectionHeadings = new Set([
  "ai review summary",
  "summary",
  "strengths",
  "concerns",
  "concern",
  "suggestions",
  "suggested next steps",
  "next steps",
  "teacher feedback",
]);

export function FeedbackDisplay({ content, className = "" }: FeedbackDisplayProps) {
  const sections = parseFeedbackSections(content);

  return (
    <div className={`grid gap-4 text-sm leading-6 ${className}`}>
      {sections.map((section, index) => (
        <section
          key={`${section.title ?? "section"}-${index}`}
          className={section.title ? `rounded-md border p-3 ${getSectionTone(section.title)}` : ""}
        >
          {section.title ? (
            <p className="text-xs font-semibold uppercase tracking-normal">
              {section.title}
            </p>
          ) : null}
          <FeedbackLines lines={section.lines} hasTitle={Boolean(section.title)} />
        </section>
      ))}
    </div>
  );
}

function FeedbackLines({
  lines,
  hasTitle,
}: {
  lines: string[];
  hasTitle: boolean;
}) {
  const blocks = groupLines(lines);

  return (
    <div className={`grid gap-3 ${hasTitle ? "mt-2" : ""}`}>
      {blocks.map((block, index) => {
        if (block.type === "list") {
          return (
            <ul key={index} className="grid list-disc gap-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function parseFeedbackSections(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const sections: FeedbackSection[] = [];
  let currentSection: FeedbackSection = { title: null, lines: [] };

  for (const line of lines) {
    const heading = getSectionHeading(line);

    if (heading) {
      if (currentSection.title || currentSection.lines.some((item) => item.trim())) {
        sections.push(currentSection);
      }

      currentSection = { title: heading, lines: [] };
      continue;
    }

    currentSection.lines.push(line);
  }

  if (currentSection.title || currentSection.lines.some((line) => line.trim())) {
    sections.push(currentSection);
  }

  return sections.length > 0 ? sections : [{ title: null, lines: [content] }];
}

function getSectionHeading(line: string) {
  const trimmed = line.trim();

  if (!trimmed.endsWith(":")) {
    return null;
  }

  const heading = trimmed.slice(0, -1).trim();

  return sectionHeadings.has(heading.toLowerCase()) ? heading : null;
}

function groupLines(lines: string[]) {
  const blocks: Array<
    | { type: "paragraph"; text: string }
    | { type: "list"; items: string[] }
  > = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n").trim() });
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph();
      listItems.push(trimmed.slice(2).trim());
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function getSectionTone(title: string) {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("strength")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (normalizedTitle.includes("concern")) {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  if (
    normalizedTitle.includes("suggest") ||
    normalizedTitle.includes("next step")
  ) {
    return "border-blue-200 bg-blue-50 text-blue-950";
  }

  return "border-slate-200 bg-slate-50 text-slate-950";
}
