import type { ReactNode } from "react";

type FeedbackDisplayProps = {
  content: string;
  className?: string;
};

type FeedbackSection = {
  title: string | null;
  lines: string[];
};

type FeedbackBlock =
  | { type: "paragraph"; text: string }
  | { type: "subheading"; text: string }
  | { type: "list"; listType: "ordered" | "unordered"; items: string[] };

const sectionHeadings = new Set([
  "ai review summary",
  "summary",
  "strengths",
  "concerns",
  "concern",
  "suggestions",
  "suggested next steps",
  "next steps",
  "what is working",
  "what to revise",
  "next actions",
  "teacher feedback",
]);

export function FeedbackDisplay({ content, className = "" }: FeedbackDisplayProps) {
  const sections = parseFeedbackSections(content);

  return (
    <div className={`grid gap-5 text-sm leading-7 ${className}`}>
      {sections.map((section, index) => (
        <section
          key={`${section.title ?? "section"}-${index}`}
          className={
            section.title
              ? `break-inside-avoid rounded-md border p-4 print:bg-white ${getSectionTone(section.title)}`
              : ""
          }
        >
          {section.title ? (
            <p className="text-sm font-semibold tracking-normal">
              {formatSectionTitle(section.title)}
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
          const ListTag = block.listType === "ordered" ? "ol" : "ul";
          const listClassName =
            block.listType === "ordered"
              ? "grid list-decimal gap-2 pl-5"
              : "grid list-disc gap-2 pl-5";

          return (
            <ListTag key={index} className={listClassName}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="whitespace-pre-wrap">
                  <MarkdownInline text={item} />
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "subheading") {
          return (
            <p key={index} className="text-sm font-semibold text-foreground">
              <MarkdownInline text={block.text} />
            </p>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            <MarkdownInline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

function parseFeedbackSections(content: string) {
  const lines = normalizeMarkdownStructure(content)
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
  const markdownHeading = trimmed.match(/^#{1,6}\s+(.+)$/);
  const headingCandidate = cleanHeadingText(markdownHeading?.[1] ?? trimmed);

  if (sectionHeadings.has(headingCandidate.toLowerCase())) {
    return headingCandidate;
  }

  return null;
}

function groupLines(lines: string[]) {
  const blocks: FeedbackBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ordered" | "unordered" | null = null;

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraph.join(" ").replace(/\s+/g, " ").trim(),
      });
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length > 0 && listType) {
      blocks.push({ type: "list", listType, items: listItems });
      listItems = [];
      listType = null;
    }
  }

  function addListItem(type: "ordered" | "unordered", item: string) {
    if (listType && listType !== type) {
      flushList();
    }

    listType = type;
    listItems.push(item);
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedBullet = trimmed.match(/^[-*•]\s+(.+)$/);
    const orderedBullet = trimmed.match(/^\d+\.\s+(.+)$/);
    const subheading = trimmed.match(/^#{3,6}\s+(.+)$/);

    if (listItems.length > 0 && /^\s{2,}\S/.test(line)) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]}\n${trimmed}`;
      continue;
    }

    if (unorderedBullet) {
      flushParagraph();
      addListItem("unordered", unorderedBullet[1].trim());
      continue;
    }

    if (orderedBullet) {
      flushParagraph();
      addListItem("ordered", orderedBullet[1].trim());
      continue;
    }

    if (subheading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "subheading", text: subheading[1].trim() });
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function normalizeMarkdownStructure(content: string) {
  return content
    .replace(/[ \t]+(#{2,6}\s+)/g, "\n\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function MarkdownInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);

  return (
    <>
      {parts.map((part, index): ReactNode => {
        const boldText =
          part.startsWith("**") && part.endsWith("**")
            ? part.slice(2, -2)
            : part.startsWith("__") && part.endsWith("__")
              ? part.slice(2, -2)
              : null;

        if (boldText) {
          return (
            <strong key={index} className="font-semibold">
              {boldText}
            </strong>
          );
        }

        return part;
      })}
    </>
  );
}

function cleanHeadingText(value: string) {
  return value
    .replace(/^\*\*/, "")
    .replace(/\*\*$/, "")
    .replace(/^__/, "")
    .replace(/__$/, "")
    .replace(/:$/, "")
    .trim();
}

function formatSectionTitle(title: string) {
  return title
    .split(/\s+/)
    .map((word) => (word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

function getSectionTone(title: string) {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("strength")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (normalizedTitle.includes("working")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (normalizedTitle.includes("concern")) {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  if (normalizedTitle.includes("revise")) {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  if (
    normalizedTitle.includes("suggest") ||
    normalizedTitle.includes("next step") ||
    normalizedTitle.includes("next action")
  ) {
    return "border-blue-200 bg-blue-50 text-blue-950";
  }

  return "border-slate-200 bg-slate-50 text-slate-950";
}
