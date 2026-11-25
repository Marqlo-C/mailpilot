import { describe, expect, it } from "vitest";

import {
  buildMimeMessage,
  htmlToPlainEmail,
  looksLikeEmailHtml,
  normalizeEmailBodyParts,
  plainToEmailHtml,
  sanitizeEmailHtml,
} from "@/lib/opportunities/dispatch";

describe("email-body-html", () => {
  it("detects markup vs plain", () => {
    expect(looksLikeEmailHtml("<p>Hi</p>")).toBe(true);
    expect(looksLikeEmailHtml("Hi Alex")).toBe(false);
  });

  it("wraps plain paragraphs and preserves line breaks", () => {
    const html = plainToEmailHtml("Hello Alex,\n\nThanks for reaching out.\nBest");
    expect(html).toContain("<p>Hello Alex,</p>");
    expect(html).toContain("<p>Thanks for reaching out.<br>Best</p>");
  });

  it("strips marks to plain for Ace / text MIME", () => {
    const plain = htmlToPlainEmail(
      '<p style="text-align: center"><strong>Hi</strong> <em>there</em></p><p>Next</p>'
    );
    expect(plain).toBe("Hi there\n\nNext");
  });

  it("allowlists tags, text-align, and palette colors only", () => {
    const dirty =
      '<p style="text-align: right" onclick="alert(1)"><script>x</script><strong>Hi</strong><u>line</u><span style="color: #1d4ed8; background-color: #fef08a">mark</span><span style="color: #ff00ff">bad</span><mark data-color="#bbf7d0" style="background-color: #bbf7d0">hi</mark><a href="https://evil">x</a></p>';
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).toContain('style="text-align: right"');
    expect(clean).toContain("<strong>Hi</strong>");
    expect(clean).toContain("<u>line</u>");
    expect(clean).toContain("color: #1d4ed8");
    expect(clean).toContain("background-color: #fef08a");
    expect(clean).toContain('data-color="#bbf7d0"');
    expect(clean).not.toContain("#ff00ff");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("<a ");
  });

  it("normalizeEmailBodyParts round-trips plain and html", () => {
    const fromPlain = normalizeEmailBodyParts("Hello\n\nWorld");
    expect(fromPlain.plain).toBe("Hello\n\nWorld");
    expect(fromPlain.html).toContain("<p>Hello</p>");
    expect(fromPlain.html).toContain("<p>World</p>");

    const fromHtml = normalizeEmailBodyParts(
      "<p><strong>Hello</strong></p><p>World</p>"
    );
    expect(fromHtml.plain).toBe("Hello\n\nWorld");
    expect(fromHtml.html).toContain("<strong>Hello</strong>");
  });
});

describe("buildMimeMessage multipart/alternative", () => {
  it("emits plain then html without attachments", () => {
    const raw = buildMimeMessage({
      from: "me@example.com",
      to: "you@example.com",
      subject: "Hello",
      body: "<p><strong>Hi</strong> there</p>",
      attachments: [],
    });

    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(raw).toContain("Hi there");
    expect(raw).toContain("<strong>Hi</strong>");

    const plainIdx = raw.indexOf("text/plain");
    const htmlIdx = raw.indexOf("text/html");
    expect(plainIdx).toBeGreaterThan(-1);
    expect(htmlIdx).toBeGreaterThan(plainIdx);
  });

  it("nests alternative inside mixed when attachments present", () => {
    const raw = buildMimeMessage({
      from: "me@example.com",
      to: "you@example.com",
      subject: "Hello",
      body: "Plain body",
      attachments: [
        {
          filename: "resume.pdf",
          contentType: "application/pdf",
          content: Buffer.from("%PDF-fake"),
        },
      ],
    });

    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain('Content-Disposition: attachment; filename="resume.pdf"');
    expect(raw).toContain("application/pdf");
  });
});
