"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  CircleCheck,
  Loader2,
  Pencil,
  RotateCcw,
  RotateCcwClock,
} from "lucide-react";
import { toast } from "sonner";

import { renameProfileRevision, type ProfileHistoryItem } from "@/app/actions/profile";
import { Input } from "@/components/ui/input";
import {
  DiffKindMark,
  type DiffKind,
} from "@/components/ui/tactile/diff-kind-mark";
import { EntryChip } from "@/components/ui/tactile/entry-chip";
import {
  SettingsEntryCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils/format-distance";
import {
  parseRevisionSummary,
  serializeRevisionSummary,
  type ProfileDiffChange,
} from "@/lib/profile/revision-diff";

type ProfileRevisionHistoryProps = {
  accountId: string;
  items: ProfileHistoryItem[];
  pending?: boolean;
  onChange: (items: ProfileHistoryItem[]) => void;
  onRestore: (item: ProfileHistoryItem) => void;
};

export function formatRevisionStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Circular icon control, same chrome as the toolbar search filter button. */
const iconButtonClassName =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))] disabled:pointer-events-none disabled:opacity-50";

function ChangeBlurb({ text, className }: { text: string; className?: string }) {
  const full = text.trim();
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [full, overflows]);

  const label = (
    <span
      ref={ref}
      className={cn("block w-full min-w-0 truncate text-xs", className)}
    >
      {full}
    </span>
  );

  if (!overflows) return label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="z-[80] max-w-sm whitespace-normal text-left"
      >
        {full}
      </TooltipContent>
    </Tooltip>
  );
}

function changeRows(diff: {
  added: ProfileDiffChange[];
  modified: ProfileDiffChange[];
  removed: ProfileDiffChange[];
}): Array<ProfileDiffChange & { kind: DiffKind }> {
  return [
    ...diff.added.map((change) => ({ ...change, kind: "added" as const })),
    ...diff.modified.map((change) => ({ ...change, kind: "modified" as const })),
    ...diff.removed.map((change) => ({ ...change, kind: "removed" as const })),
  ];
}

const PAPER_HEADER_CLASSNAME =
  "relative z-[1] flex h-5 items-center text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground";

/**
 * Tiny paper grid: shared columns so section chips stay label-width while
 * change blurbs align after the longest label.
 */
function RevisionChangePaper({
  rows,
}: {
  rows: Array<ProfileDiffChange & { kind: DiffKind }>;
}) {
  return (
    <div
      role="table"
      aria-label="Revision changes"
      className="relative grid grid-cols-[1.75rem_max-content_minmax(0,1fr)] items-center gap-x-2 overflow-hidden rounded-md bg-muted/15 px-1.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.07),0_0_1px_rgba(0,0,0,0.06)]"
    >
        <div role="row" className="contents">
          <span
            role="columnheader"
            aria-label="Kind"
            className={cn(PAPER_HEADER_CLASSNAME, "justify-self-center")}
          >
            <CircleCheck className="size-[1em]" aria-hidden strokeWidth={2.25} />
          </span>
          <span
            role="columnheader"
            className={cn(PAPER_HEADER_CLASSNAME, "justify-self-center px-0.5")}
          >
            Section
          </span>
          <span
            role="columnheader"
            className={cn(PAPER_HEADER_CLASSNAME, "min-w-0 justify-self-center pr-1")}
          >
            Change
          </span>
        </div>
        <span
          aria-hidden
          className="pointer-events-none relative col-span-3 mb-0.5 h-px bg-border/40"
        />
        {rows.map((row, index) => {
          const last = index === rows.length - 1;
          return (
            <div
              key={`${row.kind}-${row.section}-${index}`}
              role="row"
              className="contents"
            >
              <DiffKindMark
                kind={row.kind}
                className="relative z-[1] justify-self-center"
              />
              <EntryChip className="relative z-[1] justify-self-start">
                {row.section}
              </EntryChip>
              <div className="relative z-[1] flex h-6 min-w-0 items-center pr-1">
                {last ? null : (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/40"
                  />
                )}
                <ChangeBlurb text={row.summary} />
              </div>
            </div>
          );
        })}
    </div>
  );
}

/**
 * Newest-first revision list. The name edits in place; the timestamp stays on the row.
 */
export function ProfileRevisionHistory({
  accountId,
  items,
  pending = false,
  onChange,
  onRestore,
}: ProfileRevisionHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const skipCommit = useRef(false);

  function beginEdit(item: ProfileHistoryItem) {
    skipCommit.current = false;
    setEditingId(item.id);
    setDraft(parseRevisionSummary(item.summary).title);
  }

  function cancelEdit() {
    skipCommit.current = true;
    setEditingId(null);
    setDraft("");
  }

  async function commitEdit(item: ProfileHistoryItem) {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const next = draft.trim();
    const stored = parseRevisionSummary(item.summary);
    skipCommit.current = true;
    setEditingId(null);
    if (!next || next === stored.title) return;
    const prior = items;
    const summary = serializeRevisionSummary({ title: next, diff: stored.diff });
    onChange(items.map((row) => (row.id === item.id ? { ...row, summary } : row)));
    const result = await renameProfileRevision(accountId, item.id, next);
    if (!result.ok) {
      onChange(prior);
      toast.error(result.error);
    }
  }

  if (items.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">
        No revisions yet. Edit or import a resume to create restore points.
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ul className="max-h-[28rem] space-y-2.5 overflow-y-auto pb-1.5">
        {items.map((item) => {
          const created = new Date(item.createdAt);
          const editing = editingId === item.id;
          const stored = parseRevisionSummary(item.summary);
          const rows = changeRows(stored.diff);
          const stamp = formatRevisionStamp(item.createdAt);
          return (
            <li
              key={item.id}
              className="list-none rounded-xl transition-[box-shadow] duration-150 hover:shadow-md"
            >
              <SettingsEntryCard
                curvedDivider={rows.length > 0}
                className="transition-[border-color,background-color] duration-150 hover:border-border hover:bg-card"
                leading={
                  editing ? undefined : (
                    <button
                      type="button"
                      className={iconButtonClassName}
                      aria-label="Rename revision"
                      disabled={pending}
                      onClick={() => beginEdit(item)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  )
                }
                title={
                  editing ? (
                    <Input
                      autoFocus
                      value={draft}
                      aria-label="Revision name"
                      // Match level-3 title (`text-[13px]`).
                      className="h-7 w-full text-[13px] font-semibold tracking-tight"
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => void commitEdit(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEdit();
                        }
                      }}
                    />
                  ) : (
                    <ChangeBlurb
                      text={stored.title}
                      className="text-[13px] font-semibold tracking-tight text-foreground"
                    />
                  )
                }
                subtitle={
                  <span className="text-xs font-normal leading-normal text-muted-foreground">
                    {stamp}
                  </span>
                }
                trailing={
                  item.isCurrent ? (
                    <SettingsStatusPill
                      level={3}
                      showDot
                      dotClassName="bg-emerald-500"
                    >
                      Current
                    </SettingsStatusPill>
                  ) : (
                    <SettingsStatusPill
                      level={3}
                      showDot
                      dotClassName="bg-muted-foreground/50"
                    >
                      Prior
                    </SettingsStatusPill>
                  )
                }
                contentClassName={cn(
                  "text-xs leading-relaxed",
                  rows.length === 0 && "p-0"
                )}
                footer={
                  <div className="flex items-center justify-between gap-2 text-[11px] leading-normal text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <RotateCcwClock className="size-3 shrink-0" aria-hidden />
                      {formatDistanceToNow(created, { addSuffix: true })}
                    </span>
                    {item.isCurrent ? null : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        disabled={pending || editing}
                        onClick={() => onRestore(item)}
                      >
                        {pending ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3" />
                        )}
                        Restore
                      </button>
                    )}
                  </div>
                }
              >
                {rows.length > 0 ? (
                  <RevisionChangePaper rows={rows} />
                ) : null}
              </SettingsEntryCard>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
