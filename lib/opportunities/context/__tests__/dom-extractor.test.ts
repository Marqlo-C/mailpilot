import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { extractJsonLdJobPosting } from "../json-ld-parser";
import { extractJobFromSemanticDom } from "../dom-extractor";

describe("DOM & Schema.org Extraction on Real HTML Postings", () => {
  const testHtmlDir = path.resolve(process.cwd(), "Test HTML");

  it("extracts unquoted Schema.org JobPosting JSON-LD (Ashby/Agave)", () => {
    const filename = "Full-Stack Software Engineer (New Grad) @ Agave (11_5_2026 5：08：12 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const parsed = extractJsonLdJobPosting(html);

    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("Full-Stack Software Engineer (New Grad)");
    expect(parsed?.company).toBe("Agave");
    expect(parsed?.salary).toBe("$130000 - $160000 / year");
    expect(parsed?.description).toBeDefined();
    expect(parsed?.coreDescription).toBeDefined();
    expect(parsed?.logoUrl).toContain("ashbyhq.com");
  });

  it("extracts unquoted Schema.org JobPosting JSON-LD (Workday/LPN)", () => {
    const filename = "LPN Med Care Manager (11_5_2026 5：16：40 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const parsed = extractJsonLdJobPosting(html);

    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("LPN Med Care Manager");
    expect(parsed?.company).toBe("Sunrise Senior Living Mgmt Inc");
    expect(parsed?.description).toContain("Sunrise");
  });

  it("extracts direct CDN logo from Schema.org JobPosting JSON-LD (Smoothstack)", () => {
    const filename = "Entry Level Software Developer ｜ Smoothstack Careers (11_5_2026 5：04：55 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const parsed = extractJsonLdJobPosting(html);

    expect(parsed).not.toBeNull();
    expect(parsed?.company).toBe("Smoothstack");
    expect(parsed?.logoUrl).toContain("cloudfront.net");
  });

  it("extracts DOM metadata when JSON-LD is absent or split-pane (Indeed AI Trainer)", () => {
    const filename = "Software Developer - AI Trainer - Illinois - Indeed.com (11_5_2026 5：07：37 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.indeed.com/viewjob?jk=123");

    expect(dom).not.toBeNull();
    expect(dom?.title).toBeDefined();
    expect(dom?.description).toBeDefined();
    expect(dom?.description?.length).toBeGreaterThan(250);
  });

  it("extracts DOM metadata and logo from Glassdoor posting", () => {
    const filename = "B12 Consulting hiring Application Developer Job in Oklahoma City, OK ｜ Glassdoor (11_5_2026 5：04：22 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.glassdoor.com/job-listing/123");

    expect(dom).not.toBeNull();
    expect(dom?.company).toBe("B12 Consulting");
    expect(dom?.title).toContain("Developer");
    expect(dom?.description?.length).toBeGreaterThan(250);
  });

  it("extracts ZipRecruiter active split-pane posting (Isabella Marketing)", () => {
    const filename = "96 Entry Level Marketing Jobs (NOW HIRING) in Los Angeles, CA (11_5_2026 5：13：18 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.ziprecruiter.com/jobs/search?q=marketing");

    expect(dom).not.toBeNull();
    expect(dom?.company).toBe("Isabella Marketing Solutions Inc");
    expect(dom?.location).toBe("West Hollywood, CA");
    expect(dom?.salary).toBe("$52K");
    expect(dom?.description).toContain("Isabella Marketing Solutions");
  });

  it("extracts MyGreenhouse modal posting (Neros Technologies)", () => {
    const filename = "MyGreenhouse (11_5_2026 5：25：17 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://my.greenhouse.io/jobs/nerostechnologies/5277764007");

    expect(dom).not.toBeNull();
    expect(dom?.company).toBe("Neros Technologies");
    expect(dom?.location).toBe("Torrance, CA");
    expect(dom?.description).toContain("Neros");
  });

  it("extracts Monster dual-pane active job details", () => {
    const filename = "Monster Jobs - Job Search, Career Advice & Hiring Resources ｜ Monster.com ｜ jobs near me (11_5_2026 11：36：55 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.monster.com/jobs/search?q=jobs+near+me&where=Sacramento%2C+CA");

    expect(dom).not.toBeNull();
    expect(dom?.title).toBe("Imaging Support Specialist - NBHP (Per Diem, Day)");
    expect(dom?.company).toBe("Northbay");
    expect(dom?.location).toBe("Fairfield, CA");
    expect(dom?.salary).toBe("$30.18-$36.7/Hr");
    expect(dom?.description).toContain("Northbay Health");
  });

  it("extracts Monster single posting with hourly pay", () => {
    const filename = "Imaging Support Specialist - NBHP (Per Diem, Day) Job - Northbay - Fairfield, CA (Hiring Now) - Monster (11_5_2026 11：48：22 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.monster.com/job-openings/imaging-support-specialist-fairfield-ca--123");

    expect(dom).not.toBeNull();
    expect(dom?.title).toBe("Imaging Support Specialist - NBHP (Per Diem, Day)");
    expect(dom?.company).toBe("Northbay");
    expect(dom?.location).toBe("Fairfield, CA");
    expect(dom?.salary).toBe("$30.18-$36.7/Hr");
  });

  it("extracts Stellantis / AutoNation Drupal career page cleanly", () => {
    const filename = "Porter ｜ Stellantis - AutoNation Chrysler Dodge Jeep Ram Roseville - 42947 (11_5_2026 11：45：22 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://careers.stellantis.com/job/42947");

    expect(dom).not.toBeNull();
    expect(dom?.title).toBe("Porter");
    expect(dom?.company).toBe("AutoNation Chrysler Dodge Jeep Ram Roseville");
    expect(dom?.location).toBe("Roseville, CA");
    expect(dom?.description).toBeDefined();
  });

  it("extracts Glassdoor split-pane painter posting with correct company and salary", () => {
    const filename = "565 painter Jobs in United States, November 2026 ｜ Glassdoor (11_5_2026 10：45：59 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.glassdoor.com/Job/us-painter-jobs-SRCH_IL.0,2_IN1_KO3,10.htm?jl=1010312943309");

    expect(dom).not.toBeNull();
    expect(dom?.title).toBe("SR PAINTER/COATINGS TECH");
    expect(dom?.company).toBe("Northrop Grumman");
    expect(dom?.salary).toBe("$54K-$130K");
    expect(dom?.description).toContain("RELOCATION ASSISTANCE");
    expect(dom?.applyUrl).toContain("1010312943309");
  });

  it("extracts Glassdoor single-pane ITW Painter with rounded hourly rate and canonical URL", () => {
    const filename = "ITW hiring Painter - 2nd Shift Job in Fairmont, MN ｜ Glassdoor (11_6_2026 12：26：47 AM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const parsedJsonLd = extractJsonLdJobPosting(html);
    expect(parsedJsonLd).not.toBeNull();
    expect(parsedJsonLd?.salary).toBe("$22.66 - $24.82 / hour");

    const dom = extractJobFromSemanticDom(html, "https://www.glassdoor.com/job-listing/1010313350279");
    expect(dom).not.toBeNull();
    expect(dom?.title).toContain("Painter - 2nd Shift");
    expect(dom?.company).toBe("ITW");
    expect(dom?.salary).toBe("$22.66-$24.82/Hr");
    expect(dom?.applyUrl).toContain("1010313350279");
  });

  it("extracts Indeed single-pane Outside Sales Consultant with correct company, location, and salary", () => {
    const filename = "Outside Sales Consultant- SAC - Elk Grove, CA 95624 - Indeed.com (11_6_2026 12：32：55 AM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.indeed.com/viewjob?jk=83f001740edeaaa2");

    expect(dom).not.toBeNull();
    expect(dom?.title).toBe("Outside Sales Consultant- SAC");
    expect(dom?.company).toBe("System Pavers");
    expect(dom?.location).toBe("Elk Grove, CA");
    expect(dom?.salary).toBe("$100K-$125K");
  });

  it("extracts Monster single posting canonical URL without double domain", () => {
    const filename = "Imaging Support Specialist - NBHP (Per Diem, Day) Job - Northbay - Fairfield, CA (Hiring Now) - Monster (11_5_2026 11：48：22 PM).html";
    const filePath = path.join(testHtmlDir, filename);
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, "utf-8");
    const dom = extractJobFromSemanticDom(html, "https://www.monster.com/job-openings/imaging-support-specialist-nbhp-per-diem-day-fairfield-ca--8b800b40-5c29-440d-b1c5-3d9dbd5844a1");

    expect(dom).not.toBeNull();
    expect(dom?.applyUrl).not.toContain("monster.com//www.monster.com");
    expect(dom?.applyUrl).toContain("/job-openings/imaging-support-specialist-nbhp-per-diem-day-fairfield-ca");
    expect(dom?.salary).toBe("$30.18-$36.7/Hr");
  });
});
