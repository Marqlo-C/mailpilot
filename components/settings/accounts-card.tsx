"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDot, RotateCw, Unlink, UserRound, UsersRound } from "lucide-react";

import { unlinkAccountCredentials } from "@/app/actions/accounts";
import { GoogleCloudIcon } from "@/components/icons/google-cloud-icon";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/primary-action-btn";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/secondary-action-btn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AccountSummary } from "@/lib/data";

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
      <CardHeader className="flex flex-row items-center gap-3 border-b border-border/50 p-3.5 space-y-0">
        <UsersRound
          className="h-8 w-8 -translate-y-0.5 text-primary shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-0.5 min-w-0">
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription className="text-xs">
            Connect and manage your Gmail inboxes. Emails sync automatically in
            the background.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-3.5">
        <TooltipProvider delayDuration={200}>
          <div className="space-y-2">
            <Badge
              variant="secondary"
              className="inline-flex items-center gap-1.5 text-[11px] opacity-65"
            >
              <span>Authentication: Secured via Google OAuth 2.0</span>
              <GoogleCloudIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
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
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar className="h-8 w-8 shrink-0 border border-border/60">
                      {account.picture ? (
                        <AvatarImage
                          src={account.picture}
                          alt={account.name ?? account.email}
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <AvatarFallback className="bg-muted/50 text-muted-foreground">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="truncate text-xs sm:text-sm font-medium text-foreground">
                          {account.name ? (
                            <>
                              <span>{account.name}</span>
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                ({account.email})
                              </span>
                            </>
                          ) : (
                            account.email
                          )}
                        </p>
                        {account.id === activeAccountId && (
                          <span title="Active account" className="inline-flex shrink-0">
                            <CircleDot
                              className="size-4 text-emerald-500"
                              aria-label="Active account"
                            />
                          </span>
                        )}
                        {!account.encryptedAccess && (
                          <span className="shrink-0 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
                            Credentials unlinked
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                        {account.historyId
                          ? `Watch history #${account.historyId}`
                          : "Watch not registered"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href="/api/auth/google?intent=link&forceConsent=true"
                          className={SECONDARY_ACTION_BTN_CLASSNAME}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          Reconnect
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Renews your Google connection if permissions ever expire.
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
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
                          className={PRIMARY_ACTION_BTN_CLASSNAME}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                          Disconnect
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Pauses inbox sync without deleting your saved data or history.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </div>
        </TooltipProvider>

      </CardContent>
    </Card>
  );
}
