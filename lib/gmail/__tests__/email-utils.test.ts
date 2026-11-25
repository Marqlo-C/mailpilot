import { describe, expect, it } from "vitest";

import {
  cleanRecruiterFirstName,
  parseFromHeader,
} from "@/lib/gmail/email-utils";

describe("parseFromHeader", () => {
  it("parses Name <email> headers", () => {
    expect(parseFromHeader('Alex <alex@fifthline.ai>')).toEqual({
      name: "Alex",
      email: "alex@fifthline.ai",
    });
  });

  it("parses bare email headers", () => {
    expect(parseFromHeader("alex@fifthline.ai")).toEqual({
      name: null,
      email: "alex@fifthline.ai",
    });
  });
});

describe("cleanRecruiterFirstName", () => {
  it("uses bare person-like local-part when From display is missing (Fifth Line)", () => {
    expect(
      cleanRecruiterFirstName(null, "alex@fifthline.ai", null)
    ).toBe("Alex");
  });

  it("uses From display name even when it matches the local-part", () => {
    expect(
      cleanRecruiterFirstName("Alex", "alex@fifthline.ai", null)
    ).toBe("Alex");
  });

  it("returns null for generic mailbox even when body has a sign-off", () => {
    expect(
      cleanRecruiterFirstName(
        null,
        "jobs@company.com",
        "Thanks for applying.\n\nBest,\nAlex Smith\n"
      )
    ).toBeNull();
  });

  it("returns null for recruiting@ generic mailbox with a sign-off", () => {
    expect(
      cleanRecruiterFirstName(
        null,
        "recruiting@acme.com",
        "Regards,\nAlex\n"
      )
    ).toBeNull();
  });

  it("returns null for talent@ with a team-style From display", () => {
    expect(
      cleanRecruiterFirstName(
        "Acme Talent Team",
        "talent@acme.com",
        null
      )
    ).toBeNull();
  });

  it("extracts first name from dotted local-part", () => {
    expect(cleanRecruiterFirstName(null, "jane.doe@acme.com", null)).toBe(
      "Jane"
    );
  });

  it("prefers sign-off over a bad From display name", () => {
    expect(
      cleanRecruiterFirstName(
        "Company Recruiting",
        "priya@acme.com",
        "Looking forward to chatting.\n\nRegards,\nPriya\n"
      )
    ).toBe("Priya");
  });

  it("rejects digit-y handle locals", () => {
    expect(cleanRecruiterFirstName(null, "qtrain3@acme.com", null)).toBeNull();
  });
});
