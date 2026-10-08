import JSZip from "jszip";

import { activeResumeNodes } from "@/lib/resume-draft";
import { skillCategoryLabel } from "@/lib/skill-groups";
import type {
  ResumeDraftNode,
  TailoredResumeDraft,
} from "@/lib/types/resume-draft";

const SECTION_LABEL: Record<ResumeDraftNode["section"], string | null> = {
  contact: null,
  summary: "SUMMARY",
  skills: "SKILLS",
  experience: "EXPERIENCE",
  projects: "PROJECTS",
  education: "EDUCATION",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function run(text: string, options: { bold?: boolean; size?: number; color?: string } = {}): string {
  const size = options.size ?? 20;
  const props = [
    options.bold ? "<w:b/>" : "",
    `<w:sz w:val="${size}"/>`,
    `<w:szCs w:val="${size}"/>`,
    options.color ? `<w:color w:val="${options.color}"/>` : "",
    `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>`,
  ].join("");
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function spacing(before = 40, after = 40): string {
  return `<w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>`;
}

function sectionHeading(label: string): string {
  return `<w:p>
    <w:pPr>
      ${spacing(80, 40)}
      <w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="D1D5DB"/></w:pBdr>
    </w:pPr>
    ${run(label, { bold: true, size: 22 })}
  </w:p>`;
}

function bodyParagraph(runsXml: string, before = 0, after = 40): string {
  return `<w:p><w:pPr>${spacing(before, after)}</w:pPr>${runsXml}</w:p>`;
}

function bulletParagraph(text: string): string {
  return `<w:p>
    <w:pPr>
      <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
      ${spacing(0, 40)}
    </w:pPr>
    ${run(text)}
  </w:p>`;
}

function roleParagraph(title: string, trailing: string | null): string {
  const date = trailing
    ? `<w:r><w:tab/></w:r>${run(trailing, { size: 18, color: "4B5563" })}`
    : "";
  return `<w:p>
    <w:pPr>
      <w:tabs><w:tab w:val="right" w:pos="10080"/></w:tabs>
      ${spacing(40, 20)}
    </w:pPr>
    ${run(title, { bold: true })}${date}
  </w:p>`;
}

function datesFor(node: ResumeDraftNode): string | null {
  if (node.type !== "experience_header") return null;
  const start =
    typeof node.metadata?.startDate === "string" ? node.metadata.startDate : "";
  if (!start) return null;
  const end =
    typeof node.metadata?.endDate === "string" && node.metadata.endDate
      ? node.metadata.endDate
      : "Present";
  return `${start} – ${end}`;
}

function skillLine(groups: ResumeDraftNode[]): string {
  const runs: string[] = [];
  groups.forEach((group) => {
    const itemsString = group.content.trim();
    if (!itemsString) return;
    const categoryLabel = skillCategoryLabel(group);
    if (runs.length > 0) runs.push(run(" • "));
    if (categoryLabel) runs.push(run(`${categoryLabel}: `, { bold: true }));
    runs.push(run(itemsString, { bold: false }));
  });
  return bodyParagraph(runs.join("") || run(""));
}

/** Styled OOXML resume built from checked draft nodes. */
export async function compileResumeDocx(
  draft: TailoredResumeDraft
): Promise<Buffer> {
  const active = activeResumeNodes(draft);
  const body: string[] = [];
  let lastSection: ResumeDraftNode["section"] | null = null;

  const pushHeading = (section: ResumeDraftNode["section"]) => {
    const label = SECTION_LABEL[section];
    if (!label || section === lastSection) return;
    body.push(sectionHeading(label));
    lastSection = section;
  };

  for (let index = 0; index < active.length; index += 1) {
    const item = active[index];
    if (item.type === "header") {
      body.push(
        `<w:p><w:pPr>${spacing(0, 40)}</w:pPr>${run(item.content, {
          bold: true,
          size: 36,
        })}</w:p>`
      );
      const contact =
        typeof item.metadata?.contactLine === "string"
          ? item.metadata.contactLine.trim()
          : "";
      if (contact) {
        body.push(
          `<w:p><w:pPr>${spacing(0, 80)}</w:pPr>${run(contact, {
            size: 18,
            color: "374151",
          })}</w:p>`
        );
      }
      continue;
    }

    if (item.type === "skill_group") {
      const groups = [item];
      while (active[index + 1]?.type === "skill_group") {
        index += 1;
        groups.push(active[index]);
      }
      pushHeading("skills");
      body.push(skillLine(groups));
      continue;
    }

    pushHeading(item.section);

    if (item.type === "experience_header" || item.type === "project_header") {
      const technologies = Array.isArray(item.metadata?.technologies)
        ? item.metadata.technologies.filter(
            (value): value is string => typeof value === "string"
          )
        : [];
      const trailing =
        item.type === "experience_header"
          ? datesFor(item)
          : technologies.slice(0, 4).join(", ") || null;
      body.push(roleParagraph(item.content, trailing));
      continue;
    }

    if (item.type === "experience_bullet" || item.type === "project_bullet") {
      body.push(bulletParagraph(item.content));
      continue;
    }

      body.push(bodyParagraph(run(item.content)));
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body.join("")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="1080" w:bottom="720" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
      <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="360" w:hanging="180"/>
        <w:spacing w:before="0" w:after="40" w:line="240" w:lineRule="auto"/>
      </w:pPr>
      <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );
  zip.file("word/document.xml", documentXml);
  zip.file("word/numbering.xml", numberingXml);
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>
    </w:pPr>
  </w:style>
</w:styles>`
  );
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(bytes);
}
