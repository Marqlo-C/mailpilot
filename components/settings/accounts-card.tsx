"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, RefreshCw, Unlink } from "lucide-react";

import {
  triggerManualSync,
  unlinkAccountCredentials,
} from "@/app/actions/accounts";
import { logoutSession } from "@/app/actions/auth";
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
          Link Gmail inboxes, sync, unlink credentials (keeps history), or log
          out of the MailPilot session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Badge variant="secondary">
          Authentication: Secured via Google OAuth
        </Badge>

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
                    {!account.encryptedAccess && (
                      <Badge variant="outline">Credentials unlinked</Badge>
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
                    disabled={pending || !account.encryptedAccess}
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
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Unlink Gmail credentials for ${account.email}? Historical MailPilot data is kept.`
                        )
                      ) {
                        return;
                      }
                      setPendingId(account.id);
                      startTransition(async () => {
                        await unlinkAccountCredentials(account.id);
                        setPendingId(null);
                        router.refresh();
                      });
                    }}
                  >
                    <Unlink className="h-4 w-4" />
                    Unlink Gmail Credentials
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/api/auth/google">Link Gmail account</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/auth/google?forceConsent=true">
                Re-authorize Scopes
              </a>
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await logoutSession();
              });
            }}
          >
            <LogOut className="h-4 w-4" />
            Log Out MailPilot Session
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Unlink</strong> clears
          OAuth tokens but keeps subscriptions, jobs, and profile history.{" "}
          <strong className="font-medium text-foreground">Re-authorize Scopes</strong>{" "}
          forces Google&apos;s consent screen when permissions change.{" "}
          <strong className="font-medium text-foreground">Log Out</strong> only
          ends this browser session.
        </p>

        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
