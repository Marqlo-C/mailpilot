"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subscription, SubscriptionHistory } from "@prisma/client";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  batchCleanupSender,
  unsubscribeSender,
} from "@/app/actions/subscriptions";
import { SenderAvatar } from "@/components/sender-avatar";
import { SyncControls } from "@/components/opportunities/sync-controls";
import type { CleanupAction } from "@/lib/unsubscribe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  segmentedTabsListClassName,
  segmentedTabsTriggerClassName,
  TabCountBadge,
} from "@/components/ui/segmented-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ArchiveEntry = {
  key: string;
  senderEmail: string;
  senderName: string | null;
  emailCount: number | null;
  subscriptionId: string | null;
  source: "subscription" | "history";
};

type SubscriptionsViewProps = {
  accountId: string;
  subscriptions: Subscription[];
  history: SubscriptionHistory[];
  defaultCleanup: CleanupAction;
};

function methodBadge(sub: Subscription): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  if (sub.unsubPostUrl) return { label: "One-Click", variant: "default" };
  if (sub.unsubMailto) return { label: "Email", variant: "secondary" };
  return { label: "Link", variant: "outline" };
}

export function SubscriptionsView({
  accountId,
  subscriptions,
  history,
  defaultCleanup,
}: SubscriptionsViewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cleanupPending, setCleanupPending] = useState<string | null>(null);

  const active = useMemo(
    () =>
      subscriptions.filter(
        (s) => s.status === "ACTIVE" || s.status === "FAILED"
      ),
    [subscriptions]
  );

  const archive = useMemo(() => {
    const map = new Map<string, ArchiveEntry>();

    for (const sub of subscriptions) {
      if (sub.status !== "UNSUBSCRIBED") continue;
      const key = sub.senderEmail.toLowerCase();
      map.set(key, {
        key,
        senderEmail: sub.senderEmail,
        senderName: sub.senderName,
        emailCount: sub.emailCount,
        subscriptionId: sub.id,
        source: "subscription",
      });
    }

    for (const row of history) {
      if (row.status !== "UNSUBSCRIBED") continue;
      const key = row.senderEmail.toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        key,
        senderEmail: row.senderEmail,
        senderName: row.senderName,
        emailCount: null,
        subscriptionId: null,
        source: "history",
      });
    }

    return [...map.values()].sort((a, b) =>
      a.senderEmail.localeCompare(b.senderEmail)
    );
  }, [subscriptions, history]);

  function runUnsubscribe(cleanup: CleanupAction) {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await unsubscribeSender(selected.id, cleanup);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(null);
      router.refresh();
    });
  }

  function runBatchCleanup(entry: ArchiveEntry) {
    setCleanupPending(entry.key);
    startTransition(async () => {
      const result = await batchCleanupSender(accountId, entry.senderEmail);
      setCleanupPending(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Moved ${result.data?.cleaned ?? 0} past email(s) to Trash`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Subscriptions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Active lists and an archive box for second-chance inbox cleanup.
        </p>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <TabsList className={segmentedTabsListClassName}>
            <TabsTrigger
              value="active"
              className={segmentedTabsTriggerClassName}
            >
              <span>Active Subscriptions</span>
              <TabCountBadge count={active.length} />
            </TabsTrigger>
            <TabsTrigger
              value="archive"
              className={segmentedTabsTriggerClassName}
            >
              <span>Unsubscribed</span>
              <TabCountBadge count={archive.length} />
            </TabsTrigger>
          </TabsList>

          <div className="flex shrink-0 items-center gap-2.5 self-start sm:self-auto">
            <SyncControls accountId={accountId} />
          </div>
        </div>

        <TabsContent value="active" className="mt-0 space-y-4">
          {active.length === 0 ? (
            <EmptyState
              title="No active subscriptions"
              body="MailPilot will capture senders that advertise List-Unsubscribe headers."
            />
          ) : (
            <>
              <ActiveDesktopTable
                subscriptions={active}
                onUnsubscribe={setSelected}
              />
              <ActiveMobileCards
                subscriptions={active}
                onUnsubscribe={setSelected}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="archive" className="mt-0 space-y-4">
          {archive.length === 0 ? (
            <EmptyState
              title="Archive is empty"
              body="Unsubscribed senders appear here so you can purge past mail later."
            />
          ) : (
            <>
              <div className="hidden space-y-3 md:block">
                {archive.map((entry) => (
                  <ArchiveCard
                    key={entry.key}
                    entry={entry}
                    pending={cleanupPending === entry.key || pending}
                    onCleanup={() => runBatchCleanup(entry)}
                  />
                ))}
              </div>
              <ul className="space-y-3 md:hidden">
                {archive.map((entry) => (
                  <li key={entry.key}>
                    <ArchiveCard
                      entry={entry}
                      pending={cleanupPending === entry.key || pending}
                      onCleanup={() => runBatchCleanup(entry)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsubscribe</DialogTitle>
            <DialogDescription>
              Choose how to leave{" "}
              <span className="font-medium text-foreground">
                {selected?.senderEmail}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Button
              className="w-full justify-start"
              variant={defaultCleanup === "NONE" ? "default" : "outline"}
              disabled={pending}
              onClick={() => runUnsubscribe("NONE")}
            >
              Unsubscribe Only
            </Button>
            <Button
              className="w-full justify-start"
              variant={defaultCleanup === "TRASH" ? "default" : "outline"}
              disabled={pending}
              onClick={() => runUnsubscribe("TRASH")}
            >
              Unsubscribe + Trash All Past
            </Button>
            <Button
              className="w-full justify-start"
              variant={defaultCleanup === "ARCHIVE" ? "default" : "outline"}
              disabled={pending}
              onClick={() => runUnsubscribe("ARCHIVE")}
            >
              Unsubscribe and archive past emails
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
            {pending && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Working…
              </span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function ActiveDesktopTable({
  subscriptions,
  onUnsubscribe,
}: {
  subscriptions: Subscription[];
  onUnsubscribe: (sub: Subscription) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sender</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Volume</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.map((sub) => {
            const method = methodBadge(sub);
            return (
              <TableRow key={sub.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <SenderAvatar
                      email={sub.senderEmail}
                      name={sub.senderName}
                    />
                    <span className="font-medium">
                      {sub.senderName ?? "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {sub.senderEmail}
                </TableCell>
                <TableCell>{sub.emailCount}</TableCell>
                <TableCell>
                  <Badge variant={method.variant}>{method.label}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      sub.status === "FAILED" ? "destructive" : "secondary"
                    }
                    title={
                      sub.status === "FAILED"
                        ? sub.lastError ?? "Unknown failure"
                        : undefined
                    }
                    className={
                      sub.status === "FAILED" ? "cursor-help" : undefined
                    }
                  >
                    {sub.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onUnsubscribe(sub)}
                  >
                    Unsubscribe
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ActiveMobileCards({
  subscriptions,
  onUnsubscribe,
}: {
  subscriptions: Subscription[];
  onUnsubscribe: (sub: Subscription) => void;
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {subscriptions.map((sub) => {
        const method = methodBadge(sub);
        return (
          <li
            key={sub.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <SenderAvatar email={sub.senderEmail} name={sub.senderName} />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {sub.senderName ?? sub.senderEmail}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {sub.senderEmail}
                  </p>
                </div>
              </div>
              <Badge variant={method.variant}>{method.label}</Badge>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span
                className="text-muted-foreground"
                title={
                  sub.status === "FAILED"
                    ? sub.lastError ?? "Unknown failure"
                    : undefined
                }
              >
                {sub.emailCount} email{sub.emailCount === 1 ? "" : "s"} ·{" "}
                {sub.status}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUnsubscribe(sub)}
              >
                Unsubscribe
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ArchiveCard({
  entry,
  pending,
  onCleanup,
}: {
  entry: ArchiveEntry;
  pending: boolean;
  onCleanup: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <SenderAvatar email={entry.senderEmail} name={entry.senderName} />
        <div className="min-w-0">
          <p className="truncate font-medium">
            {entry.senderName ?? entry.senderEmail}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {entry.senderEmail}
            {entry.emailCount != null
              ? ` · ${entry.emailCount} tracked`
              : " · from history"}
          </p>
        </div>
      </div>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={onCleanup}
        className="shrink-0"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Batch Delete All Past Emails
      </Button>
    </div>
  );
}
