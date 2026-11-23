"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldBan, X } from "lucide-react";
import { toast } from "sonner";

import { addExcludedTitle, removeExcludedTitle } from "@/app/actions/settings";
import { formatToastError } from "@/lib/utils/ui/toast-format";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { EmptyState } from "@/components/ui/composites";
import {
  SettingsFeatureCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import { Input } from "@/components/ui/input";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";

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
        toast.error(formatToastError(result.error));
        return;
      }
      setDraft("");
      toast.success("Role excluded");
      router.refresh();
    });
  }

  function handleRemove(title: string) {
    if (!accountId) return;
    startTransition(async () => {
      const result = await removeExcludedTitle(accountId, title);
      if (!result.ok) {
        toast.error(formatToastError(result.error));
        return;
      }
      toast.success("Role restored");
      router.refresh();
    });
  }

  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={ShieldBan} />}
      title="Roles to hide"
      subtitle="Titles you blocked. Matching listings are soft-hidden on Job Radar."
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
          <EmptyState
            size="sm"
            title="Nothing excluded yet"
            description="On any opportunity card, open the ⋮ menu and choose &quot;Block Role Title&quot; — or add a title below."
            className="border-border/80"
          />
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

        <Input
          id="excluded-title-input"
          leadingIcon={ShieldBan}
          clearable
          onClear={() => setDraft("")}
          value={draft}
          disabled={disabled}
          placeholder='e.g. "Sales Representative"'
          aria-label="Role title to hide"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          trailing={
            <FieldTrailingButton
              aria-label="Add title"
              disabled={disabled || !draft.trim()}
              onClick={handleAdd}
            >
              <Plus className="size-3.5" aria-hidden />
            </FieldTrailingButton>
          }
        />
      </div>
    </SettingsFeatureCard>
  );
}
