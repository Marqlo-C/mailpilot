"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radar, Recycle } from "lucide-react";
import { toast } from "sonner";

import { updateMatchThreshold } from "@/app/actions/profile";
import { updateRule } from "@/app/actions/settings";
import { ExcludedTitlesCard } from "@/components/features/settings/automation/excluded-titles-card";
import { LifecycleRulesCard } from "@/components/features/settings/automation/lifecycle-rules-card";
import { MatchSendLimitsCard } from "@/components/features/settings/automation/match-send-limits-card";
import { RetentionPolicyCard } from "@/components/features/settings/automation/retention-policy-card";
import { SyncThroughputCard } from "@/components/features/settings/automation/sync-throughput-card";
import { SETTINGS_CARD_CLASSNAME } from "@/lib/utils/navigation/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile.schema";
import type { AccountRules } from "@/lib/validations/rules.schema";

import {
  type StoredAutomationAccordionState,
  DEFAULT_AUTOMATION_ACCORDION,
  loadStoredAutomationAccordion,
  saveStoredAutomationAccordion,
} from "@/lib/utils/navigation/settings-accordion";

export type AutomationCardProps = {
  accountId: string | null;
  rules: AccountRules;
  matchThreshold?: number | null;
  initialAccordion?: StoredAutomationAccordionState | null;
};

type AccordionState = StoredAutomationAccordionState;

/**
 * Automation tab root — Job Applications + Mail cleanup, L1 → L2 like
 * Outbound / AI Models.
 */
export function AutomationCard({
  accountId,
  rules,
  matchThreshold,
  initialAccordion,
}: AutomationCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [threshold, setThreshold] = useState(
    matchThreshold ?? DEFAULT_MATCH_THRESHOLD
  );
  const [maxAutoSends, setMaxAutoSends] = useState(rules.maxAutoSendsPerDay);
  const [syncMaxMessages, setSyncMaxMessages] = useState(rules.syncMaxMessages);
  const [pendingAiDrain, setPendingAiDrain] = useState(
    rules.pendingAiDrainLimit
  );
  const [accordion, setAccordion] = useState<AccordionState>(
    () => initialAccordion ?? loadStoredAutomationAccordion(accountId)
  );

  const disabled = !accountId || pending;
  const autoSend = rules.applicationMode === "AUTO_SEND";

  useEffect(() => {
    const stored = loadStoredAutomationAccordion(accountId);
    setAccordion((prev) => {
      if (
        prev.matchOpen === stored.matchOpen &&
        prev.syncOpen === stored.syncOpen &&
        prev.excludedOpen === stored.excludedOpen &&
        prev.retentionOpen === stored.retentionOpen &&
        prev.lifecycleOpen === stored.lifecycleOpen
      ) {
        return prev;
      }
      return stored;
    });
    saveStoredAutomationAccordion(accountId, stored);
  }, [accountId]);

  useEffect(() => {
    setThreshold(matchThreshold ?? DEFAULT_MATCH_THRESHOLD);
  }, [matchThreshold]);

  useEffect(() => {
    setMaxAutoSends(rules.maxAutoSendsPerDay);
    setSyncMaxMessages(rules.syncMaxMessages);
    setPendingAiDrain(rules.pendingAiDrainLimit);
  }, [
    rules.maxAutoSendsPerDay,
    rules.syncMaxMessages,
    rules.pendingAiDrainLimit,
  ]);

  function toggleSection(key: keyof AccordionState) {
    setAccordion((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveStoredAutomationAccordion(accountId, next);
      return next;
    });
  }

  function patchRule(key: keyof AccountRules, value: string | number) {
    if (!accountId) return;
    startTransition(async () => {
      const result = await updateRule(accountId, key, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function commitThreshold(value: number) {
    if (!accountId) return;
    const next = Math.min(100, Math.max(0, Math.round(value)));
    setThreshold(next);
    startTransition(async () => {
      const result = await updateMatchThreshold(accountId, next);
      if (!result.ok) {
        toast.error(result.error);
        setThreshold(matchThreshold ?? DEFAULT_MATCH_THRESHOLD);
        return;
      }
      toast.success(`Match filter set to ${next}%`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        className={SETTINGS_CARD_CLASSNAME}
        icon={
          <Radar
            className="size-8 -translate-y-0.5 origin-center scale-[1.15] shrink-0 text-primary"
            aria-hidden="true"
          />
        }
        title="Job Applications"
        subtitle="What MailPilot shows on Job Radar, how Sync Inbox runs, and whether matching leads can send automatically."
        toggle={
          <WaveToggle
            id="applicationMode"
            checked={autoSend}
            disabled={disabled}
            onCheckedChange={(checked) => {
              patchRule(
                "applicationMode",
                checked ? "AUTO_SEND" : "MANUAL_REVIEW"
              );
              toast.success(
                checked
                  ? "Auto-send enabled for matching leads"
                  : "Manual review required before sending"
              );
            }}
          />
        }
        curvedDivider
      >
        <div className="space-y-3.5">
          {!accountId ? (
            <p className="text-sm text-muted-foreground">
              Connect an account to configure application automation.
            </p>
          ) : null}

          <MatchSendLimitsCard
            threshold={threshold}
            maxAutoSends={maxAutoSends}
            disabled={disabled}
            isExpanded={accordion.matchOpen}
            onToggle={() => toggleSection("matchOpen")}
            onThresholdChange={setThreshold}
            onThresholdCommit={commitThreshold}
            onMaxAutoSendsChange={setMaxAutoSends}
            onMaxAutoSendsCommit={(next) =>
              patchRule("maxAutoSendsPerDay", next)
            }
          />

          <SyncThroughputCard
            syncMaxMessages={syncMaxMessages}
            pendingAiDrain={pendingAiDrain}
            disabled={disabled}
            isExpanded={accordion.syncOpen}
            onToggle={() => toggleSection("syncOpen")}
            onSyncMaxChange={setSyncMaxMessages}
            onSyncMaxCommit={(next) => patchRule("syncMaxMessages", next)}
            onPendingAiDrainChange={setPendingAiDrain}
            onPendingAiDrainCommit={(next) =>
              patchRule("pendingAiDrainLimit", next)
            }
          />

          <ExcludedTitlesCard
            accountId={accountId}
            excludedTitles={rules.excludedTitles}
            isExpanded={accordion.excludedOpen}
            onToggle={() => toggleSection("excludedOpen")}
          />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        className={SETTINGS_CARD_CLASSNAME}
        icon={
          <Recycle
            className="size-8 -translate-y-0.5 origin-center scale-[1.15] shrink-0 text-primary"
            aria-hidden="true"
          />
        }
        title="Mail cleanup"
        subtitle="How rejection mail and dismissed History items are cleaned up."
        curvedDivider
      >
        <div className="space-y-3.5">
          <RetentionPolicyCard
            currentDays={rules.dismissedRetentionDays}
            isExpanded={accordion.retentionOpen}
            onToggle={() => toggleSection("retentionOpen")}
          />
          <LifecycleRulesCard
            accountId={accountId}
            rules={rules}
            isExpanded={accordion.lifecycleOpen}
            onToggle={() => toggleSection("lifecycleOpen")}
          />
        </div>
      </SettingsSectionCard>
    </div>
  );
}

export { ExcludedTitlesCard } from "@/components/features/settings/automation/excluded-titles-card";
export { LifecycleRulesCard } from "@/components/features/settings/automation/lifecycle-rules-card";
export { MatchSendLimitsCard } from "@/components/features/settings/automation/match-send-limits-card";
export { RetentionPolicyCard } from "@/components/features/settings/automation/retention-policy-card";
export { SyncThroughputCard } from "@/components/features/settings/automation/sync-throughput-card";

export default AutomationCard;
