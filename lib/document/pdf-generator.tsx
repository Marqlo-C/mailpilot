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
  Link,
} from "@react-pdf/renderer";

// Disable automatic mid-word hyphenation splitting across lines globally
Font.registerHyphenationCallback((word) => [word]);

const CALIBRI_REGULAR = path.join(process.cwd(), "public/fonts/Calibri.ttf");
const CALIBRI_BOLD = path.join(process.cwd(), "public/fonts/Calibri-Bold.ttf");

try {
  Font.register({
    family: "Calibri",
    fonts: [
      { src: CALIBRI_REGULAR, fontWeight: "normal" },
      { src: CALIBRI_BOLD, fontWeight: "bold" },
    ],
  });
} catch {
  // Graceful fallback to default system font
}

import type {
  MasterProfileInput,
  ProjectInput,
  WorkExperienceInput,
} from "@/lib/validations/profile";
import { skillGroupsFromUnknown } from "@/lib/profile/skill-groups";
import type { SkillGroup } from "@/lib/resume-draft";
import {
  RESUME_FONTS,
  RESUME_SPACING,
  RESUME_TYPOGRAPHY,
} from "@/lib/resume-draft/layout.ssot";
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
  getExperienceHeadingParts,
  parseContactHeaderItems,
  sanitizeResumeContactLine,
} from "@/lib/utils/format";
import { categorizeProfileUrl, isResumeHeaderLink } from "@/lib/utils/url";

export { buildResumeContactLine, sanitizeResumeContactLine };

/** @deprecated Prefer cleanDisplayUrl from @/lib/utils/format */
export const cleanContactUrl = cleanDisplayUrl;

const styles = StyleSheet.create({
  page: {
    paddingTop: RESUME_SPACING.pagePaddingTop.pt,
    paddingBottom: RESUME_SPACING.pagePaddingBottom.pt,
    paddingHorizontal: RESUME_SPACING.pagePaddingHorizontal.pt,
    fontSize: RESUME_TYPOGRAPHY.body.pt,
    fontFamily: RESUME_FONTS.primary,
    color: "#111827",
  },
  headerRow: {
    marginBottom: RESUME_SPACING.nameToContact.pt,
    alignItems: "center",
    width: "100%",
  },
  name: {
    fontSize: RESUME_TYPOGRAPHY.name.pt,
    fontFamily: RESUME_FONTS.primary,
    fontWeight: "bold",
    marginBottom: RESUME_SPACING.nameToContact.pt,
    textAlign: "center",
    width: "100%",
  },
  contact: {
    fontSize: RESUME_TYPOGRAPHY.contact.pt,
    fontFamily: RESUME_FONTS.primary,
    color: "#374151",
    marginBottom: RESUME_SPACING.contactToFirstSection.pt,
    textAlign: "center",
    width: "100%",
  },
  contactLink: {
    color: "#1F2937",
    textDecoration: "none",
  },
  contactSeparator: {
    color: "#9CA3AF",
  },
  summary: {
    fontSize: RESUME_TYPOGRAPHY.summary.pt,
    fontFamily: RESUME_FONTS.primary,
    lineHeight: RESUME_TYPOGRAPHY.summary.lineHeight,
    color: "#111827",
  },
  section: {
    marginTop: RESUME_SPACING.sectionBefore.pt,
  },
  heading: {
    fontSize: RESUME_TYPOGRAPHY.heading.pt,
    fontFamily: RESUME_FONTS.primary,
    fontWeight: "bold",
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    paddingBottom: 2,
    marginBottom: RESUME_SPACING.sectionHeadingBottom.pt,
  },
  roleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: RESUME_SPACING.roleTitleToFirstBullet.pt,
  },
  roleTitle: {
    fontFamily: RESUME_FONTS.primary,
    fontSize: RESUME_TYPOGRAPHY.roleTitle.pt,
    flex: 1,
    marginRight: RESUME_SPACING.roleTitleToTrailingGap.pt,
  },
  roleTitleBold: {
    fontFamily: RESUME_FONTS.primary,
    fontWeight: "bold",
    color: "#111827",
  },
  roleCompanyLocation: {
    fontFamily: RESUME_FONTS.primary,
    fontWeight: "normal",
    color: "#4B5563",
  },
  roleSeparator: {
    fontFamily: RESUME_FONTS.primary,
    fontWeight: "normal",
    color: "#9CA3AF",
  },
  educationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  educationTitle: {
    fontFamily: RESUME_FONTS.primary,
    fontSize: RESUME_TYPOGRAPHY.educationTitle.pt,
    lineHeight: RESUME_TYPOGRAPHY.educationTitle.lineHeight,
    flex: 1,
    marginRight: RESUME_SPACING.roleTitleToTrailingGap.pt,
  },
  bodyItem: {
    fontFamily: RESUME_FONTS.primary,
    fontSize: RESUME_TYPOGRAPHY.body.pt,
    lineHeight: RESUME_TYPOGRAPHY.body.lineHeight,
  },
  muted: {
    fontFamily: RESUME_FONTS.primary,
    color: "#4B5563",
    fontSize: RESUME_TYPOGRAPHY.muted.pt,
    textAlign: "right",
    flexShrink: 0,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginLeft: RESUME_SPACING.bulletMarginLeft.pt,
    marginBottom: RESUME_SPACING.bulletSpacing.pt,
  },
  bulletMarker: {
    fontFamily: RESUME_FONTS.primary,
    width: RESUME_SPACING.bulletMarkerWidth.pt,
    fontSize: RESUME_TYPOGRAPHY.bullet.pt,
    lineHeight: RESUME_TYPOGRAPHY.bullet.lineHeight,
  },
  bulletContent: {
    fontFamily: RESUME_FONTS.primary,
    flex: 1,
    fontSize: RESUME_TYPOGRAPHY.bullet.pt,
    lineHeight: RESUME_TYPOGRAPHY.bullet.lineHeight,
  },
  bullet: {
    marginLeft: 8,
    marginBottom: RESUME_SPACING.bulletSpacing.pt,
    maxWidth: "95%",
  },
  skills: {
    fontFamily: RESUME_FONTS.primary,
    fontSize: RESUME_TYPOGRAPHY.skills.pt,
    lineHeight: RESUME_TYPOGRAPHY.skills.lineHeight,
  },
  skillLabel: {
    fontFamily: RESUME_FONTS.primary,
    fontWeight: "bold",
    fontSize: RESUME_TYPOGRAPHY.skills.pt,
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
  includeVariants?: boolean;
};



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
  includeVariants = false,
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

  const renderSection = (key: string, isFirstSection = false) => {
    const sectionStyle = [styles.section, isFirstSection ? { marginTop: 0 } : undefined];
    switch (key) {
      case "summary":
        if (!showSummary) return null;
        return (
          <View key="summary" style={sectionStyle}>
            <Text style={styles.heading}>Summary</Text>
            <Text style={styles.summary}>{tailoredSummary || profile.summary}</Text>
          </View>
        );

      case "skills":
        if (renderedGroups.length === 0) return null;
        return (
          <View key="skills" style={sectionStyle}>
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
          <View key="experience" style={sectionStyle}>
            <Text style={styles.heading}>Experience</Text>
            {experiences.map((exp, expIdx) => {
              const isLastExp = expIdx === experiences.length - 1;
              const headingParts = getExperienceHeadingParts(exp.role, exp.company, exp.location);
              return (
                <View
                  key={`${exp.company}-${exp.role}`}
                  wrap={false}
                  style={{ marginBottom: isLastExp ? 0 : RESUME_SPACING.roleToRole.pt }}
                >
                  <View style={styles.roleHeader}>
                    <Text style={styles.roleTitle}>
                      <Text style={styles.roleTitleBold}>{headingParts.role}</Text>
                      {headingParts.company ? (
                        <>
                          <Text style={styles.roleSeparator}>{" | "}</Text>
                          <Text style={styles.roleCompanyLocation}>{headingParts.company}</Text>
                        </>
                      ) : null}
                      {headingParts.location ? (
                        <>
                          <Text style={styles.roleSeparator}>{" | "}</Text>
                          <Text style={styles.roleCompanyLocation}>{headingParts.location}</Text>
                        </>
                      ) : null}
                    </Text>
                    <Text style={styles.muted}>
                      {exp.startDate} – {exp.endDate ?? "Present"}
                    </Text>
                  </View>
                  {exp.bullets.map((b, bIdx) => (
                    <View
                      key={b.id}
                      style={[
                        styles.bulletRow,
                        bIdx === exp.bullets.length - 1 ? { marginBottom: 0 } : undefined,
                      ]}
                    >
                      <Text style={styles.bulletMarker}>•</Text>
                      <Text style={styles.bulletContent}>{b.rawText}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );

      case "projects":
        if (!projects || projects.length === 0) return null;
        return (
          <View key="projects" style={sectionStyle}>
            <Text style={styles.heading}>Projects</Text>
            {projects.map((proj, projIdx) => {
              const isLastProj = projIdx === projects.length - 1;
              const variantBullets =
                includeVariants && proj.variants
                  ? proj.variants
                      .map((v) => v.text)
                      .filter(
                        (t) =>
                          typeof t === "string" &&
                          t.trim().length > 0 &&
                          !proj.bullets.includes(t)
                      )
                  : [];

              const displayBullets =
                proj.bullets.length > 0 || variantBullets.length > 0
                  ? [...proj.bullets, ...variantBullets]
                  : proj.description?.trim()
                    ? [proj.description.trim()]
                    : [];

              return (
                <View
                  key={proj.name}
                  wrap={false}
                  style={{ marginBottom: isLastProj ? 0 : RESUME_SPACING.roleToRole.pt }}
                >
                  <View style={styles.roleHeader}>
                    <Text style={styles.roleTitle}>
                      <Text style={{ fontFamily: RESUME_FONTS.primary, fontWeight: "bold" }}>{proj.name}</Text>
                    </Text>
                    {proj.technologies.length > 0 ? (
                      <Text style={styles.muted}>
                        {proj.technologies.slice(0, 4).join(", ")}
                      </Text>
                    ) : null}
                  </View>
                  {displayBullets.map((bullet, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.bulletRow,
                        idx === displayBullets.length - 1 ? { marginBottom: 0 } : undefined,
                      ]}
                    >
                      <Text style={styles.bulletMarker}>•</Text>
                      <Text style={styles.bulletContent}>{bullet}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );

      case "education":
        if (educationRows.length === 0) return null;
        return (
          <View key="education" style={sectionStyle}>
            <Text style={styles.heading}>Education</Text>
            {educationRows.map((ed, edIdx) => {
              const degreeText = formatEducationTitle(ed.degree, ed.fieldOfStudy);
              const school = formatSchoolName(ed.institution, ed.subSchool);
              const dates = formatEducationDates(ed);
              const isLastEd = edIdx === educationRows.length - 1;
              return (
                <View
                  key={`${ed.institution}-${ed.subSchool ?? ""}-${ed.degree}`}
                  wrap={false}
                  style={[
                    styles.educationRow,
                    { marginBottom: isLastEd ? 0 : RESUME_SPACING.degreeToDegree.pt },
                  ]}
                >
                  <Text style={styles.educationTitle}>
                    {degreeText ? (
                      <Text style={{ fontFamily: RESUME_FONTS.primary, fontWeight: "bold" }}>
                        {degreeText}
                      </Text>
                    ) : null}
                    {degreeText && school ? ` — ${school}` : school}
                  </Text>
                  {dates ? <Text style={styles.muted}>{dates}</Text> : null}
                </View>
              );
            })}
          </View>
        );

      case "certifications":
        if (certificationRows.length === 0) return null;
        return (
          <View key="certifications" style={sectionStyle}>
            <Text style={styles.heading}>Certifications & Licenses</Text>
            {certificationRows.map((item, idx) => (
              <Text
                key={item.name}
                style={[
                  styles.bodyItem,
                  { marginBottom: idx === certificationRows.length - 1 ? 0 : RESUME_SPACING.certToCert.pt },
                ]}
              >
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
          <View key="awards" style={sectionStyle}>
            <Text style={styles.heading}>Honors & Awards</Text>
            {awardRows.map((item, idx) => (
              <Text
                key={item.title}
                style={[
                  styles.bodyItem,
                  { marginBottom: idx === awardRows.length - 1 ? 0 : RESUME_SPACING.certToCert.pt },
                ]}
              >
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
        </View>
        {contact ? (
          <Text style={styles.contact}>
            {parseContactHeaderItems(contact).map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 ? (
                  <Text style={styles.contactSeparator}>{" | "}</Text>
                ) : null}
                {item.href ? (
                  <Link src={item.href} style={styles.contactLink}>
                    {item.label}
                  </Link>
                ) : (
                  <Text>{item.label}</Text>
                )}
              </React.Fragment>
            ))}
          </Text>
        ) : null}
        {(() => {
          let hasRenderedFirstSection = false;
          return effectiveOrder.map((sectionKey) => {
            const isFirst = !hasRenderedFirstSection;
            const element = renderSection(sectionKey, isFirst);
            if (element) {
              hasRenderedFirstSection = true;
            }
            return element;
          });
        })()}
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
    includeVariants?: boolean;
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
      includeVariants={overrides?.includeVariants}
    />
  );
  return Buffer.from(buffer);
}
