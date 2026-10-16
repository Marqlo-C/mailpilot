export const FILTER_OUT_REGEX =
  /(?:installation|getting started|how to run|prerequisites|requirements|license|contributing|contributors|code of conduct|badges|sponsors)/i;

export const PRIORITY_REGEX =
  /(?:architecture|system design|data flow|components|protocols|concurrency|pipeline|benchmarks|performance|security|storage|api specification|models)/i;

interface SectionChunk {
  heading: string;
  level: number;
  content: string;
}

/**
 * Strips non-technical boilerplate (badges, raw images, sponsor links, HTML comments),
 * chunks content by markdown headings, filters out non-technical sections (installation,
 * licenses, contributing guidelines), and synthesizes a high-density digest prioritizing
 * architectural and systems specifications up to budget.
 */
export function extractSemanticMarkdownDigest(
  rawMarkdown: string,
  budget: number = 4000
): string {
  if (!rawMarkdown || !rawMarkdown.trim()) return "";

  // 1. Strip non-technical boilerplate
  const cleaned = rawMarkdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/\!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(
      /\[(?:sponsor|donate|patreon|opencollective|buy me a coffee|ko-fi)[^\]]*\]\([^)]*\)/gi,
      ""
    )
    .replace(/<\/?(?:div|p|span|center)\b[^>]*>/gi, "");

  const lines = cleaned.split(/\r?\n/);
  const introLines: string[] = [];
  const sections: SectionChunk[] = [];
  let currentSection: SectionChunk | null = null;
  let passedTitle = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim().replace(/^[\d.]+\s*/, "");

      if (!passedTitle && level === 1 && sections.length === 0 && !currentSection) {
        passedTitle = true;
        continue;
      }

      passedTitle = true;
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        heading: headingText,
        level,
        content: "",
      };
    } else {
      if (!currentSection) {
        if (line.trim().length > 0 || introLines.length > 0) {
          introLines.push(line);
        }
      } else {
        currentSection.content += line + "\n";
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  const introSummary = introLines.join("\n").trim();

  const prioritySections: SectionChunk[] = [];
  const neutralSections: SectionChunk[] = [];

  for (const sec of sections) {
    if (FILTER_OUT_REGEX.test(sec.heading)) {
      continue;
    }
    if (PRIORITY_REGEX.test(sec.heading)) {
      prioritySections.push(sec);
    } else {
      neutralSections.push(sec);
    }
  }

  if (sections.length === 0) {
    return introSummary.slice(0, budget).trim();
  }

  let digest = introSummary;

  const appendSection = (sec: SectionChunk) => {
    const trimmed = sec.content.trim();
    if (!trimmed) return;
    const block = `${digest ? "\n\n" : ""}## ${sec.heading}\n${trimmed}`;
    if (digest.length + block.length <= budget) {
      digest += block;
    } else {
      const remaining = budget - digest.length;
      if (remaining > 120) {
        const slice = block.slice(0, remaining).replace(/\s+\S*$/, "");
        digest += slice;
      }
    }
  };

  for (const sec of prioritySections) {
    if (digest.length >= budget) break;
    appendSection(sec);
  }

  for (const sec of neutralSections) {
    if (digest.length >= budget) break;
    appendSection(sec);
  }

  return digest.trim();
}
