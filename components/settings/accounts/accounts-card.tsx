"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Unlink, UserRound, UsersRound } from "lucide-react";

import { unlinkAccountCredentials } from "@/app/actions/accounts";
import { GoogleCloudIcon } from "@/components/icons/google-cloud-icon";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/secondary-action-btn";
import {
  SettingsFeatureCard,
  SettingsSectionCard,
} from "@/components/ui/tactile/nested-settings-card";
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
  const [, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2.5">
      <SettingsSectionCard
        className={SETTINGS_CARD_CLASSNAME}
        icon={
          <UsersRound
            className="h-8 w-8 -translate-y-0.5 text-primary shrink-0"
            aria-hidden="true"
          />
        }
        title="Connected Accounts"
        subtitle="Connect and manage your Gmail inboxes. Emails sync automatically in the background."
        curvedDivider
      >
        <TooltipProvider delayDuration={200}>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts linked yet. Connect Gmail to start watching your inbox.
            </p>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <SettingsFeatureCard
                  key={account.id}
                  curvedDivider={false}
                  headerClassName="flex-col items-start sm:flex-row sm:items-center"
                  logo={
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
                  }
                  title={
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">
                        {account.name ? (
                          <>
                            <span>{account.name}</span>
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              ({account.email})
                            </span>
                          </>
                        ) : (
                          account.email
                        )}
                      </span>
                      {!account.encryptedAccess && (
                        <span className="shrink-0 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
                          Credentials unlinked
                        </span>
                      )}
                    </div>
                  }
                  subtitle={
                    account.historyId
                      ? `Watch history #${account.historyId}`
                      : "Watch not registered"
                  }
                  statusBadge={
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      {account.id === activeAccountId && (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                          <span
                            aria-hidden="true"
                            className="h-4 w-px bg-border/70 shrink-0"
                          />
                        </>
                      )}

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
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </TooltipProvider>
      </SettingsSectionCard>

      <div className="flex items-center justify-end gap-1.5 px-1 text-[11px] leading-none text-muted-foreground">
        <span className="leading-none">Authentication secured via Google OAuth 2.0</span>
        <GoogleCloudIcon
          width={12}
          height={12}
          className="size-3 shrink-0 block"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
