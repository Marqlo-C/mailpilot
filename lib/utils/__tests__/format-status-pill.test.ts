import { describe, expect, it } from "vitest";
import { formatStatusPillTitle } from "../format";

describe("formatStatusPillTitle", () => {
  it("capitalizes simple nouns and counts", () => {
    expect(formatStatusPillTitle("4 accounts")).toBe("4 Accounts");
    expect(formatStatusPillTitle("1 role")).toBe("1 Role");
    expect(formatStatusPillTitle("2 activities")).toBe("2 Activities");
    expect(formatStatusPillTitle("3 projects")).toBe("3 Projects");
    expect(formatStatusPillTitle("4 tools")).toBe("4 Tools");
    expect(formatStatusPillTitle("1 credential")).toBe("1 Credential");
    expect(formatStatusPillTitle("2 certificates")).toBe("2 Certificates");
    expect(formatStatusPillTitle("3 awards")).toBe("3 Awards");
    expect(formatStatusPillTitle("4 interests")).toBe("4 Interests");
  });

  it("keeps minor words lowercase like 'of', 'and', 'etc.' unless leading", () => {
    expect(formatStatusPillTitle("5 of 6 linked")).toBe("5 of 6 Linked");
    expect(formatStatusPillTitle("skills and core competencies etc.")).toBe(
      "Skills and Core Competencies etc."
    );
    expect(formatStatusPillTitle("managed by AI")).toBe("Managed by AI");
    expect(formatStatusPillTitle("director of engineering")).toBe(
      "Director of Engineering"
    );
  });

  it("capitalizes minor words if they are the leading word", () => {
    expect(formatStatusPillTitle("in progress")).toBe("In Progress");
    expect(formatStatusPillTitle("for review")).toBe("For Review");
  });

  it("handles empty or falsy inputs gracefully", () => {
    expect(formatStatusPillTitle("")).toBe("");
  });
});
