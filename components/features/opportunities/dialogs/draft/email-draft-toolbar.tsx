"use client";

import { useState, type Ref } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  Italic,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

import {
  appMenuClassNames,
  AppMenuContent,
} from "@/components/ui/app-menu";
import { Button } from "@/components/ui/button";
import {
  ToolbarClusterIconButton,
  ToolbarToolCluster,
  TOOLBAR_TOOL_CLUSTER_BTN_ACTIVE_CLASSNAME,
  TOOLBAR_TOOL_CLUSTER_BTN_CLASSNAME,
} from "@/components/ui/composites/toolbar-tool-cluster";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileSparklesIcon } from "@/components/ui/icons/file-sparkles-icon";
import { BRAND_SELECTION_TOGGLE_ACTIVE_CLASSNAME } from "@/components/ui/styles/brand-selection";
import { SegmentedControl } from "@/components/ui/tactile/segmented-tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import {
  EMAIL_HIGHLIGHT_COLORS,
  EMAIL_TEXT_COLORS,
  type EmailBodySwatch,
} from "@/lib/opportunities/dispatch/email-body-colors";
import { cn } from "@/lib/utils";

type AlignValue = "left" | "center" | "right";

const ALIGN_OPTIONS = [
  {
    value: "left" as const,
    label: (
      <>
        <AlignLeft className="size-3.5" aria-hidden />
        <span className="sr-only">Align left</span>
      </>
    ),
  },
  {
    value: "center" as const,
    label: (
      <>
        <AlignCenter className="size-3.5" aria-hidden />
        <span className="sr-only">Align center</span>
      </>
    ),
  },
  {
    value: "right" as const,
    label: (
      <>
        <AlignRight className="size-3.5" aria-hidden />
        <span className="sr-only">Align right</span>
      </>
    ),
  },
];

export type EmailDraftToolbarProps = {
  editor: Editor | null;
  disabled?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Format mark state — re-render when selection/marks change. */
  boldActive?: boolean;
  italicActive?: boolean;
  underlineActive?: boolean;
  onToggleBold?: () => void;
  onToggleItalic?: () => void;
  onToggleUnderline?: () => void;
  textColor?: string | null;
  highlightColor?: string | null;
  onApplyTextColor?: (value: string | null) => void;
  onApplyHighlightColor?: (value: string | null) => void;
  alignValue?: AlignValue;
  showAttachResume?: boolean;
  attachResume?: boolean;
  onAttachResumeChange?: (attach: boolean) => void;
  attachLocked?: boolean;
  /** Root strip — used to measure intrinsic min width for the draft split. */
  toolbarRef?: Ref<HTMLDivElement>;
};

function ToolbarDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 h-4 w-px shrink-0 self-center bg-border/70"
    />
  );
}

function SwatchGrid({
  swatches,
  activeValue,
  onSelect,
  kind,
}: {
  swatches: readonly EmailBodySwatch[];
  activeValue: string | null;
  onSelect: (value: string | null) => void;
  kind: "text" | "highlight";
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 p-2">
      {swatches.map((swatch) => {
        const active =
          (swatch.value === null && activeValue === null) ||
          (swatch.value !== null &&
            activeValue !== null &&
            swatch.value.toLowerCase() === activeValue.toLowerCase());
        return (
          <button
            key={swatch.id}
            type="button"
            title={swatch.label}
            aria-label={swatch.label}
            aria-pressed={active}
            className={cn(
              "relative size-7 rounded-md border border-border/70 transition-colors",
              "hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "ring-2 ring-ring"
            )}
            style={
              swatch.value
                ? kind === "text"
                  ? { color: swatch.value, backgroundColor: "var(--card)" }
                  : { backgroundColor: swatch.value }
                : kind === "text"
                  ? { backgroundColor: "var(--card)" }
                  : {
                      backgroundImage:
                        "linear-gradient(to top right, transparent calc(50% - 0.5px), hsl(var(--border)) calc(50% - 0.5px), hsl(var(--border)) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
                      backgroundColor: "var(--card)",
                    }
            }
            // Keep editor selection while picking (same as format buttons).
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(swatch.value)}
          >
            {kind === "text" ? (
              <span className="text-xs font-semibold leading-none" aria-hidden>
                A
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Resume-styled strip: marks, colors, align, include-resume. */
export function EmailDraftToolbar({
  editor,
  disabled = false,
  canUndo = false,
  canRedo = false,
  boldActive = false,
  italicActive = false,
  underlineActive = false,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  textColor = null,
  highlightColor = null,
  onApplyTextColor,
  onApplyHighlightColor,
  alignValue = "left",
  showAttachResume = false,
  attachResume = false,
  onAttachResumeChange,
  attachLocked = false,
  toolbarRef,
}: EmailDraftToolbarProps) {
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const formatLocked = disabled || !editor;
  const resumeTip = attachResume
    ? "Remove tailored resume"
    : "Include tailored resume";

  return (
    <div
      ref={toolbarRef}
      className="relative z-20 flex w-full max-w-full shrink-0 items-center gap-2 overflow-visible rounded-t-lg border-b border-border/60 bg-card/80 px-3 py-3 text-xs backdrop-blur-sm"
    >
      <div
        className={cn(
          // shrink-0 — never let the strip compress square icon buttons.
          "flex shrink-0 flex-nowrap items-center gap-1.5",
          formatLocked && "pointer-events-none opacity-50"
        )}
      >
        <ToolbarToolCluster label="History">
          <ToolbarClusterIconButton
            label="Undo"
            disabled={formatLocked || !canUndo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 aria-hidden />
          </ToolbarClusterIconButton>
          <ToolbarClusterIconButton
            label="Redo"
            disabled={formatLocked || !canRedo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 aria-hidden />
          </ToolbarClusterIconButton>
        </ToolbarToolCluster>

        <ToolbarDivider />

        <ToolbarToolCluster label="Text style">
          <ToolbarClusterIconButton
            label="Bold"
            pressed={boldActive}
            disabled={formatLocked}
            onClick={() => onToggleBold?.()}
          >
            <Bold aria-hidden />
          </ToolbarClusterIconButton>
          <ToolbarClusterIconButton
            label="Italic"
            pressed={italicActive}
            disabled={formatLocked}
            onClick={() => onToggleItalic?.()}
          >
            <Italic aria-hidden />
          </ToolbarClusterIconButton>
          <ToolbarClusterIconButton
            label="Underline"
            pressed={underlineActive}
            disabled={formatLocked}
            onClick={() => onToggleUnderline?.()}
          >
            <Underline aria-hidden />
          </ToolbarClusterIconButton>
        </ToolbarToolCluster>

        <ToolbarToolCluster label="Color">
          <DropdownMenu open={textColorOpen} onOpenChange={setTextColorOpen}>
            <LabelTooltip label="Text color" side="bottom">
              <span className="inline-flex">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={formatLocked}
                    aria-label="Text color"
                    aria-pressed={Boolean(textColor)}
                    className={cn(
                      TOOLBAR_TOOL_CLUSTER_BTN_CLASSNAME,
                      Boolean(textColor) &&
                        TOOLBAR_TOOL_CLUSTER_BTN_ACTIVE_CLASSNAME,
                      "relative"
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <Baseline aria-hidden />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-1.5 bottom-1 h-0.5 rounded-full"
                      style={{ backgroundColor: textColor ?? "currentColor" }}
                    />
                  </button>
                </DropdownMenuTrigger>
              </span>
            </LabelTooltip>
            <AppMenuContent align="start" className="w-auto min-w-0 p-0">
              <p className={cn(appMenuClassNames.light.label, "px-2.5 pt-2")}>
                Text color
              </p>
              <SwatchGrid
                kind="text"
                swatches={EMAIL_TEXT_COLORS}
                activeValue={textColor}
                onSelect={(value) => {
                  onApplyTextColor?.(value);
                  setTextColorOpen(false);
                }}
              />
            </AppMenuContent>
          </DropdownMenu>

          <DropdownMenu open={highlightOpen} onOpenChange={setHighlightOpen}>
            <LabelTooltip label="Highlight" side="bottom">
              <span className="inline-flex">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={formatLocked}
                    aria-label="Highlight color"
                    aria-pressed={Boolean(highlightColor)}
                    className={cn(
                      TOOLBAR_TOOL_CLUSTER_BTN_CLASSNAME,
                      Boolean(highlightColor) &&
                        TOOLBAR_TOOL_CLUSTER_BTN_ACTIVE_CLASSNAME,
                      "relative"
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <Highlighter aria-hidden />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-1.5 bottom-1 h-0.5 rounded-full"
                      style={{
                        backgroundColor: highlightColor ?? "transparent",
                        borderBottom: highlightColor
                          ? undefined
                          : "1px solid currentColor",
                      }}
                    />
                  </button>
                </DropdownMenuTrigger>
              </span>
            </LabelTooltip>
            <AppMenuContent align="start" className="w-auto min-w-0 p-0">
              <p className={cn(appMenuClassNames.light.label, "px-2.5 pt-2")}>
                Highlight
              </p>
              <SwatchGrid
                kind="highlight"
                swatches={EMAIL_HIGHLIGHT_COLORS}
                activeValue={highlightColor}
                onSelect={(value) => {
                  onApplyHighlightColor?.(value);
                  setHighlightOpen(false);
                }}
              />
            </AppMenuContent>
          </DropdownMenu>
        </ToolbarToolCluster>

        <ToolbarDivider />

        <SegmentedControl
          size="xs"
          label="Paragraph alignment"
          value={alignValue}
          onChange={(value) => {
            editor?.chain().focus().setTextAlign(value).run();
          }}
          options={ALIGN_OPTIONS}
          disabled={formatLocked}
          className={cn(
            "shrink-0",
            formatLocked && "pointer-events-none"
          )}
        />
      </div>

      {showAttachResume && onAttachResumeChange ? (
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1.5",
            (disabled || attachLocked) && "pointer-events-none opacity-50"
          )}
        >
          <ToolbarDivider />
          <LabelTooltip label={resumeTip} side="bottom">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || attachLocked}
              aria-pressed={attachResume}
              aria-label={resumeTip}
              className={cn(
                "size-8 shrink-0 overflow-visible px-0 [&_svg]:size-4 [&_svg]:overflow-visible",
                attachResume && BRAND_SELECTION_TOGGLE_ACTIVE_CLASSNAME
              )}
              onClick={() => onAttachResumeChange(!attachResume)}
            >
              <FileSparklesIcon
                width={16}
                height={16}
                strokeWidth={1.5}
                className="shrink-0 overflow-visible"
              />
            </Button>
          </LabelTooltip>
        </div>
      ) : null}
    </div>
  );
}
