"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Unlink } from "lucide-react";

import { unlinkAccountCredentials } from "@/app/actions/accounts";
import { logoutSession } from "@/app/actions/auth";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PRIMARY_ACTION_BTN_CLASSNAME,
  PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/secondary-action-btn";
import type { AccountSummary } from "@/lib/data";
import { cn } from "@/lib/utils";

type AccountsCardProps = {
  accounts: AccountSummary[];
  activeAccountId: string | null;
};

export function AccountsCard({ accounts, activeAccountId }: AccountsCardProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          Link Gmail inboxes, unlink credentials (keeps history), or log out of
          the MailPilot session. Inbox sync runs from webhooks and scheduled
          jobs.
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
                className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between"
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
                    Disconnect
                  </Button>
                  <a
                    href="/api/auth/google?intent=link&forceConsent=true"
                    className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
                  >
                    Reconnect
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/auth/google?intent=link"
              className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
            >
              Link Gmail account
            </a>
            <a
              href="/api/auth/google?intent=link&forceConsent=true"
              className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
            >
              Re-authorize Scopes
            </a>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await logoutSession();
              });
            }}
            className={cn(PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
          >
            <LogOut className="h-3.5 w-3.5" />
            Log Out Session
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Unlink</strong> clears
          OAuth tokens but keeps subscriptions, jobs, and profile history.{" "}
          <strong className="font-medium text-foreground">Re-authorize Scopes</strong>{" "}
          forces Google&apos;s consent screen when permissions change.{" "}
          <strong className="font-medium text-foreground">Log Out Session</strong>{" "}
          only ends this browser session.
        </p>

      </CardContent>
    </Card>
  );
}
