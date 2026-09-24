"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subscription } from "@prisma/client";
import { Loader2 } from "lucide-react";

import { unsubscribeSender } from "@/app/actions/subscriptions";
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

type SubscriptionsViewProps = {
  subscriptions: Subscription[];
  defaultCleanup: CleanupAction;
};

function methodBadge(sub: Subscription): { label: string; variant: "default" | "secondary" | "outline" } {
  if (sub.unsubPostUrl) return { label: "One-Click", variant: "default" };
  if (sub.unsubMailto) return { label: "Email", variant: "secondary" };
  return { label: "Link", variant: "outline" };
}

export function SubscriptionsView({
  subscriptions,
  defaultCleanup,
}: SubscriptionsViewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <p className="font-medium">No subscriptions detected yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          MailPilot will capture senders that advertise List-Unsubscribe headers.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
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
                  <TableCell className="font-medium">
                    {sub.senderName ?? "—"}
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
                        sub.status === "ACTIVE"
                          ? "secondary"
                          : sub.status === "UNSUBSCRIBED"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sub.status === "UNSUBSCRIBED"}
                      onClick={() => setSelected(sub)}
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

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {subscriptions.map((sub) => {
          const method = methodBadge(sub);
          return (
            <li
              key={sub.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {sub.senderName ?? sub.senderEmail}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {sub.senderEmail}
                  </p>
                </div>
                <Badge variant={method.variant}>{method.label}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {sub.emailCount} email{sub.emailCount === 1 ? "" : "s"} ·{" "}
                  {sub.status}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sub.status === "UNSUBSCRIBED"}
                  onClick={() => setSelected(sub)}
                >
                  Unsubscribe
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
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
              Unsubscribe only
            </Button>
            <Button
              className="w-full justify-start"
              variant={defaultCleanup === "TRASH" ? "default" : "outline"}
              disabled={pending}
              onClick={() => runUnsubscribe("TRASH")}
            >
              Unsubscribe and trash past emails
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
    </>
  );
}
