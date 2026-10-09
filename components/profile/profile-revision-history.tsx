"use client";

import { useRef, useState } from "react";
import { Loader2, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { renameProfileRevision, type ProfileHistoryItem } from "@/app/actions/profile";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "@/lib/format-distance";

type ProfileRevisionHistoryProps = {
  accountId: string;
  items: ProfileHistoryItem[];
  pending?: boolean;
  onChange: (items: ProfileHistoryItem[]) => void;
  onRestore: (item: ProfileHistoryItem) => void;
};

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
    setDraft(item.summary);
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
    skipCommit.current = true;
    setEditingId(null);
    if (!next || next === item.summary) return;
    const prior = items;
    onChange(
      items.map((row) => (row.id === item.id ? { ...row, summary: next } : row))
    );
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
    <ul className="max-h-80 space-y-1 overflow-y-auto p-1">
      {items.map((item) => {
        const created = new Date(item.createdAt);
        const editing = editingId === item.id;
        return (
          <li key={item.id} className="rounded-md px-2 py-1.5">
            {editing ? (
              <Input
                autoFocus
                value={draft}
                aria-label="Revision name"
                className="h-8 text-sm"
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
              <button
                type="button"
                className="flex w-full items-start gap-1.5 text-left text-sm font-medium"
                disabled={pending}
                onClick={() => beginEdit(item)}
              >
                <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{item.summary}</span>
              </button>
            )}
            <div className="mt-1 flex items-center justify-between gap-2 pl-5">
              <span className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(created, { addSuffix: true })}
                {" · "}
                {created.toISOString()}
              </span>
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
