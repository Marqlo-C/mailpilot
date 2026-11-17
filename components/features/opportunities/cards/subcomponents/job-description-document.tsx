"use client";

import {
  parseJobDescriptionBlocks,
  type JobDescriptionBlock,
} from "@/lib/opportunities/context/job-description-blocks";
import {
  splitJobDescriptionInline,
  type JobDescriptionInlinePart,
} from "@/lib/opportunities/context/job-description-inline";
import { cn } from "@/lib/utils";

export type JobDescriptionDocumentProps = {
  markdown: string;
  className?: string;
};

function InlinePartView({ part, index }: { part: JobDescriptionInlinePart; index: number }) {
  if (part.type === "link") {
    return (
      <a
        key={`link-${index}`}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 text-foreground hover:text-foreground/80"
      >
        {part.value}
      </a>
    );
  }
  if (part.type === "bold") {
    return (
      <strong key={`bold-${index}`} className="font-semibold text-foreground">
        {part.value}
      </strong>
    );
  }
  if (part.type === "italic") {
    return (
      <em key={`italic-${index}`} className="italic">
        {part.value}
      </em>
    );
  }
  return <span key={`text-${index}`}>{part.value}</span>;
}

function InlineText({ text }: { text: string }) {
  return (
    <>
      {splitJobDescriptionInline(text).map((part, index) => (
        <InlinePartView key={`${part.type}-${index}`} part={part} index={index} />
      ))}
    </>
  );
}

function BlockView({ block }: { block: JobDescriptionBlock }) {
  if (block.type === "heading") {
    return (
      <h3 className="mt-4 text-sm font-semibold text-foreground first:mt-0">
        <InlineText text={block.text} />
      </h3>
    );
  }

  if (block.type === "list") {
    return (
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90 first:mt-0">
        {block.items.map((item, index) => (
          <li key={`item-${index}`}>
            <InlineText text={item} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="mt-3 text-sm leading-relaxed text-foreground/90 first:mt-0">
      <InlineText text={block.text} />
    </p>
  );
}

/**
 * Renders scrubbed job-description markdown as structured prose for the card modal.
 */
export function JobDescriptionDocument({
  markdown,
  className,
}: JobDescriptionDocumentProps) {
  const blocks = parseJobDescriptionBlocks(markdown);

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No description available.</p>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      {blocks.map((block, index) => (
        <BlockView key={`block-${index}`} block={block} />
      ))}
    </div>
  );
}
