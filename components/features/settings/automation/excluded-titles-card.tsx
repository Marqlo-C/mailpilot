"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldBan, X } from "lucide-react";
import { toast } from "sonner";

import { addExcludedTitle, removeExcludedTitle } from "@/app/actions/settings";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import {
  SettingsFeatureCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { cn } from "@/lib/utils";

type ExcludedTitlesCardProps = {
  accountId: string | null;
  excludedTitles: string[];
  isExpanded: boolean;
  onToggle: () => void;
};

/**
 * L2 — Roles trained via “Less like this” that stay soft-hidden.
 */
export function ExcludedTitlesCard({
  accountId,
  excludedTitles,
  isExpanded,
  onToggle,
}: ExcludedTitlesCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const disabled = !accountId || pending;
  const count = excludedTitles.length;

  function handleAdd() {
    if (!accountId) return;
    const title = draft.trim();
    if (!title) return;
    startTransition(async () => {
      const result = await addExcludedTitle(accountId, title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft("");
      toast.success(`Excluded “${title}”`);
      router.refresh();
    });
  }

  function handleRemove(title: string) {
    if (!accountId) return;
    startTransition(async () => {
      const result = await removeExcludedTitle(accountId, title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Removed “${title}”`);
      router.refresh();
    });
  }

  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={ShieldBan} />}
      title="Roles to hide"
      subtitle="Titles you marked “Less like this.” Matching listings are soft-hidden on Job Radar."
      statusBadge={
        <SettingsStatusPill count={count} hasItems={count > 0}>
          {count === 0 ? "None" : `${count} hidden`}
        </SettingsStatusPill>
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      <div className="space-y-4">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to manage hidden roles.
          </p>
        ) : null}

        {excludedTitles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/80 px-4 py-6 text-center text-xs text-muted-foreground">
            Nothing excluded yet. On any opportunity card, open the ⋮ menu and
            choose &quot;Less like this&quot; — or add a title below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {excludedTitles.map((title) => (
              <span
                key={title}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300"
              >
                <span className="truncate">{title}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemove(title)}
                  className="rounded-full p-0.5 text-amber-700/80 transition-colors hover:bg-amber-500/20 hover:text-amber-900 disabled:opacity-50 dark:text-amber-300/80 dark:hover:text-amber-200"
                  aria-label={`Remove ${title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="excluded-title-input"
            value={draft}
            disabled={disabled}
            placeholder='e.g. "Sales Representative"'
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="h-8 flex-1 rounded-lg border border-border/60 bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-border focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={handleAdd}
            className={cn(
              PRIMARY_ACTION_BTN_CLASSNAME,
              "shrink-0 gap-1.5 px-3 text-xs"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add title</span>
          </button>
        </div>
      </div>
    </SettingsFeatureCard>
  );
}
