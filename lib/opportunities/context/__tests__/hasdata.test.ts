import { describe, expect, it, vi } from "vitest";
import { fetchViaHasData } from "../hasdata";

vi.mock("@/lib/core/ssrf", () => ({
  assertSafeHttpsUrl: vi.fn(async (url: string) => new URL(url)),
}));

describe("fetchViaHasData", () => {
  it("returns error if apiKey or url is missing", async () => {
    const res1 = await fetchViaHasData("", "test-key");
    expect(res1.data).toBeNull();
    expect(res1.errorMsg).toContain("Missing API key or URL");

    const res2 = await fetchViaHasData("https://glassdoor.com/job", "");
    expect(res2.data).toBeNull();
    expect(res2.errorMsg).toContain("Missing API key or URL");
  });

  it("returns error if platform cannot be resolved and is unsupported", async () => {
    const res = await fetchViaHasData("https://example.com/job", "test-key");
    expect(res.data).toBeNull();
    expect(res.errorMsg).toContain("Unsupported platform");
  });

  it("normalizes Glassdoor job response with structured qualifications and responsibilities", async () => {
    const glassdoorPayload = {
      job: {
        title: "Senior Engineering Manager",
        employer: {
          name: "Acme Corp",
        },
        address: {
          city: "Austin",
          region: "TX",
        },
        salary: {
          min: 175000,
          max: 225000,
          period: "yr",
        },
        description: "<p>Lead our core infrastructure and systems reliability group.</p>",
        responsibilities: [
          "Mentor and grow senior technical talent",
          "Oversee operational resilience and incident post-mortems",
        ],
        qualifications: [
          "7+ years engineering leadership experience",
          "Track record scaling distributed platforms",
        ],
        applyUrl: "https://www.glassdoor.com/partner/jobListing.htm?jl=123",
        datePosted: "2026-10-10",
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(glassdoorPayload),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchViaHasData(
      "https://www.glassdoor.com/job-listing/?jl=123",
      "test_hd_key_999"
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("api.hasdata.com/scrape/glassdoor/job");
    expect(mockFetch.mock.calls[0][1].headers["x-api-key"]).toBe("test_hd_key_999");

    expect(result.data).not.toBeNull();
    expect(result.data?.title).toBe("Senior Engineering Manager");
    expect(result.data?.company).toBe("Acme Corp");
    expect(result.data?.location).toBe("Austin, TX");
    expect(result.data?.salary).toBe("$175000 - $225000 / yr");
    expect(result.data?.description).toContain("Lead our core infrastructure and systems reliability group.");
    expect(result.data?.description).toContain("Responsibilities:\n• Mentor and grow senior technical talent");
    expect(result.data?.description).toContain("Qualifications:\n• 7+ years engineering leadership experience");
    expect(result.data?.applyUrl).toBe("https://www.glassdoor.com/partner/jobListing.htm?jl=123");
    expect(result.data?.datePosted).toBe("2026-10-10");

    vi.unstubAllGlobals();
  });

  it("normalizes Indeed job response with company object and salary text", async () => {
    const indeedPayload = {
      title: "Lead Systems Architect",
      company: {
        name: "Globex",
      },
      location: "Remote - US",
      salary: {
        text: "$190,000 - $240,000 a year",
      },
      descriptionHtml: "<div><h3>Role Overview</h3><p>Design multi-region cloud topology.</p></div>",
      requirements: [
        "Deep knowledge of distributed event brokers",
        "Expertise in cross-region network topologies",
      ],
      url: "https://www.indeed.com/viewjob?jk=abc",
      postedAt: "Just posted",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(indeedPayload),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchViaHasData(
      "https://www.indeed.com/viewjob?jk=abc",
      "test_hd_key_indeed",
      "indeed"
    );

    expect(result.data).not.toBeNull();
    expect(result.data?.title).toBe("Lead Systems Architect");
    expect(result.data?.company).toBe("Globex");
    expect(result.data?.location).toBe("Remote - US");
    expect(result.data?.salary).toBe("$190,000 - $240,000 a year");
    expect(result.data?.description).toContain("Role Overview Design multi-region cloud topology.");
    expect(result.data?.description).toContain("Requirements:\n• Deep knowledge of distributed event brokers");
    expect(result.data?.applyUrl).toBe("https://www.indeed.com/viewjob?jk=abc");
    expect(result.data?.datePosted).toBe("Just posted");

    vi.unstubAllGlobals();
  });

  it("handles non-OK HTTP status from HasData gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchViaHasData(
      "https://www.glassdoor.com/job-listing/?jl=123",
      "bad_key"
    );

    expect(result.data).toBeNull();
    expect(result.status).toBe(401);

    vi.unstubAllGlobals();
  });

  it("handles AbortError timeout cleanly", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchViaHasData(
      "https://www.glassdoor.com/job-listing/?jl=123",
      "test_key",
      "glassdoor",
      2000
    );

    expect(result.data).toBeNull();
    expect(result.errorMsg).toContain("Timeout > 2000ms");

    vi.unstubAllGlobals();
  });
});
