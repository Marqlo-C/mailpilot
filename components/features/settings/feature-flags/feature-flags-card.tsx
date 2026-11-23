"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatToastError } from "@/lib/utils/ui/toast-format";
import {
  Activity,
  AlertOctagon,
  Cpu,
  Globe,
  SlidersHorizontal,
} from "lucide-react";

import { toggleFeatureFlagAction } from "@/app/actions/settings";
import {
  SettingsSectionCard,
  SettingsFeatureCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { SETTINGS_CARD_CLASSNAME } from "@/lib/utils/navigation/settings-chrome";
import { getEffectiveFeatureFlags } from "@/lib/core/feature-flags";
import {
  resolveDeploymentEnvironment,
  type DeploymentEnvironment,
} from "@/lib/config/features.config";
import {
  FEATURE_FLAGS_REGISTRY,
  type FeatureFlagKey,
} from "@/lib/validations/feature-flags.schema";
import type { AccountRules } from "@/lib/validations/rules.schema";
import { cn } from "@/lib/utils";
import { FeatureFlagRow } from "./feature-flag-row";

export interface FeatureFlagsCardProps {
  accountId: string | null;
  rules: AccountRules;
  killSwitches?: Record<FeatureFlagKey, boolean>;
  environment?: DeploymentEnvironment;
  className?: string;
}

interface FeatureFlagSystemGroup {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  flagKeys: readonly FeatureFlagKey[];
}

const SYSTEM_FLAG_GROUPS: readonly FeatureFlagSystemGroup[] = [
  {
    id: "ai_vector_engines",
    title: "AI & Vector Engines",
    description:
      "Semantic vector crossover scoring, transferable skill graphs, and generative impact synthesis.",
    icon: Cpu,
    flagKeys: ["embedded_ai", "mode_b_metric_synthesis"],
  },
  {
    id: "platform_telemetry",
    title: "Platform Telemetry",
    description:
      "Dark-launch dual-scoring evaluation and background calibration without user-facing impact.",
    icon: Activity,
    flagKeys: ["shadow_evaluation"],
  },
  {
    id: "scraping_egress",
    title: "Scraping & Egress",
    description:
      "Third-party proxy egress networks (ScrapingAnt and HasData) for anti-bot bypass and job extraction.",
    icon: Globe,
    flagKeys: ["web_scraping_proxies"],
  },
] as const;

const ENVIRONMENT_CONFIG: Record<
  DeploymentEnvironment,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  development: {
    label: "Development Tier",
    badgeClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dotClass: "bg-emerald-500",
  },
  preview: {
    label: "Preview Tier",
    badgeClass:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    dotClass: "bg-sky-500",
  },
  production: {
    label: "Production Tier",
    badgeClass:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    dotClass: "bg-rose-500",
  },
};

export function FeatureFlagsCard({
  accountId,
  rules,
  killSwitches,
  environment,
  className,
}: FeatureFlagsCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const currentEnv = React.useMemo(
    () => environment ?? resolveDeploymentEnvironment(),
    [environment]
  );

  const effectiveBase = React.useMemo(
    () => getEffectiveFeatureFlags(rules),
    [rules]
  );

  const [prevEffectiveBase, setPrevEffectiveBase] =
    React.useState(effectiveBase);
  const [optimisticFlags, setOptimisticFlags] =
    React.useState<Record<FeatureFlagKey, boolean>>(effectiveBase);

  if (prevEffectiveBase !== effectiveBase) {
    setPrevEffectiveBase(effectiveBase);
    setOptimisticFlags(effectiveBase);
  }

  const activeKillSwitchCount = React.useMemo(() => {
    if (!killSwitches) return 0;
    return Object.values(killSwitches).filter(Boolean).length;
  }, [killSwitches]);

  const storageKey = React.useMemo(
    () => `mailpilot_dev_flags_accordion_${accountId ?? "default"}`,
    [accountId]
  );

  const [expandedGroups, setExpandedGroups] = React.useState<
    Record<string, boolean>
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed === "object" && parsed !== null) {
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return {
      ai_vector_engines: true,
      platform_telemetry: true,
      scraping_egress: true,
    };
  });

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = {
        ...prev,
        [id]: prev[id] === undefined ? false : !prev[id],
      };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const handleToggle = (flagKey: FeatureFlagKey, nextVal: boolean) => {
    if (!accountId) {
      toast.error("Account required");
      return;
    }

    const previousVal = optimisticFlags[flagKey];
    setOptimisticFlags((prev) => ({ ...prev, [flagKey]: nextVal }));

    startTransition(async () => {
      const res = await toggleFeatureFlagAction({
        accountId,
        flagKey,
        enabled: nextVal,
      });

      if (!res.success) {
        setOptimisticFlags((prev) => ({ ...prev, [flagKey]: previousVal }));
        toast.error(formatToastError(res.error, "Flag update failed"));
      } else {
        const flagDef = FEATURE_FLAGS_REGISTRY[flagKey];
        toast.success(
          `${flagDef.label} ${nextVal ? "enabled" : "disabled"}`
        );
        router.refresh();
      }
    });
  };

  const envConfig = ENVIRONMENT_CONFIG[currentEnv];

  return (
    <SettingsSectionCard
      className={cn(SETTINGS_CARD_CLASSNAME, className)}
      icon={
        <SlidersHorizontal
          className="size-8 -translate-y-0.5 origin-center scale-[1.15] shrink-0 text-primary"
          aria-hidden="true"
        />
      }
      title="Feature Flags & System Controls"
      subtitle="Govern experimental engines, high-compute vector AI, dark-launch telemetry, and operational kill-switches."
      curvedDivider
      toggle={
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
            envConfig.badgeClass
          )}
          data-testid="environment-tier-badge"
        >
          <span
            className={cn("size-1.5 rounded-full", envConfig.dotClass)}
            aria-hidden="true"
          />
          <span>{envConfig.label}</span>
        </div>
      }
    >
      <div className="space-y-3.5">
        {activeKillSwitchCount > 0 ? (
          <div
            className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
            data-testid="active-kill-switch-banner"
          >
            <AlertOctagon className="size-4 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong>Emergency Kill-Switch Active:</strong>{" "}
              {activeKillSwitchCount} feature flag
              {activeKillSwitchCount > 1 ? "s are" : " is"} locked globally via
              platform environment variable overrides. Account overrides are
              suppressed.
            </p>
          </div>
        ) : null}

        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure experimental feature flags.
          </p>
        ) : null}

        {SYSTEM_FLAG_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const groupFlags = group.flagKeys.filter(
            (key) => FEATURE_FLAGS_REGISTRY[key] !== undefined
          );

          if (groupFlags.length === 0) return null;

          const isAnyLocked = groupFlags.some((key) =>
            Boolean(killSwitches?.[key])
          );
          const enabledCount = groupFlags.filter(
            (key) =>
              optimisticFlags[key] ?? FEATURE_FLAGS_REGISTRY[key]?.defaultValue
          ).length;
          const totalCount = groupFlags.length;

          return (
            <SettingsFeatureCard
              key={group.id}
              logo={<LogoFrameIcon icon={GroupIcon} />}
              title={group.title}
              subtitle={group.description}
              statusBadge={
                <SettingsStatusPill
                  count={enabledCount}
                  hasItems={enabledCount > 0}
                  dotClassName={isAnyLocked ? "bg-rose-500" : undefined}
                >
                  {isAnyLocked
                    ? "System locked"
                    : enabledCount === totalCount
                      ? "All active"
                      : enabledCount > 0
                        ? `${enabledCount}/${totalCount} active`
                        : "Disabled"}
                </SettingsStatusPill>
              }
              isExpanded={expandedGroups[group.id] ?? true}
              onToggle={() => toggleGroup(group.id)}
              curvedDivider
            >
              <div className="space-y-2.5">
                {groupFlags.map((key) => {
                  const definition = FEATURE_FLAGS_REGISTRY[key];
                  const enabled =
                    optimisticFlags[key] ?? definition.defaultValue;
                  const isLockedByKillSwitch = Boolean(killSwitches?.[key]);

                  return (
                    <FeatureFlagRow
                      key={key}
                      definition={definition}
                      enabled={enabled}
                      isLockedByKillSwitch={isLockedByKillSwitch}
                      disabled={!accountId || isPending}
                      onToggle={handleToggle}
                    />
                  );
                })}
              </div>
            </SettingsFeatureCard>
          );
        })}
      </div>
    </SettingsSectionCard>
  );
}
