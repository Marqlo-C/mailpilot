import { describe, expect, it } from "vitest";

import { buildReplySubject } from "@/lib/tailor/email";

describe("buildReplySubject", () => {
  it("prefixes inbound subject with a single Re:", () => {
    expect(
      buildReplySubject({
        inboundSubject: "Fifth Line - Operations Manager / Engineer opportunity",
        roleLabel: "Operations Manager / Engineer",
        companyName: "FIFTHLINE",
      })
    ).toBe("Re: Fifth Line - Operations Manager / Engineer opportunity");
  });

  it("strips stacked Re:/Fwd: prefixes before re-adding Re:", () => {
    expect(
      buildReplySubject({
        inboundSubject: "Re: Re: Fwd: Hello there",
        companyName: "Acme",
      })
    ).toBe("Re: Hello there");
  });

  it("falls back to role at company when inbound subject is missing", () => {
    expect(
      buildReplySubject({
        inboundSubject: null,
        roleLabel: "Operations Manager / Engineer",
        companyName: "FIFTHLINE",
      })
    ).toBe("Re: Operations Manager / Engineer at FIFTHLINE");
  });

  it("falls back to generic role label when both subject and role are missing", () => {
    expect(
      buildReplySubject({
        inboundSubject: "   ",
        roleLabel: null,
        companyName: "Acme",
      })
    ).toBe("Re: role at Acme");
  });
});
