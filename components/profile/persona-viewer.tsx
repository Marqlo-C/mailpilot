"use client";

import { explainCandidatePersona } from "@/lib/ai/persona";
import { Badge } from "@/components/ui/badge";
import type { MasterProfileInput } from "@/lib/validations/profile";

type PersonaViewerProps = {
  profile: MasterProfileInput & {
    seniorityTier?: string | null;
    timelineContext?: string | null;
    toneGuidance?: string | null;
  };
};

/**
 * Read-only persona card. Stored columns are shown when present; the
 * title family and tier rationale are recomputed from the current profile.
 */
export function PersonaViewer({ profile }: PersonaViewerProps) {
  const explained = explainCandidatePersona(profile);
  const tier = profile.seniorityTier?.trim() || explained.seniorityTier;
  const timeline = profile.timelineContext?.trim() || explained.timelineContext;
  const tone = profile.toneGuidance?.trim() || explained.toneGuidance;

  return (
    <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2">
            Persona
            <Badge variant="secondary">{tier}</Badge>
          </span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-border/60 px-4 py-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Seniority
          </p>
          <p className="mt-1 font-medium">{tier}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Title family
          </p>
          <p className="mt-1">{explained.titleFamily}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Timeline
          </p>
          <p className="mt-1 leading-relaxed text-foreground/90">{timeline}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Tone and positioning
          </p>
          <p className="mt-1 leading-relaxed text-foreground/90">{tone}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            How this was decided
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-foreground/90">
            {explained.rationale.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
