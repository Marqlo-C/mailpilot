"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

import {
  removeAccount,
  triggerManualSync,
} from "@/app/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AccountSummary } from "@/lib/data";

type AccountsCardProps = {
  accounts: AccountSummary[];
  activeAccountId: string | null;
};

export function AccountsCard({ accounts, activeAccountId }: AccountsCardProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          Link Gmail inboxes, run a manual sync, or remove an account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts linked yet. Connect Gmail to start watching your inbox.
          </p>
        ) : (
          <ul className="space-y-3">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{account.email}</p>
                    {account.id === activeAccountId && (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {account.historyId
                      ? `Watch history ${account.historyId}`
                      : "Watch not registered"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setPendingId(account.id);
                      setMessage(null);
                      startTransition(async () => {
                        const result = await triggerManualSync(account.id);
                        setMessage(
                          result.ok
                            ? `Synced ${account.email}`
                            : result.error
                        );
                        setPendingId(null);
                        router.refresh();
                      });
                    }}
                  >
                    {pending && pendingId === account.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Sync
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove ${account.email} and all related data?`
                        )
                      ) {
                        return;
                      }
                      setPendingId(account.id);
                      startTransition(async () => {
                        await removeAccount(account.id);
                        setPendingId(null);
                        router.refresh();
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button asChild>
          <a href="/api/auth/google">Link Gmail account</a>
        </Button>

        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
