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
import { cleanDisplayUrl, dedupeContactItems } from "@/lib/utils/format";

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
  const linkUrls = (profile.links ?? []).map((link) => link.url);
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

function formatInlineSkills(skills: MasterProfileInput["skills"]): string {
  const groups: Array<[string, string[]]> = [
    ["Languages", skills.languages],
    ["Frameworks", skills.frameworks],
    ["Tools", skills.tools],
    ["Concepts", skills.concepts],
  ];
  return groups
    .map(([label, items]) => {
      const values = items.map((item) => item.trim()).filter(Boolean);
      return values.length > 0 ? `${label}: ${values.join(", ")}` : "";
    })
    .filter(Boolean)
    .join(" • ");
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
}: PdfInput) {
  const contact = contactLine?.trim() || buildResumeContactLine(profile);
  const displayName = headerName?.trim() || profile.fullName;
  const educationRows = education ?? profile.education;

  const showSummary =
    includeSummary !== false &&
    Boolean((tailoredSummary ?? profile.summary)?.trim());
  const activeSkills = tailoredSkills;
  const skillSource =
    activeSkills &&
    [
      ...activeSkills.languages,
      ...activeSkills.frameworks,
      ...activeSkills.tools,
      ...activeSkills.concepts,
    ].some(Boolean)
      ? activeSkills
      : profile.skills;
  const skills = formatInlineSkills(skillSource);

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

        {skills ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Skills</Text>
            <Text style={styles.skills}>{skills}</Text>
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
              const degreeText =
                ed.fieldOfStudy &&
                !ed.degree.toLowerCase().includes(ed.fieldOfStudy.toLowerCase())
                  ? `${ed.degree} in ${ed.fieldOfStudy}`
                  : ed.degree;
              return (
                <Text
                  key={`${ed.institution}-${ed.degree}`}
                  style={{ marginBottom: 3 }}
                >
                  {ed.institution
                    ? `${degreeText} — ${ed.institution}${
                        ed.graduationDate ? ` (${ed.graduationDate})` : ""
                      }`
                    : ed.degree}
                </Text>
              );
            })}
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
    />
  );
  return Buffer.from(buffer);
}
