"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldBan, X } from "lucide-react";
import { toast } from "sonner";

import { addExcludedTitle, removeExcludedTitle } from "@/app/actions/settings";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { cn } from "@/lib/utils";

type ExcludedTitlesCardProps = {
  accountId: string | null;
  excludedTitles: string[];
};

export function ExcludedTitlesCard({
  accountId,
  excludedTitles,
}: ExcludedTitlesCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const disabled = !accountId || pending;

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
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <ShieldBan
          className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Excluded Job Titles"
      subtitle="Roles flagged with 'Less like this' — matching listings are penalized and soft-hidden."
      curvedDivider
    >
      <div className="space-y-4">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to manage excluded titles.
          </p>
        )}

        {excludedTitles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/80 px-4 py-6 text-center text-xs text-muted-foreground">
            No excluded titles yet. Select &quot;Less like this&quot; from the &quot;…&quot; menu on any opportunity card to train the filter.
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
            className="h-8 flex-1 rounded-lg border border-border/60 bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-border focus:ring-1 focus:ring-ring"
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
            <span>Add Title</span>
          </button>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
