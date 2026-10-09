import React from "react";
import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import type {
  MasterProfileInput,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import { skillGroupsFromUnknown } from "@/lib/skill-groups";
import type { SkillGroup } from "@/lib/types/resume-draft";
import {
  cleanDisplayUrl,
  dedupeContactItems,
  formatEducationTitle,
  formatSchoolName,
} from "@/lib/utils/format";
import { categorizeProfileUrl, isResumeHeaderLink } from "@/lib/utils/url";

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
    marginBottom: 2,
  },
  roleTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  muted: {
    color: "#4B5563",
    fontSize: 9,
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
};

const INVERTED_LOGO_PATH = path.join(
  process.cwd(),
  "public/logos/transparent-logo.png"
);

type ProfileContactExtras = {
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  websiteUrl?: string | null;
  linkedWebsite?: string | null;
  linkedGithub?: string | null;
  linkedLinkedin?: string | null;
};

/**
 * Builds a single contact header line from profile fields.
 * URL-like values are sanitized; duplicates are removed case-insensitively.
 */
export function buildResumeContactLine(profile: MasterProfileInput): string {
  const extras = profile as MasterProfileInput & ProfileContactExtras;
  const linkUrls = (profile.links ?? [])
    .map((link) => link.url)
    .filter((url) => isResumeHeaderLink(url))
    .filter((url) => {
      const kind = categorizeProfileUrl(url);
      return (
        kind === "github" ||
        kind === "linkedin" ||
        kind === "portfolio" ||
        kind === "website"
      );
    });
  const contactElements = dedupeContactItems([
    profile.email,
    profile.phone,
    profile.location,
    cleanDisplayUrl(extras.linkedinUrl ?? extras.linkedLinkedin),
    cleanDisplayUrl(extras.githubUrl ?? extras.linkedGithub),
    cleanDisplayUrl(
      extras.portfolioUrl || extras.websiteUrl || extras.linkedWebsite
    ),
    ...linkUrls.map((url) => cleanDisplayUrl(url)),
  ]);
  return contactElements.join(" • ");
}

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
}: PdfInput) {
  const contact = contactLine?.trim() || buildResumeContactLine(profile);
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

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.name}>{displayName}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={INVERTED_LOGO_PATH} style={styles.brandMark} />
        </View>
        {contact ? <Text style={styles.contact}>{contact}</Text> : null}

        {showSummary ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Summary</Text>
            <Text>{tailoredSummary || profile.summary}</Text>
          </View>
        ) : null}

        {renderedGroups.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Skills</Text>
            <Text style={styles.skills}>
              {renderedGroups.flatMap((group, index) => {
                const items = group.items.join(", ").trim();
                if (!items) return [];
                const label = group.label.trim();
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
        ) : null}

        <View style={styles.section}>
          <Text style={styles.heading}>Experience</Text>
          {experiences.map((exp) => (
            <View key={`${exp.company}-${exp.role}`} style={{ marginBottom: 8 }}>
              <View style={styles.roleHeader}>
                <Text style={styles.roleTitle}>
                  {exp.company.trim() && exp.company !== exp.role
                    ? `${exp.role} · ${exp.company}`
                    : exp.role}
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

        {projects && projects.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Projects</Text>
            {projects.map((proj) => (
              <View key={proj.name} style={{ marginBottom: 6 }}>
                <View style={styles.roleHeader}>
                  <Text style={styles.roleTitle}>
                    {proj.name}
                    {proj.link
                      ? ` · ${cleanDisplayUrl(proj.link) || proj.link}`
                      : ""}
                  </Text>
                  {proj.technologies.length > 0 ? (
                    <Text style={styles.muted}>
                      {proj.technologies.slice(0, 4).join(", ")}
                    </Text>
                  ) : null}
                </View>
                {proj.bullets.map((bullet, idx) => (
                  <Text key={idx} style={styles.bullet}>
                    • {bullet}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {educationRows.length > 0 ? (
          <View style={styles.section}>
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
                  {ed.graduationDate ? `${heading} (${ed.graduationDate})` : heading}
                </Text>
              );
            })}
          </View>
        ) : null}

        {certificationRows.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Certifications & Licenses</Text>
            {certificationRows.map((item) => (
              <Text key={item.name} style={{ marginBottom: 3 }}>
                {item.name}
                {item.issuer ? ` — ${item.issuer}` : ""}
                {item.date ? ` (${item.date})` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        {awardRows.length > 0 ? (
          <View style={styles.section}>
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
        ) : null}

        {interestRows.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Interests</Text>
            <Text>{interestRows.join(", ")}</Text>
          </View>
        ) : null}
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
    />
  );
  return Buffer.from(buffer);
}
