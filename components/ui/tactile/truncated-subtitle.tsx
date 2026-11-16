"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

export function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCtx = sharedCanvas.getContext("2d");
  }
  if (!sharedCtx) return text.length * 7;
  sharedCtx.font = font;
  return sharedCtx.measureText(text).width;
}

export function computeWordTruncatedText(
  fullText: string,
  targetWidth: number,
  font: string
): { displayText: string; isTruncated: boolean } {
  const words = fullText.trim().split(/\s+/);
  if (words.length <= 1) {
    return { displayText: fullText, isTruncated: false };
  }

  let accumulated = "";
  let isTruncated = false;

  for (let i = 0; i < words.length; i++) {
    const candidate = accumulated ? `${accumulated} ${words[i]}` : words[i];
    const width = measureTextWidth(candidate, font);

    if (width > targetWidth) {
      accumulated = candidate;
      isTruncated = i < words.length - 1 || width > targetWidth;
      break;
    }

    accumulated = candidate;
  }

  if (!isTruncated || accumulated === fullText) {
    return { displayText: fullText, isTruncated: false };
  }

  const cleaned = accumulated.replace(/[,;:\s]+$/, "");
  return { displayText: `${cleaned}...`, isTruncated: true };
}

/**
 * Subtitle text clamped to 80% of the card row width plus the full finished word
 * if a word is in progress at the 80% mark.
 * Hovering pops a tooltip displaying the complete text when truncated.
 */
export function TruncatedSubtitleWithTooltip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [truncatedState, setTruncatedState] = React.useState<{
    displayText: string;
    isTruncated: boolean;
  }>(() => ({
    displayText: text,
    isTruncated: false,
  }));

  const updateTruncation = React.useCallback(() => {
    const el = textRef.current;
    if (!el || !text) return;

    const cardRow = el.closest<HTMLElement>("[data-card-row]");
    const cardRowWidth =
      cardRow?.clientWidth || el.parentElement?.clientWidth || window.innerWidth;
    const availableWidth =
      el.parentElement?.clientWidth || cardRowWidth * 0.8;
    const targetWidth = Math.min(cardRowWidth * 0.8, availableWidth);

    const style = window.getComputedStyle(el);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const next = computeWordTruncatedText(text, targetWidth, font);
    setTruncatedState((prev) => {
      if (
        prev.displayText === next.displayText &&
        prev.isTruncated === next.isTruncated
      ) {
        return prev;
      }
      return next;
    });
  }, [text]);

  React.useEffect(() => {
    updateTruncation();
    const el = textRef.current;
    if (!el) return;

    const cardRow = el.closest<HTMLElement>("[data-card-row]");
    const observer = new ResizeObserver(() => {
      updateTruncation();
    });

    observer.observe(el);
    if (cardRow) {
      observer.observe(cardRow);
    }
    if (el.parentElement) {
      observer.observe(el.parentElement);
    }

    return () => {
      observer.disconnect();
    };
  }, [updateTruncation, text]);

  if (!text || !text.trim()) {
    return null;
  }

  const textElement = (
    <span
      ref={textRef}
      onMouseEnter={updateTruncation}
      className={cn("block truncate w-fit max-w-full", className)}
    >
      {truncatedState.displayText}
    </span>
  );

  if (!truncatedState.isTruncated) {
    return textElement;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{textElement}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-sm whitespace-normal break-words text-left leading-relaxed sm:max-w-md"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
