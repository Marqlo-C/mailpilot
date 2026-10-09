"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2 } from "lucide-react";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileRevisionHistory } from "@/components/profile/profile-revision-history";
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
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel>Restore a previous version</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
