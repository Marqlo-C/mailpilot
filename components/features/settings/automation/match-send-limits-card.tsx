"use client";

import { Gauge } from "lucide-react";

import { SETTINGS_ROW_CLASSNAME } from "@/lib/utils/navigation/settings-chrome";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import {
  SettingsFeatureCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import { NumericField } from "@/components/ui/tactile/numeric-field";
import { WavySlider } from "@/components/ui/tactile/wavy-slider";
import { cn } from "@/lib/utils";

type MatchSendLimitsCardProps = {
  threshold: number;
  maxAutoSends: number;
  disabled: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onThresholdChange: (value: number) => void;
  onThresholdCommit: (value: number) => void;
  onMaxAutoSendsChange: (value: number) => void;
  onMaxAutoSendsCommit: (value: number) => void;
};

/**
 * L2 — Match filter + daily auto-send cap for Job Applications.
 */
export function MatchSendLimitsCard({
  threshold,
  maxAutoSends,
  disabled,
  isExpanded,
  onToggle,
  onThresholdChange,
  onThresholdCommit,
  onMaxAutoSendsChange,
  onMaxAutoSendsCommit,
}: MatchSendLimitsCardProps) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Gauge} />}
      title="Match filter & send limits"
      subtitle="Hide weak leads and cap how many applications MailPilot can send per day."
      statusBadge={
        <SettingsStatusPill showDot={false}>{threshold}% filter</SettingsStatusPill>
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div
            className={cn(
              SETTINGS_ROW_CLASSNAME,
              "flex flex-wrap items-center gap-2.5 px-5 py-2 sm:flex-nowrap"
            )}
          >
            <label
              htmlFor="match-filter"
              className="shrink-0 whitespace-nowrap text-xs font-medium text-foreground/80"
            >
              Match filter
            </label>
            <NumericField
              id="match-filter"
              value={threshold}
              min={0}
              max={100}
              step={1}
              percent
              steppers
              disabled={disabled}
              aria-label="Match filter"
              onChange={onThresholdChange}
              onCommit={onThresholdCommit}
            />
            <WavySlider
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              value={threshold}
              onChange={onThresholdChange}
              onCommit={onThresholdCommit}
              widthClassName="min-w-0 w-full"
              className="ml-2 min-w-0 flex-1 sm:ml-3"
              aria-label="Match filter"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Leads below this score are soft-hidden on Job Radar. Set to 0% to show
            everything.
          </p>
        </div>

        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <label
            htmlFor="max-sends"
            className="block text-xs font-semibold text-foreground"
          >
            Max daily auto-sends
          </label>
          <NumericField
            id="max-sends"
            value={maxAutoSends}
            min={1}
            max={20}
            step={1}
            steppers
            disabled={disabled}
            aria-label="Max daily auto-sends"
            onChange={onMaxAutoSendsChange}
            onCommit={onMaxAutoSendsCommit}
          />
          <p className="text-[11px] text-muted-foreground">
            Safety cap when auto-send is on (1–20 applications per day).
          </p>
        </div>
      </div>
    </SettingsFeatureCard>
  );
}
