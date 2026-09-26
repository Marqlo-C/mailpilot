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
  WorkExperienceInput,
} from "@/lib/validations/profile";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
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
};

const INVERTED_LOGO_PATH = path.join(
  process.cwd(),
  "public/logos/transparent-logo.png"
);

function ResumeDocument({ profile, experiences }: PdfInput) {
  const links = profile.links.map((l) => l.url).filter(Boolean).join(" · ");
  const contact = [profile.email, profile.phone, profile.location, links]
    .filter(Boolean)
    .join(" · ");

  const skills = [
    ...profile.skills.languages,
    ...profile.skills.frameworks,
    ...profile.skills.tools,
    ...profile.skills.concepts,
  ].join(", ");

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.name}>{profile.fullName}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={INVERTED_LOGO_PATH} style={styles.brandMark} />
        </View>
        <Text style={styles.contact}>{contact}</Text>

        {profile.summary ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Summary</Text>
            <Text>{profile.summary}</Text>
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
                  {exp.role} · {exp.company}
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

        {profile.education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Education</Text>
            {profile.education.map((ed) => (
              <Text
                key={`${ed.institution}-${ed.degree}`}
                style={{ marginBottom: 3 }}
              >
                {ed.degree}
                {ed.fieldOfStudy ? ` in ${ed.fieldOfStudy}` : ""} —{" "}
                {ed.institution}
                {ed.graduationDate ? ` (${ed.graduationDate})` : ""}
              </Text>
            ))}
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
  experiences: WorkExperienceInput[]
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <ResumeDocument profile={profile} experiences={experiences} />
  );
  return Buffer.from(buffer);
}
