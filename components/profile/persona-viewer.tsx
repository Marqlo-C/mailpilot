"use client";

import { useEffect, useState } from "react";

import {
  collectRolesFromFacts,
  explainCandidatePersona,
  extractPersonaFacts,
} from "@/lib/ai/persona";
import {
  BulletSquircle,
  SettingsEntryCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import type { MasterProfileInput } from "@/lib/validations/profile";

type PersonaViewerProps = {
  accountId: string | null;
  profile: MasterProfileInput & {
    seniorityTier?: string | null;
    timelineContext?: string | null;
    toneGuidance?: string | null;
  };
};

type PersonaPanels = {
  trajectory: boolean;
  tone: boolean;
  logic: boolean;
};

const DEFAULT_PANELS: PersonaPanels = {
  trajectory: false,
  tone: false,
  logic: false,
};

function personaPanelsKey(accountId: string | null): string {
  return accountId
    ? `mailpilot_persona_panels_${accountId}`
    : "mailpilot_persona_panels_default";
}

function loadPersonaPanels(accountId: string | null): PersonaPanels {
  if (typeof window === "undefined") return DEFAULT_PANELS;
  try {
    const raw = localStorage.getItem(personaPanelsKey(accountId));
    if (!raw) return DEFAULT_PANELS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PANELS;
    const record = parsed as Record<string, unknown>;
    return {
      trajectory:
        typeof record.trajectory === "boolean"
          ? record.trajectory
          : DEFAULT_PANELS.trajectory,
      tone: typeof record.tone === "boolean" ? record.tone : DEFAULT_PANELS.tone,
      logic:
        typeof record.logic === "boolean" ? record.logic : DEFAULT_PANELS.logic,
    };
  } catch {
    return DEFAULT_PANELS;
  }
}

function savePersonaPanels(accountId: string | null, panels: PersonaPanels): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(personaPanelsKey(accountId), JSON.stringify(panels));
  } catch {
    // Ignore quota or private-mode failures.
  }
}

/**
 * Read-only persona breakdown inside Persona & Career Synthesis.
 * Stored columns win when present; title family and rationale come from the
 * current profile.
 */
export function PersonaViewer({ accountId, profile }: PersonaViewerProps) {
  const explained = explainCandidatePersona(profile);
  const tier = profile.seniorityTier?.trim() || explained.seniorityTier;
  const timeline = profile.timelineContext?.trim() || explained.timelineContext;
  const tone = profile.toneGuidance?.trim() || explained.toneGuidance;
  const posture =
    explained.archetype === "Cross-Disciplinary Hybrid" ? "Hybrid" : "Grounded";
  const rolesAnalyzed = collectRolesFromFacts(
    extractPersonaFacts(profile)
  ).length;
  const [open, setOpen] = useState<PersonaPanels>(DEFAULT_PANELS);

  useEffect(() => {
    setOpen(loadPersonaPanels(accountId));
  }, [accountId]);

  function toggle(panel: keyof PersonaPanels) {
    setOpen((current) => {
      const next = { ...current, [panel]: !current[panel] };
      savePersonaPanels(accountId, next);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <SettingsEntryCard
        index={1}
        title="Career Trajectory & Seniority"
        subtitle="Primary target title family and tenure summary."
        trailing={
          <SettingsStatusPill level={3} showDot={false}>
            {tier}
          </SettingsStatusPill>
        }
        isExpanded={open.trajectory}
        onToggle={() => toggle("trajectory")}
        curvedDivider
      >
        <div className="space-y-2.5 text-sm leading-relaxed text-foreground/90">
          <p>
            <span className="font-medium text-foreground">Title family: </span>
            {explained.titleFamily}
          </p>
          <p>{timeline}</p>
        </div>
      </SettingsEntryCard>

      <SettingsEntryCard
        index={2}
        title="Tone & Positioning Strategy"
        subtitle="Communication constraints and framing used for email drafting."
        trailing={
          <SettingsStatusPill level={3} showDot={false}>
            {posture}
          </SettingsStatusPill>
        }
        isExpanded={open.tone}
        onToggle={() => toggle("tone")}
        curvedDivider
      >
        <p className="text-sm leading-relaxed text-foreground/90">{tone}</p>
      </SettingsEntryCard>

      <SettingsEntryCard
        index={3}
        title="Synthesis Decision Logic"
        subtitle="How title family overlaps and tenure were evaluated."
        trailing={
          <SettingsStatusPill level={3} showDot={false}>
            {rolesAnalyzed} {rolesAnalyzed === 1 ? "role" : "roles"}
          </SettingsStatusPill>
        }
        isExpanded={open.logic}
        onToggle={() => toggle("logic")}
        curvedDivider
      >
        <ul className="space-y-2">
          {explained.rationale.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2.5 text-sm leading-relaxed"
            >
              <BulletSquircle />
              <span className="min-w-0 flex-1 text-foreground/90">{line}</span>
            </li>
          ))}
        </ul>
      </SettingsEntryCard>
    </div>
  );
}
