export const FILTER_OUT_REGEX =
  /(?:installation|getting started|how to run|how to use|quick\s*start|usage|prerequisites|requirements|dependencies|local setup|running locally|development setup|license|contributing|contributors|code of conduct|badges|sponsors|troubleshooting|faq|how to (?:add|customize|create)|adding custom|customization guide|user guide|walkthrough)/i;

export const PRIORITY_REGEX =
  /(?:architecture|system design|data flow|components|protocols|concurrency|pipeline|benchmarks|performance|security|storage|api specification|models|rate limit|waf|telemetry|infrastructure|internals|implementation)/i;

interface SectionChunk {
  heading: string;
  level: number;
  content: string;
}

/**
 * Truncates text cleanly at sentence or word boundaries up to maxLen.
 */
function cleanTruncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 0) return "";
  const sliced = text.slice(0, maxLen);
  const sentenceMatch = sliced.match(/^([\s\S]*[.!?])(?:\s|$)/);
  if (sentenceMatch && sentenceMatch[1].length >= maxLen * 0.4) {
    return sentenceMatch[1].trim();
  }
  const wordMatch = sliced.match(/^([\s\S]*\S)\s+\S*$/);
  if (wordMatch && wordMatch[1].length >= maxLen * 0.3) {
    return wordMatch[1].trim();
  }
  return sliced.trimEnd();
}

/**
 * Strips non-technical boilerplate (badges, raw images, sponsor links, HTML comments),
 * chunks content by markdown headings, filters out non-technical sections (installation,
 * licenses, contributing guidelines), and synthesizes a high-density digest using proportional
 * section budgeting to ensure all architectural and technical sections are represented up to budget.
 */
export function extractSemanticMarkdownDigest(
  rawMarkdown: string,
  budget: number = 4000
): string {
  if (!rawMarkdown || !rawMarkdown.trim()) return "";

  // 1. Strip non-technical boilerplate (badges, raw images, sponsor links, HTML comments, shell code blocks & install/clone commands)
  const cleaned = rawMarkdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/\!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(
      /\[(?:sponsor|donate|patreon|opencollective|buy me a coffee|ko-fi)[^\]]*\]\([^)]*\)/gi,
      ""
    )
    .replace(/<\/?(?:div|p|span|center)\b[^>]*>/gi, "")
    // Purge multiline terminal & shell code fences (e.g. ```bash ... ```, ```sh ... ```)
    .replace(
      /(?:```|~~~)(?:bash|sh|shell|zsh|console|terminal|cmd|powershell|posh)\b[\s\S]*?(?:```|~~~)/gi,
      ""
    )
    // Purge untagged code blocks that start with interactive shell prompts ($ or >)
    .replace(/(?:```|~~~)\s*\n\s*(?:\$|>)\s+[^\n]+[\s\S]*?(?:```|~~~)/gi, "")
    .replace(/(?:npm|pnpm|yarn|bun)\s+(?:install|i|add)[^\n]*/gi, "")
    .replace(/(?:pip|pip3|poetry\s+add|cargo\s+add|go\s+get)\s+[^\n]*/gi, "")
    .replace(/(?:git\s+clone)\s+[^\n]*/gi, "");

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

  const candidateSections: {
    heading: string;
    content: string;
    fullLength: number;
    isPriority: boolean;
  }[] = [];

  for (const sec of sections) {
    if (FILTER_OUT_REGEX.test(sec.heading)) {
      continue;
    }
    const trimmed = sec.content.trim();
    if (!trimmed) continue;
    const header = `## ${sec.heading}\n`;
    candidateSections.push({
      heading: sec.heading,
      content: trimmed,
      fullLength: header.length + trimmed.length,
      isPriority: PRIORITY_REGEX.test(sec.heading),
    });
  }

  if (candidateSections.length === 0) {
    return introSummary.slice(0, budget).trim();
  }

  // 2. Allocate a small slice for introductory summary (up to ~500–600 chars)
  let introPortion = introSummary;
  if (introPortion.length > 600) {
    introPortion = cleanTruncate(introPortion, 600);
  }
  if (introPortion.length >= budget - 100) {
    introPortion = cleanTruncate(introPortion, Math.max(0, budget - 100));
  }

  const introOverhead = introPortion ? introPortion.length + 2 : 0;
  const budgetForSections = Math.max(0, budget - introOverhead);

  // 3. Distribute remaining budget proportionally across surviving candidate sections (1.4x weighting for priority)
  const separatorOverhead = Math.max(0, (candidateSections.length - 1) * 2);
  const availableContentBudget = Math.max(0, budgetForSections - separatorOverhead);

  const allocations = new Array(candidateSections.length).fill(0);
  let unallocatedBudget = availableContentBudget;
  let activeIndices = candidateSections.map((_, i) => i);

  while (activeIndices.length > 0 && unallocatedBudget > 0) {
    const totalWeight = activeIndices.reduce(
      (sum, idx) => sum + (candidateSections[idx].isPriority ? 1.4 : 1.0),
      0
    );
    let anyCapped = false;
    const remainingIndices: number[] = [];

    for (const idx of activeIndices) {
      const weight = candidateSections[idx].isPriority ? 1.4 : 1.0;
      const share = Math.floor((unallocatedBudget * weight) / totalWeight);
      const fullLen = candidateSections[idx].fullLength;

      if (fullLen <= share) {
        allocations[idx] = fullLen;
        unallocatedBudget -= fullLen;
        anyCapped = true;
      } else {
        remainingIndices.push(idx);
      }
    }

    if (!anyCapped || remainingIndices.length === 0) {
      const remainingWeight = remainingIndices.reduce(
        (sum, idx) => sum + (candidateSections[idx].isPriority ? 1.4 : 1.0),
        0
      );
      for (const idx of remainingIndices) {
        const weight = candidateSections[idx].isPriority ? 1.4 : 1.0;
        const share = Math.min(
          candidateSections[idx].fullLength,
          Math.floor((unallocatedBudget * weight) / remainingWeight)
        );
        allocations[idx] = share;
      }
      break;
    }

    activeIndices = remainingIndices;
  }

  // 4. Render sections cleanly with sentence/word truncation
  const sectionBlocks: string[] = [];
  for (let i = 0; i < candidateSections.length; i++) {
    const sec = candidateSections[i];
    const alloc = allocations[i];
    if (alloc <= 0) continue;

    const header = `## ${sec.heading}\n`;
    if (alloc <= header.length) {
      continue;
    }

    const contentBudget = alloc - header.length;
    const trimmedContent = sec.content;
    let sectionContent =
      trimmedContent.length <= contentBudget
        ? trimmedContent
        : cleanTruncate(trimmedContent, contentBudget);

    const fenceCount = (sectionContent.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      sectionContent += "\n```";
    }

    if (sectionContent) {
      sectionBlocks.push(`${header}${sectionContent}`);
    }
  }

  let digest = introPortion;
  if (sectionBlocks.length > 0) {
    const sectionsJoined = sectionBlocks.join("\n\n");
    digest = digest ? `${digest}\n\n${sectionsJoined}` : sectionsJoined;
  }

  return digest.slice(0, budget).trim();
}
