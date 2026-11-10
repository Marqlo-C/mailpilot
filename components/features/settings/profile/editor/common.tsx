import React, { useMemo } from "react";
import type { ProfileSnapshotData } from "@/components/features/settings/profile";
import { extractPlatformLinks } from "@/lib/profile/profile-consolidation";
import { skillGroupsFromUnknown } from "@/lib/profile/skill-groups";
import {
  getEmptyMasterProfileData,
  STANDARD_EXPERIENCE_CATEGORIES,
  type MasterProfileUpdateInput,
} from "@/lib/validations/profile.schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyForm(emailFallback = ""): MasterProfileUpdateInput {
  return {
    ...getEmptyMasterProfileData(),
    email: emailFallback,
    linkedWebsite: null,
    linkedIndeed: null,
    linkedGlassdoor: null,
    linkedGithub: null,
    linkedLinkedin: null,
    linkedHandshake: null,
  };
}

export function profileToForm(profile: ProfileSnapshotData | null): MasterProfileUpdateInput {
  if (!profile) return emptyForm();
  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone ?? null,
    location: profile.location ?? null,
    summary: profile.summary ?? null,
    links: profile.links ?? [],
    skills: skillGroupsFromUnknown(profile.skills),
    experiences: profile.experiences.map((exp) => ({
      ...exp,
      id: exp.id ?? newId(),
      bullets: exp.bullets.map((b) => ({ ...b, id: b.id || newId() })),
    })),
    certifications: profile.certifications ?? [],
    awards: profile.awards ?? [],
    interests: profile.interests ?? [],
    projects: [...profile.projects]
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        })
      )
      .map((p) => ({
        ...p,
        id: p.id ?? newId(),
        bullets: [...p.bullets],
        technologies: [...p.technologies],
      })),
    education: profile.education.map((ed) => ({
      ...ed,
      id: ed.id ?? newId(),
    })),
    ...(() => {
      const detected = extractPlatformLinks(profile.links ?? []);
      return {
        linkedWebsite: profile.linkedWebsite || detected.linkedWebsite,
        linkedIndeed: profile.linkedIndeed || detected.linkedIndeed,
        linkedGlassdoor: profile.linkedGlassdoor || detected.linkedGlassdoor,
        linkedGithub: profile.linkedGithub || detected.linkedGithub,
        linkedLinkedin: profile.linkedLinkedin || detected.linkedLinkedin,
        linkedHandshake: profile.linkedHandshake || detected.linkedHandshake,
      };
    })(),
  };
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = useMemo(() => label.toLowerCase().replace(/\s+/g, "-"), [label]);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function CollapsedSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

export function categoryOptions(current: string | null | undefined): string[] {
  const value = current?.trim() || "Work";
  if (
    (STANDARD_EXPERIENCE_CATEGORIES as readonly string[]).includes(value)
  ) {
    return [...STANDARD_EXPERIENCE_CATEGORIES];
  }
  return [value, ...STANDARD_EXPERIENCE_CATEGORIES];
}
