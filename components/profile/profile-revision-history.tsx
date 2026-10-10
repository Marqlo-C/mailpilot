"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CircleDashed, CircleDot, Loader2, Pencil, RotateCcw, RotateCcwClock } from "lucide-react";
import { toast } from "sonner";

import { renameProfileRevision, type ProfileHistoryItem } from "@/app/actions/profile";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/format-distance";
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

type ChangeKind = "added" | "modified" | "removed";

const KIND_STYLE: Record<ChangeKind, { mark: string; className: string }> = {
  added: { mark: "+", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  modified: { mark: "~", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  removed: { mark: "-", className: "bg-[#FAE9E9] text-[#C21E11]" },
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
}): Array<ProfileDiffChange & { kind: ChangeKind }> {
  return [
    ...diff.added.map((change) => ({ ...change, kind: "added" as const })),
    ...diff.modified.map((change) => ({ ...change, kind: "modified" as const })),
    ...diff.removed.map((change) => ({ ...change, kind: "removed" as const })),
  ];
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
      <ul className="max-h-[28rem] space-y-2 overflow-y-auto p-1">
        {items.map((item) => {
          const created = new Date(item.createdAt);
          const editing = editingId === item.id;
          const stored = parseRevisionSummary(item.summary);
          const rows = changeRows(stored.diff);
          const stamp = formatRevisionStamp(item.createdAt);
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-border/50 bg-card/75 p-2.5 shadow-sm"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                {editing ? (
                  <Input
                    autoFocus
                    value={draft}
                    aria-label="Revision name"
                    className="h-8 flex-1 text-sm"
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
                  <>
                    <button
                      type="button"
                      className={cn(iconButtonClassName, "self-start")}
                      aria-label="Rename revision"
                      disabled={pending}
                      onClick={() => beginEdit(item)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-normal leading-none text-muted-foreground">
                        {stamp}
                      </p>
                      <ChangeBlurb
                        text={stored.title}
                        className="mt-1 text-sm font-medium"
                      />
                    </div>
                  </>
                )}
                {item.isCurrent ? (
                  <CircleDot className="size-4 shrink-0 self-start text-emerald-500" aria-label="Current" />
                ) : (
                  <CircleDashed className="size-4 shrink-0 self-start text-stone-400" aria-hidden />
                )}
              </div>
              {rows.length > 0 ? (
                <div className="mt-2 max-h-[13rem] overflow-y-auto py-1 pr-1">
                <ul className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-[0.75rem] right-0 bg-muted/15 shadow-[0_1px_2px_rgba(0,0,0,0.07),0_0_1px_rgba(0,0,0,0.06)]"
                  />
                  {rows.map((row, index) => {
                    const style = KIND_STYLE[row.kind];
                    const last = index === rows.length - 1;
                    return (
                      <li
                        key={`${row.kind}-${row.section}-${index}`}
                        className="relative grid h-5 w-full grid-cols-[1.75rem_auto_minmax(0,1fr)] items-center gap-2"
                      >
                        {last ? null : (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute bottom-0 left-[calc(1.75rem+0.25rem)] right-1.5 h-px bg-border/40"
                          />
                        )}
                        <span
                          className={`relative inline-flex h-4 w-4 items-center justify-center justify-self-end rounded text-[10px] font-semibold ${style.className}`}
                        >
                          {style.mark}
                        </span>
                        <span className="relative z-[1] block">
                          <span
                            className="invisible block px-1.5 py-0 text-[10px] font-medium uppercase leading-none tracking-wide"
                            aria-hidden
                          >
                            experience
                          </span>
                          <span className="absolute inset-0 block truncate rounded bg-muted px-1.5 py-0 text-center text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">
                            {row.section}
                          </span>
                        </span>
                        <div className="relative z-[1] min-w-0 pr-3">
                          <ChangeBlurb text={row.summary} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <RotateCcwClock className="h-3 w-3 shrink-0" aria-hidden />
                  {formatDistanceToNow(created, { addSuffix: true })}
                </span>
                {item.isCurrent ? null : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    disabled={pending || editing}
                    onClick={() => onRestore(item)}
                  >
                    {pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Restore
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
