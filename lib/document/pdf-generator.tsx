import React from "react";
import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";

// Disable automatic mid-word hyphenation splitting across lines globally
Font.registerHyphenationCallback((word) => [word]);

import type {
  MasterProfileInput,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import { skillGroupsFromUnknown } from "@/lib/profile/skill-groups";
import type { SkillGroup } from "@/lib/types/resume-draft";
import {
  DEFAULT_SECTION_ORDER,
  RESUME_SECTION_KEYS,
} from "@/lib/resume-draft/schema.ssot";
import {
  buildResumeContactLine,
  cleanDisplayUrl,
  dedupeContactItems,
  formatEducationDates,
  formatEducationTitle,
  formatExperienceHeading,
  formatSchoolName,
  sanitizeResumeContactLine,
} from "@/lib/utils/format";
import { categorizeProfileUrl, isResumeHeaderLink } from "@/lib/utils/url";

export { buildResumeContactLine, sanitizeResumeContactLine };

/** @deprecated Prefer cleanDisplayUrl from @/lib/utils/format */
export const cleanContactUrl = cleanDisplayUrl;

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  brandMark: {
    width: 28,
    height: 28,
  },
  name: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  contact: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 10,
  },
  section: {
    marginTop: 10,
  },
  heading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    paddingBottom: 2,
    marginBottom: 6,
  },
  roleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  roleTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    flex: 1,
    marginRight: 8,
  },
  muted: {
    color: "#4B5563",
    fontSize: 9,
    textAlign: "right",
    flexShrink: 0,
  },
  bullet: {
    marginLeft: 8,
    marginBottom: 2,
    maxWidth: "95%",
  },
  skills: {
    fontSize: 9,
    lineHeight: 1.4,
  },
  skillLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
});

type PdfInput = {
  profile: MasterProfileInput;
  experiences: WorkExperienceInput[];
  projects?: ProjectInput[];
  tailoredSummary?: string | null;
  tailoredSkills?: MasterProfileInput["skills"] | null;
  includeSummary?: boolean;
  headerName?: string | null;
  contactLine?: string | null;
  education?: MasterProfileInput["education"] | null;
  skillGroups?: SkillGroup[] | null;
  certifications?: MasterProfileInput["certifications"] | null;
  awards?: MasterProfileInput["awards"] | null;
  interests?: MasterProfileInput["interests"] | null;
  sectionOrder?: string[] | null;
  disabledSections?: string[] | null;
};

const INVERTED_LOGO_PATH = path.join(
  process.cwd(),
  "public/logos/transparent-logo.png"
);

function ResumeDocument({
  profile,
  experiences,
  projects,
  tailoredSummary,
  tailoredSkills,
  includeSummary = true,
  headerName,
  contactLine,
  education,
  skillGroups,
  certifications,
  awards,
  interests,
  sectionOrder,
  disabledSections,
}: PdfInput) {
  const contact = sanitizeResumeContactLine(
    contactLine?.trim() || buildResumeContactLine(profile)
  );
  const displayName = headerName?.trim() || profile.fullName;
  const educationRows = education ?? profile.education;
  const certificationRows = certifications ?? profile.certifications ?? [];
  const awardRows = awards ?? profile.awards ?? [];
  const interestRows = interests ?? profile.interests ?? [];

  const showSummary =
    includeSummary !== false &&
    Boolean((tailoredSummary ?? profile.summary)?.trim());
  const explicitGroups = skillGroups?.filter((group) => group.items.length > 0);
  const resolvedGroups =
    explicitGroups && explicitGroups.length > 0
      ? explicitGroups
      : skillGroupsFromUnknown(tailoredSkills);
  const renderedGroups =
    resolvedGroups.length > 0
      ? resolvedGroups
      : skillGroupsFromUnknown(profile.skills);

  const disabledSet = new Set(
    (disabledSections ?? []).map((s) => s.toLowerCase())
  );
  const rawOrder =
    sectionOrder && sectionOrder.length > 0
      ? sectionOrder
      : [...DEFAULT_SECTION_ORDER, "awards", "interests"];

  const effectiveOrder: string[] = [];
  for (const item of rawOrder) {
    const key = item.toLowerCase();
    if (!disabledSet.has(key) && !effectiveOrder.includes(key)) {
      effectiveOrder.push(key);
    }
  }
  for (const key of RESUME_SECTION_KEYS) {
    if (!disabledSet.has(key) && !effectiveOrder.includes(key)) {
      effectiveOrder.push(key);
    }
  }

  const renderSection = (key: string) => {
    switch (key) {
      case "summary":
        if (!showSummary) return null;
        return (
          <View key="summary" style={styles.section}>
            <Text style={styles.heading}>Summary</Text>
            <Text>{tailoredSummary || profile.summary}</Text>
          </View>
        );

      case "skills":
        if (renderedGroups.length === 0) return null;
        return (
          <View key="skills" style={styles.section}>
            <Text style={styles.heading}>Skills</Text>
            <Text style={styles.skills}>
              {renderedGroups.flatMap((group, index) => {
                const items = group.items.map((item) => item.name).join(", ").trim();
                if (!items) return [];
                const label = [group.parentCategory?.trim(), group.label.trim()]
                  .filter(Boolean)
                  .join(" — ");
                return [
                  index > 0 ? (
                    <Text key={`${index}-sep`}>{" • "}</Text>
                  ) : null,
                  label ? (
                    <Text key={`${index}-label`} style={styles.skillLabel}>
                      {`${label}: `}
                    </Text>
                  ) : null,
                  <Text key={`${index}-items`}>{items}</Text>,
                ];
              })}
            </Text>
          </View>
        );

      case "experience":
        if (experiences.length === 0) return null;
        return (
          <View key="experience" style={styles.section}>
            <Text style={styles.heading}>Experience</Text>
            {experiences.map((exp) => (
              <View key={`${exp.company}-${exp.role}`} style={{ marginBottom: 8 }}>
                <View style={styles.roleHeader}>
                  <Text style={styles.roleTitle}>
                    {formatExperienceHeading(exp.role, exp.company, exp.location) || exp.role}
                  </Text>
                  <Text style={styles.muted}>
                    {exp.startDate} – {exp.endDate ?? "Present"}
                  </Text>
                </View>
                {exp.bullets.map((b) => (
                  <Text key={b.id} style={styles.bullet}>
                    • {b.rawText}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );

      case "projects":
        if (!projects || projects.length === 0) return null;
        return (
          <View key="projects" style={styles.section}>
            <Text style={styles.heading}>Projects</Text>
            {projects.map((proj) => {
              const displayBullets =
                proj.bullets.length > 0
                  ? proj.bullets
                  : proj.description?.trim()
                    ? [proj.description.trim()]
                    : [];

              return (
                <View key={proj.name} style={{ marginBottom: 6 }}>
                  <View style={styles.roleHeader}>
                    <Text style={styles.roleTitle}>
                      <Text style={{ fontFamily: "Helvetica-Bold" }}>{proj.name}</Text>
                    </Text>
                    {proj.technologies.length > 0 ? (
                      <Text style={styles.muted}>
                        {proj.technologies.slice(0, 4).join(", ")}
                      </Text>
                    ) : null}
                  </View>
                  {displayBullets.map((bullet, idx) => (
                    <Text key={idx} style={styles.bullet}>
                      • {bullet}
                    </Text>
                  ))}
                </View>
              );
            })}
          </View>
        );

      case "education":
        if (educationRows.length === 0) return null;
        return (
          <View key="education" style={styles.section}>
            <Text style={styles.heading}>Education</Text>
            {educationRows.map((ed) => {
              const degreeText = formatEducationTitle(ed.degree, ed.fieldOfStudy);
              const school = formatSchoolName(ed.institution, ed.subSchool);
              const heading = [degreeText, school].filter(Boolean).join(" — ");
              return (
                <Text
                  key={`${ed.institution}-${ed.subSchool ?? ""}-${ed.degree}`}
                  style={{ marginBottom: 3 }}
                >
                  {formatEducationDates(ed) ? `${heading} (${formatEducationDates(ed)})` : heading}
                </Text>
              );
            })}
          </View>
        );

      case "certifications":
        if (certificationRows.length === 0) return null;
        return (
          <View key="certifications" style={styles.section}>
            <Text style={styles.heading}>Certifications & Licenses</Text>
            {certificationRows.map((item) => (
              <Text key={item.name} style={{ marginBottom: 3 }}>
                {item.name}
                {item.issuer ? ` — ${item.issuer}` : ""}
                {item.date ? ` (${item.date})` : ""}
              </Text>
            ))}
          </View>
        );

      case "awards":
        if (awardRows.length === 0) return null;
        return (
          <View key="awards" style={styles.section}>
            <Text style={styles.heading}>Honors & Awards</Text>
            {awardRows.map((item) => (
              <Text key={item.title} style={{ marginBottom: 3 }}>
                {item.title}
                {item.issuer ? ` — ${item.issuer}` : ""}
                {item.date ? ` (${item.date})` : ""}
                {item.description ? `. ${item.description}` : ""}
              </Text>
            ))}
          </View>
        );

      case "interests":
        if (interestRows.length === 0) return null;
        return (
          <View key="interests" style={styles.section}>
            <Text style={styles.heading}>Interests</Text>
            <Text>{interestRows.join(", ")}</Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.name}>{displayName}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={INVERTED_LOGO_PATH} style={styles.brandMark} />
        </View>
        {contact ? <Text style={styles.contact}>{contact}</Text> : null}
        {effectiveOrder.map((sectionKey) => renderSection(sectionKey))}
      </Page>
    </Document>
  );
}

/**
 * Renders an ATS-friendly single-page resume PDF as a Buffer.
 */
export async function generateTailoredResumePdf(
  profile: MasterProfileInput,
  experiences: WorkExperienceInput[],
  projects?: ProjectInput[],
  tailoredSummary?: string | null,
  tailoredSkills?: MasterProfileInput["skills"] | null,
  includeSummary?: boolean,
  overrides?: {
    headerName?: string | null;
    contactLine?: string | null;
    education?: MasterProfileInput["education"] | null;
    skillGroups?: SkillGroup[] | null;
    certifications?: MasterProfileInput["certifications"] | null;
    awards?: MasterProfileInput["awards"] | null;
    interests?: MasterProfileInput["interests"] | null;
    sectionOrder?: string[] | null;
    disabledSections?: string[] | null;
  }
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <ResumeDocument
      profile={profile}
      experiences={experiences}
      projects={projects}
      tailoredSummary={tailoredSummary}
      tailoredSkills={tailoredSkills}
      includeSummary={includeSummary}
      headerName={overrides?.headerName}
      contactLine={overrides?.contactLine}
      education={overrides?.education}
      skillGroups={overrides?.skillGroups}
      certifications={overrides?.certifications}
      awards={overrides?.awards}
      interests={overrides?.interests}
      sectionOrder={overrides?.sectionOrder}
      disabledSections={overrides?.disabledSections}
    />
  );
  return Buffer.from(buffer);
}
