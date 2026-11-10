"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcwClock } from "lucide-react";
import { toast } from "sonner";

import {
  restoreProfileHistory,
  type ProfileHistoryItem,
} from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { AppMenuContent } from "@/components/ui/app-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatRevisionStamp,
  ProfileRevisionHistory,
} from "@/components/features/profile/profile-revision-history";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { CurvedCardDivider } from "@/components/ui/tactile/nested-settings-card";
import { formatDistanceToNow } from "@/lib/utils/format-distance";
import { parseRevisionSummary } from "@/lib/profile/revision-diff";

type ProfileRevisionsMenuProps = {
  accountId: string;
  /** Server time of the current revision. Changes after a real profile save. */
  revisionStamp?: string;
};

/**
 * Current profile plus up to three earlier copies.
 */
export function ProfileRevisionsMenu({
  accountId,
  revisionStamp,
}: ProfileRevisionsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ProfileHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const hasItems = useRef(false);
  const requestId = useRef(0);
  hasItems.current = items.length > 0;

  const loadRevisions = useCallback(async () => {
    const id = ++requestId.current;
    if (!hasItems.current) setLoading(true);
    try {
      const res = await fetch(
        `/api/profile/history?accountId=${encodeURIComponent(accountId)}`,
        { cache: "no-store" }
      );
      if (id !== requestId.current) return;
      if (!res.ok) return;
      const body = (await res.json()) as { items?: ProfileHistoryItem[] };
      setItems(Array.isArray(body.items) ? body.items : []);
    } catch {
      // A newer load supersedes this one.
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void loadRevisions();
  }, [open, loadRevisions, revisionStamp]);

  const latest = items[0];
  const latestTitle = latest ? parseRevisionSummary(latest.summary).title : "";
  const revisionsPending = loading && !latest;
  const triggerLabel = pending
    ? "Restoring…"
    : revisionsPending
      ? "Loading revisions…"
      : latest
        ? `${formatRevisionStamp(latest.createdAt)} · ${latestTitle}`
        : "No revisions yet";

  function handleRestore(item: ProfileHistoryItem) {
    const title = parseRevisionSummary(item.summary).title;
    const label = `${title} (${formatDistanceToNow(
      new Date(item.createdAt),
      { addSuffix: true }
    )})`;
    if (
      !window.confirm(
        `Restore profile to “${title}”? Your current profile will be saved as a new revision first.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading(`Restoring: ${parseRevisionSummary(item.summary).title}…`);
      const result = await restoreProfileHistory(accountId, item.id);
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      toast.success(`Restored ${label}`, { id: toastId });
      setItems((current) => {
        const restored = current.find((row) => row.id === item.id);
        if (!restored) return current;
        return [
          { ...restored, isCurrent: true },
          ...current
            .filter((row) => row.id !== item.id)
            .map((row) => ({ ...row, isCurrent: false })),
        ];
      });
      setOpen(false);
      void loadRevisions();
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || revisionsPending}
          className="h-8 max-w-sm gap-1.5 px-3 text-xs font-medium [&_svg]:!size-3.5"
        >
          {pending || revisionsPending ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <History className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <AppMenuContent
        align="end"
        // Full-bleed L2 card chrome — header / curved rule / muted body.
        className="w-[32rem] overflow-hidden rounded-xl border border-border/70 bg-card p-0 shadow-xs"
      >
        <div className="flex items-center gap-2.5 p-3.5">
          <LogoFrameIcon icon={RotateCcwClock} />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Version Control
            </p>
            <p className="text-xs leading-normal text-muted-foreground">
              Restore a previous version
            </p>
          </div>
        </div>
        <CurvedCardDivider />
        <div className="space-y-2.5 bg-muted/10 p-3.5">
          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading revisions…
            </div>
          ) : (
            <ProfileRevisionHistory
              accountId={accountId}
              items={items}
              pending={pending}
              onChange={setItems}
              onRestore={handleRestore}
            />
          )}
        </div>
      </AppMenuContent>
    </DropdownMenu>
  );
}
