import { describe, it, expect } from "vitest";
import {
  htmlToStructuredMarkdown,
  decodeHtmlEntities,
} from "../html-markdown";

describe("HTML to Structured Markdown", () => {
  describe("decodeHtmlEntities", () => {
    it("decodes named HTML entities", () => {
      const raw = "AT&amp;T &quot;Lead&quot; &amp; Engineer &bull; $100&nbsp;k";
      expect(decodeHtmlEntities(raw)).toBe('AT&T "Lead" & Engineer • $100 k');
    });

    it("decodes numeric decimal and hex entities", () => {
      const raw = "&#39;Hello&#39; &#x2F; world";
      expect(decodeHtmlEntities(raw)).toBe("'Hello' / world");
    });

    it("handles strings with no entities unchanged", () => {
      expect(decodeHtmlEntities("Plain text without entities")).toBe(
        "Plain text without entities"
      );
    });
  });

  describe("htmlToStructuredMarkdown", () => {
    it("converts headings into standard markdown hashes", () => {
      const html = "<h1>Title</h1><p>Intro</p><h2>Subtitle</h2><p>Details</p><h3>Section</h3>";
      const md = htmlToStructuredMarkdown(html);
      expect(md).toContain("# Title");
      expect(md).toContain("## Subtitle");
      expect(md).toContain("### Section");
    });

    it("promotes bold paragraph labels to markdown headings", () => {
      const html = "<p><b>Qualifications</b></p><p>5 years experience required.</p>";
      const md = htmlToStructuredMarkdown(html);
      expect(md).toContain("### Qualifications");
      expect(md).toContain("5 years experience required.");
    });

    it("converts list items into markdown bullet points", () => {
      const html = `
        <ul>
          <li>Collaborate across distributed disciplines</li>
          <li>Design and maintain high-reliability workflows</li>
        </ul>
      `;
      const md = htmlToStructuredMarkdown(html);
      expect(md).toContain("- Collaborate across distributed disciplines");
      expect(md).toContain("- Design and maintain high-reliability workflows");
    });

    it("strips scripts, styles, svgs, and html comments", () => {
      const html = `
        <script>alert('xss')</script>
        <style>.job { color: red; }</style>
        <svg><path d="M0 0"/></svg>
        <!-- hidden comment -->
        <p>Legitimate job content description.</p>
      `;
      const md = htmlToStructuredMarkdown(html);
      expect(md).not.toContain("alert");
      expect(md).not.toContain("color: red");
      expect(md).not.toContain("hidden comment");
      expect(md).toContain("Legitimate job content description.");
    });

    it("preserves paragraphs with clean double newlines", () => {
      const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
      const md = htmlToStructuredMarkdown(html);
      expect(md).toBe("First paragraph.\n\nSecond paragraph.");
    });

    it("converts Skyeton HTML cleanly without orphaned ** or stray ###", () => {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join(process.cwd(), "Test HTML/Skyeton hiring Software Engineer Job in Fayetteville, NC ｜ Glassdoor (11_5_2026 5：09：33 PM).html");
      const html = fs.readFileSync(filePath, "utf-8");
      const md = htmlToStructuredMarkdown(html);
      expect(md).not.toMatch(/(?:^|\n)\*\*\s*(?:\n|$)/);
      expect(md).not.toMatch(/(?:^|\n)###\s*(?:\n|$)/);
      expect(md).not.toContain("Company Culture**");
      expect(md).not.toContain("About the role**");
    });
  });
});
