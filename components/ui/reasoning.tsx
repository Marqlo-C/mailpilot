"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type ReasoningContextValue = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const ReasoningContext = createContext<ReasoningContextValue | undefined>(
  undefined
);

function useReasoningContext(): ReasoningContextValue {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("ReasoningTrigger/Content must be used within Reasoning");
  }
  return context;
}

export type ReasoningProps = {
  children: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * When true, auto-opens so rationale is visible while Ace is working.
   * Does not auto-collapse when streaming ends — keep the result readable.
   */
  isStreaming?: boolean;
  /** Uncontrolled initial open state when not streaming. */
  defaultOpen?: boolean;
};

/**
 * prompt-kit Reasoning — collapsible AI rationale panel (no markdown dependency).
 */
export function Reasoning({
  children,
  className,
  open,
  onOpenChange,
  isStreaming = false,
  defaultOpen = false,
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  function handleOpenChange(next: boolean) {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!isStreaming) return;
    if (!isControlled) setInternalOpen(true);
    onOpenChange?.(true);
  }, [isStreaming, isControlled, onOpenChange]);

  return (
    <ReasoningContext.Provider
      value={{ isOpen, onOpenChange: handleOpenChange }}
    >
      <div className={cn("w-full", className)}>{children}</div>
    </ReasoningContext.Provider>
  );
}

export type ReasoningTriggerProps = {
  children: ReactNode;
} & HTMLAttributes<HTMLButtonElement>;

export function ReasoningTrigger({
  children,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, onOpenChange } = useReasoningContext();

  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 text-left",
        className
      )}
      aria-expanded={isOpen}
      onClick={() => onOpenChange(!isOpen)}
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
          isOpen && "rotate-180"
        )}
        aria-hidden
      />
    </button>
  );
}

export type ReasoningContentProps = {
  children: ReactNode;
  contentClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

export function ReasoningContent({
  children,
  className,
  contentClassName,
  ...props
}: ReasoningContentProps) {
  const { isOpen } = useReasoningContext();
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const apply = () => {
      outer.style.maxHeight = isOpen ? `${inner.scrollHeight}px` : "0px";
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [isOpen, children]);

  return (
    <div
      ref={outerRef}
      className={cn(
        "overflow-hidden transition-[max-height] duration-200 ease-out",
        className
      )}
      style={{ maxHeight: isOpen ? undefined : 0 }}
      {...props}
    >
      <div
        ref={innerRef}
        className={cn("text-muted-foreground", contentClassName)}
      >
        {children}
      </div>
    </div>
  );
}
