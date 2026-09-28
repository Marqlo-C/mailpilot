"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  getProfileHistory,
  restoreProfileHistory,
  type ProfileHistoryItem,
} from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "@/lib/format-distance";

type ProfileRevisionsMenuProps = {
  accountId: string;
};

/**
 * Undo menu for the last 5 master-profile snapshots.
 */
export function ProfileRevisionsMenu({ accountId }: ProfileRevisionsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ProfileHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const result = await getProfileHistory(accountId);
      if (cancelled) return;
      setLoading(false);
      if (result.ok && result.data) {
        setItems(result.data);
      } else {
        setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  function handleRestore(item: ProfileHistoryItem) {
    const label = `${item.summary} (${formatDistanceToNow(
      new Date(item.createdAt),
      { addSuffix: true }
    )})`;
    if (
      !window.confirm(
        `Restore profile to “${item.summary}”? Your current profile will be saved as a new revision first.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading(`Restoring: ${item.summary}…`);
      const result = await restoreProfileHistory(accountId, item.id);
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      toast.success(`Restored ${label}`, { id: toastId });
      setOpen(false);
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
          disabled={pending}
          className="gap-1.5"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <History className="h-3.5 w-3.5" />
          )}
          Revisions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Restore a previous version</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading revisions…
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No revisions yet. Edit, import a resume, or sync GitHub to create
            restore points.
          </p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              disabled={pending}
              onClick={() => handleRestore(item)}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {item.summary}
              </span>
              <span className="pl-5 text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(item.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
