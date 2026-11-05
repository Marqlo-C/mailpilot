"use client";

import { Inbox } from "lucide-react";

import { SettingsFeatureLogo } from "@/components/settings/ui/feature-logo";
import {
  SettingsFeatureCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import { NumericField } from "@/components/ui/tactile/numeric-field";
import {
  MAX_PENDING_AI_DRAIN,
  MAX_SYNC_MAX_MESSAGES,
  MIN_PENDING_AI_DRAIN,
  MIN_SYNC_MAX_MESSAGES,
} from "@/lib/opportunities/sync/limits";

type SyncThroughputCardProps = {
  syncMaxMessages: number;
  pendingAiDrain: number;
  disabled: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSyncMaxChange: (value: number) => void;
  onSyncMaxCommit: (value: number) => void;
  onPendingAiDrainChange: (value: number) => void;
  onPendingAiDrainCommit: (value: number) => void;
};

/**
 * L2 — How much mail Sync Inbox processes each run.
 */
export function SyncThroughputCard({
  syncMaxMessages,
  pendingAiDrain,
  disabled,
  isExpanded,
  onToggle,
  onSyncMaxChange,
  onSyncMaxCommit,
  onPendingAiDrainChange,
  onPendingAiDrainCommit,
}: SyncThroughputCardProps) {
  return (
    <SettingsFeatureCard
      logo={<SettingsFeatureLogo icon={Inbox} />}
      title="Sync Inbox size"
      subtitle="Control how many job emails each Sync Inbox run pulls and reviews."
      statusBadge={
        <SettingsStatusPill showDot={false}>
          {syncMaxMessages} / sync
        </SettingsStatusPill>
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="sync-max-messages"
            className="block text-xs font-semibold text-foreground"
          >
            Emails per Sync Inbox
          </label>
          <NumericField
            id="sync-max-messages"
            value={syncMaxMessages}
            min={MIN_SYNC_MAX_MESSAGES}
            max={MAX_SYNC_MAX_MESSAGES}
            step={1}
            steppers
            disabled={disabled}
            aria-label="Emails per Sync Inbox"
            onChange={onSyncMaxChange}
            onCommit={onSyncMaxCommit}
          />
          <p className="text-[11px] text-muted-foreground">
            Fresh job-search hits per manual sync ({MIN_SYNC_MAX_MESSAGES}–
            {MAX_SYNC_MAX_MESSAGES}).
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="pending-ai-drain"
            className="block text-xs font-semibold text-foreground"
          >
            Backlog reviewed per sync
          </label>
          <NumericField
            id="pending-ai-drain"
            value={pendingAiDrain}
            min={MIN_PENDING_AI_DRAIN}
            max={MAX_PENDING_AI_DRAIN}
            step={1}
            steppers
            disabled={disabled}
            aria-label="Backlog reviewed per sync"
            onChange={onPendingAiDrainChange}
            onCommit={onPendingAiDrainCommit}
          />
          <p className="text-[11px] text-muted-foreground">
            Older unread job emails still waiting for review (
            {MIN_PENDING_AI_DRAIN}–{MAX_PENDING_AI_DRAIN}).
          </p>
        </div>
      </div>
    </SettingsFeatureCard>
  );
}
