import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowBigLeftDash,
  Briefcase,
  BriefcasePlus,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import "@/app/globals.css";
import { ResumeDraftSheet } from "@/components/opportunities/drawer/resume-draft-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CompanyLogo } from "@/components/ui/company-logo";
import {
  darkRailListClassName,
  darkRailTriggerClassName,
  lightRailListClassName,
  lightRailTriggerClassName,
} from "@/components/ui/tactile/segmented-tabs";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { SettingsFeatureLogo } from "@/components/settings/ui/feature-logo";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { cn } from "@/lib/utils";
import type { TailoredResumeDraft } from "@/lib/types/resume-draft";
import {
  checkSession,
  exportDraftDocument,
  getEnvironment,
  refineDraftNode,
  reorderDraftNode,
  setEnvironment as saveEnvironment,
  tailorResume,
  updateDraftNode,
} from "../lib/api-client";
import type {
  Environment,
  ExtractedJobContext,
  ExtensionSession,
  OpportunityResumePreview,
} from "../lib/types";

export function SidePanelApp() {
  const [env, setEnv] = useState<Environment>("prod");
  const [baseUrl, setBaseUrl] = useState<string>("https://mailpilot-prod.vercel.app");
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  // Extracted Job State
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extracted, setExtracted] = useState<ExtractedJobContext | null>(null);
  const [company, setCompany] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [salary, setSalary] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Tailoring Options
  const [pageBudget, setPageBudget] = useState<"auto" | 1 | 2>("auto");
  const [includeSummary, setIncludeSummary] = useState<boolean>(true);
  const [isTailoring, setIsTailoring] = useState<boolean>(false);
  const [tailorError, setTailorError] = useState<string | null>(null);

  // Resume Draft State
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [preview, setPreview] = useState<OpportunityResumePreview | null>(null);
  const [activeTab, setActiveTab] = useState<"job" | "draft">("job");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    refreshSession();
  }, []);

  async function refreshSession() {
    setCheckingSession(true);
    try {
      const currentEnv = await getEnvironment();
      setEnv(currentEnv.env);
      setBaseUrl(currentEnv.url);
      const sess = await checkSession();
      setSession(sess);
    } catch (err) {
      console.error("Session refresh failed", err);
    } finally {
      setCheckingSession(false);
    }
  }

  async function handleSwitchEnvironment(targetEnv: Environment) {
    let targetUrl = "http://localhost:3000";
    if (targetEnv === "prod") targetUrl = "https://mailpilot-prod.vercel.app";
    await saveEnvironment(targetEnv, targetUrl);
    setEnv(targetEnv);
    setBaseUrl(targetUrl);
    await refreshSession();
  }

  async function handleExtractFromTab() {
    setIsExtracting(true);
    setTailorError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("No active browser tab found.");
      }

      if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
        throw new Error("Cannot extract from browser internal pages. Navigate to a job listing.");
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const doc = document;
          const href = window.location.href;

          function clean(str: string | null | undefined): string {
            if (!str) return "";
            return str
              .replace(/<[^>]*>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/[ \t]+/g, " ")
              .replace(/\n\s*\n\s*\n/g, "\n\n")
              .trim();
          }

          let jsonLdResult: any = null;
          const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
          for (const s of Array.from(scripts)) {
            try {
              const parsed = JSON.parse(s.textContent || "{}");
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const it of items) {
                const target =
                  it["@type"] === "JobPosting"
                    ? it
                    : it["@graph"]?.find((g: any) => g["@type"] === "JobPosting");
                if (target) {
                  jsonLdResult = {
                    title: clean(target.title),
                    company: clean(target.hiringOrganization?.name),
                    description: clean(target.description),
                    location: target.jobLocation?.address?.addressLocality,
                    salary: target.baseSalary?.value?.minValue
                      ? `$${target.baseSalary.value.minValue} - $${target.baseSalary.value.maxValue}`
                      : undefined,
                  };
                  break;
                }
              }
            } catch {}
          }

          function q(selectors: string[]): string {
            for (const sel of selectors) {
              const el = doc.querySelector(sel);
              if (el?.textContent) return clean(el.textContent);
            }
            return "";
          }

          const domTitle = q([
            ".job-details-jobs-unified-top-card__job-title",
            ".jobsearch-JobInfoHeader-title",
            "[data-test='job-title']",
            ".posting-headline h2",
            ".app-title",
            "[data-automation-id='jobPostingHeader']",
            "h1",
          ]);

          const domCompany = q([
            ".job-details-jobs-unified-top-card__company-name",
            "[data-testid='inlineHeader-companyName']",
            "[data-test='employer-name']",
            ".company-name",
            ".posting-headline .employer",
            "[data-automation-id='companyName']",
          ]);

          const domLocation = q([
            ".job-details-jobs-unified-top-card__bullet",
            "[data-testid='inlineHeader-companyLocation']",
            "[data-test='location']",
            ".location",
            "[data-automation-id='locations']",
          ]);

          const domSalary = q([
            ".job-details-jobs-unified-top-card__job-insight--highlight",
            "[data-testid='attribute_snippets_section']",
            ".salary",
          ]);

          const domDesc = q([
            "#job-details",
            "#jobDescriptionText",
            "[data-test='job-description']",
            ".posting-description",
            ".section-page",
            "[data-automation-id='jobPostingDescription']",
            "article",
            "main",
          ]);

          return {
            title: jsonLdResult?.title || domTitle || clean(doc.title),
            company: jsonLdResult?.company || domCompany || "",
            location: jsonLdResult?.location || domLocation || undefined,
            salary: jsonLdResult?.salary || domSalary || undefined,
            url: href,
            description: jsonLdResult?.description || domDesc || clean(doc.body.innerText).slice(0, 5000),
            source: href.includes("linkedin")
              ? "LinkedIn"
              : href.includes("greenhouse.io")
              ? "Greenhouse"
              : href.includes("lever.co")
              ? "Lever"
              : href.includes("ashbyhq.com")
              ? "Ashby"
              : href.includes("workday")
              ? "Workday"
              : href.includes("indeed")
              ? "Indeed"
              : href.includes("glassdoor")
              ? "Glassdoor"
              : "Web",
            extractedAt: new Date().toISOString(),
          };
        },
      });

      const extractedData = results[0]?.result as ExtractedJobContext | undefined;
      if (extractedData) {
        setExtracted(extractedData);
        setCompany(extractedData.company);
        setTitle(extractedData.title);
        setLocation(extractedData.location || "");
        setSalary(extractedData.salary || "");
        setUrl(extractedData.url);
        setDescription(extractedData.description);
      }
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleTriggerTailoring(customOptions?: {
    summaryOverride?: boolean;
    budgetOverride?: "auto" | 1 | 2;
  }) {
    if (!company.trim() || !title.trim()) {
      setTailorError("Please enter both Company name and Role title.");
      return;
    }
    if (!description.trim()) {
      setTailorError("Job description cannot be empty.");
      return;
    }

    const targetSummary =
      customOptions?.summaryOverride !== undefined
        ? customOptions.summaryOverride
        : includeSummary;
    const targetBudget =
      customOptions?.budgetOverride !== undefined
        ? customOptions.budgetOverride
        : pageBudget;

    setIsTailoring(true);
    setTailorError(null);
    try {
      const res = await tailorResume({
        company: company.trim(),
        title: title.trim(),
        description: description.trim(),
        url: url.trim() || undefined,
        location: location.trim() || undefined,
        salary: salary.trim() || undefined,
        pageBudget: targetBudget,
        includeSummary: targetSummary,
        opportunityId: opportunityId || undefined,
      });

      if (!res.ok) {
        throw new Error(res.error || "Failed to tailor resume");
      }

      setOpportunityId(res.opportunityId);
      setPreview(res.preview);
      if (customOptions?.summaryOverride !== undefined) {
        setIncludeSummary(customOptions.summaryOverride);
      }
      if (customOptions?.budgetOverride !== undefined) {
        setPageBudget(customOptions.budgetOverride);
      }
      setActiveTab("draft");
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : "Tailoring request failed");
    } finally {
      setIsTailoring(false);
    }
  }

  async function handleRegenerate() {
    await handleTriggerTailoring();
  }

  async function handleCommit(nodeId: string, content: string) {
    if (!opportunityId || !preview) return;
    try {
      const res = await updateDraftNode({
        opportunityId,
        nodeId,
        content,
      });
      if (res.ok) setPreview(res.preview);
    } catch (err) {
      console.error("Save node edit failed", err);
    }
  }

  async function handleToggle(nodeId: string, selected: boolean) {
    if (!opportunityId || !preview) return;
    try {
      const res = await updateDraftNode({
        opportunityId,
        nodeId,
        selected,
      });
      if (res.ok) setPreview(res.preview);
    } catch (err) {
      console.error("Toggle node failed", err);
    }
  }

  async function handleMove(nodeId: string, direction: "up" | "down") {
    if (!opportunityId || !preview) return;
    try {
      const res = await reorderDraftNode({
        opportunityId,
        nodeId,
        direction,
      });
      if (res.ok) setPreview(res.preview);
    } catch (err) {
      console.error("Reorder node failed", err);
    }
  }

  async function handleRefine(nodeId: string, instruction: string) {
    if (!opportunityId || !instruction.trim()) return;
    try {
      const res = await refineDraftNode({
        opportunityId,
        nodeId,
        instruction: instruction.trim(),
      });
      if (res.ok) setPreview(res.preview);
    } catch (err) {
      console.error("Refine node failed", err);
    }
  }

  async function handleExport(format: "pdf" | "docx") {
    if (!opportunityId) return;
    setIsExporting(true);
    setExportMessage(null);
    try {
      const res = await exportDraftDocument({ opportunityId, format });
      if (!res.ok || !res.base64) {
        throw new Error(res.error || "Export failed");
      }

      const mime =
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const dataUrl = `data:${mime};base64,${res.base64}`;

      if (chrome.downloads?.download) {
        await chrome.downloads.download({
          url: dataUrl,
          filename: res.filename,
          saveAs: true,
        });
        setExportMessage(`Saved ${res.filename}`);
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = res.filename;
        link.click();
        setExportMessage(`Downloaded ${res.filename}`);
      }
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMessage(null), 4000);
    }
  }

  const companyLogoSrc = company ? getCompanyLogoUrl(company, null, url) : null;

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas-fixed text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* MailPilot Top Navigation Deck */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/80 bg-[#181e26] text-white px-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[22%]">
            <img
              src="logos/colored-logo-only.png"
              alt="MailPilot"
              className="h-full w-full scale-125 object-contain"
            />
          </span>
          <div className="flex items-center">
            <span className="relative flex h-7 shrink-0 items-center overflow-hidden">
              <img
                src="logos/transparent-white-wordmark-inline.png"
                alt="MailPilot"
                className="pointer-events-none h-[54px] w-auto max-w-none object-contain"
              />
            </span>
            <span
              className="-ml-0.5 font-sans text-sm font-semibold tracking-tight select-none text-[#fdad76]"
              style={{ color: "#fdad76" }}
            >
              +
            </span>
          </div>
          <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] font-medium border-white/20 bg-white/5 text-[#e4f7f3]">
            Companion
          </Badge>
        </div>

        {/* Connected Indicator & Environment Tab Rail */}
        <div className="flex items-center gap-2">
          {/* Connected Indicator (Left of Tab Rail) */}
          <div
            title={
              session?.ok
                ? `Connected as ${session.profile?.fullName || session.account?.email}`
                : "Not connected to MailPilot"
            }
            className={cn(
              "h-2.5 w-2.5 rounded-full transition-all",
              checkingSession
                ? "bg-white/40 animate-pulse"
                : session?.ok
                ? "bg-emerald-400 ring-2 ring-emerald-400/20"
                : "bg-destructive ring-2 ring-destructive/20"
            )}
          />

          {/* Dark Tab Rail from UI Setting */}
          <div
            className={cn(darkRailListClassName, "p-0.5 pr-3 gap-2 rounded-lg shadow-sm")}
            data-mp-tab-rail=""
            role="radiogroup"
            aria-label="Environment"
          >
            <button
              type="button"
              role="radio"
              aria-checked={env === "dev"}
              data-state={env === "dev" ? "active" : "inactive"}
              className={cn(darkRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
              onClick={() => handleSwitchEnvironment("dev")}
            >
              Dev :3000
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={env === "prod"}
              data-state={env === "prod" ? "active" : "inactive"}
              className={cn(darkRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
              onClick={() => handleSwitchEnvironment("prod")}
            >
              Production
            </button>
          </div>
        </div>
      </header>

      {/* Account Session Header Strip (Styled like MailPilot Toolbar) */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/50 bg-card/75 px-3 text-xs shadow-2xs backdrop-blur-md">
        {checkingSession ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" /> Verifying session…
          </span>
        ) : session?.ok ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 shadow-xs">
              {session.account?.picture ? (
                <img
                  src={session.account.picture}
                  alt={session.profile?.fullName || session.account?.name || "Account"}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-primary/10 text-[9px] font-bold text-primary">
                  {session.profile?.fullName?.[0] || session.account?.name?.[0] || "U"}
                </span>
              )}
            </span>
            <span className="truncate font-medium text-foreground text-xs">
              {session.profile?.fullName || session.account?.name}
            </span>
            {session.account?.email && (
              <>
                <span className="h-3 w-px bg-border/60 shrink-0" aria-hidden="true" />
                <span className="truncate text-muted-foreground text-[11px]">{session.account.email}</span>
              </>
            )}
            <button
              type="button"
              onClick={refreshSession}
              title="Refresh connection"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ml-0.5 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <span className="text-destructive font-medium text-xs">
              Not authenticated ({env === "dev" ? "localhost:3000" : "Production"})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshSession}
                title="Retry connection"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
              <a
                href={baseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium text-xs"
              >
                Sign in <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {(activeTab === "job" || !preview) && (
            <button
              type="button"
              onClick={handleExtractFromTab}
              disabled={isExtracting}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:pointer-events-none disabled:opacity-50"
              title="Import job details from the active browser tab"
            >
              {isExtracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Compass className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{isExtracting ? "Importing…" : "Import from Tab"}</span>
            </button>
          )}

          {preview && (
            <div
              className={cn(lightRailListClassName, "p-0.5 pr-2.5 gap-2 rounded-lg shadow-2xs self-center")}
              role="tablist"
              aria-label="View Navigation"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "job"}
                data-state={activeTab === "job" ? "active" : "inactive"}
                className={cn(lightRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
                onClick={() => setActiveTab("job")}
              >
                Job
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "draft"}
                data-state={activeTab === "draft" ? "active" : "inactive"}
                className={cn(lightRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
                onClick={() => setActiveTab("draft")}
              >
                Draft
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Body Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === "job" || !preview ? (
          <div className="p-4 space-y-4 max-w-xl mx-auto">
            {tailorError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {tailorError}
              </div>
            )}

            {/* 1. Master Job Details First-Level Card */}
            <SettingsSectionCard
              icon={<SettingsFeatureLogo icon={BriefcasePlus} />}
              title="Job Details"
              subtitle="Import job details from your active tab above or enter them below."
              curvedDivider
            >
              {/* Inner Opportunity Card */}
              <Card className="border-border/70 bg-card/60 shadow-xs">
                <CardHeader className="pb-3 pt-3.5 px-3.5">
                  <div className="flex items-start gap-3">
                    <CompanyLogo
                      src={companyLogoSrc}
                      name={company || "Company"}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-semibold truncate">
                        {company || "No company extracted"}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground truncate">
                        {title || "No role title specified"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px] font-medium">
                        External link
                      </Badge>
                      {extracted?.source && (
                        <span className="text-[10px] text-muted-foreground">
                          via {extracted.source}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 px-3.5 pb-3.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-medium text-muted-foreground">Company Name</Label>
                      <Input
                        value={company}
                        onChange={(e) => {
                          setCompany(e.target.value);
                          setOpportunityId(null);
                        }}
                        placeholder="e.g. DoorDash"
                        className="h-8 text-xs md:text-xs font-sans placeholder:text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-medium text-muted-foreground">Role Title</Label>
                      <Input
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setOpportunityId(null);
                        }}
                        placeholder="e.g. Senior Software Engineer"
                        className="h-8 text-xs md:text-xs font-sans placeholder:text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-medium text-muted-foreground">Location</Label>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. San Francisco, CA"
                          className="h-8 pl-7 text-xs md:text-xs font-sans placeholder:text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-medium text-muted-foreground">Salary / Comp</Label>
                      <div className="relative">
                        <CircleDollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={salary}
                          onChange={(e) => setSalary(e.target.value)}
                          placeholder="e.g. $160k - $210k"
                          className="h-8 pl-7 text-xs md:text-xs font-sans placeholder:text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10.5px] font-medium text-muted-foreground">Application URL</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://..."
                      className="h-8 text-xs md:text-xs font-sans placeholder:text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10.5px] font-medium text-muted-foreground">Job Description</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {description.length} chars
                      </span>
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Paste full job description or extract from current page..."
                      rows={6}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs md:text-xs font-sans shadow-xs placeholder:text-muted-foreground placeholder:text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring leading-relaxed"
                    />
                  </div>
                </CardContent>
              </Card>
            </SettingsSectionCard>

            {/* 2. Tailoring Preferences & Action Card (First-Level Card without Title/Subtitle) */}
            <div className="rounded-xl border border-border/80 bg-card shadow-md overflow-hidden">
              {/* Toolbar Strip: Include Summary + Budget Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-3.5 py-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={includeSummary}
                    onCheckedChange={(val) => setIncludeSummary(Boolean(val))}
                  />
                  <span className="text-xs font-medium text-foreground">
                    Include Summary
                  </span>
                </label>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Budget:
                  </span>
                  <div className="flex rounded-md border border-input/60 bg-card p-0.5 shadow-2xs">
                    {(["auto", 1, 2] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setPageBudget(b)}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                          pageBudget === b
                            ? "bg-muted text-foreground font-semibold shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {b === "auto" ? "Auto" : `${b}p`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="p-3.5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleTriggerTailoring()}
                  disabled={isTailoring || !session?.ok}
                  className={cn(
                    PRIMARY_ACTION_BTN_CLASSNAME,
                    "w-full h-10 font-semibold gap-2 justify-center shadow-xs cursor-pointer"
                  )}
                >
                  {isTailoring ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#e4f7f3]" />
                      <span>Tailoring with Ace AI…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-[#e4f7f3]" />
                      <span>{preview ? "Regenerate Tailored Resume" : "Tailor Resume"}</span>
                    </>
                  )}
                </button>

                {!session?.ok && (
                  <p className="text-center text-[11px] text-destructive">
                    Please log into MailPilot above before tailoring.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Tailored Resume Review Sheet View */
          <div className="flex h-full flex-col">
            {/* Draft Action Bar (MailPilot Toolbar Style) */}
            <div className="sticky top-0 z-20 relative flex items-center justify-between border-b border-border/50 bg-card/80 px-3 py-2 shadow-sm backdrop-blur-md">
              {/* Left Group: Job Back + Regenerate Buttons */}
              <div className="z-10 flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("job")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                  title="Back to Job Details"
                >
                  <ArrowBigLeftDash className="h-3.5 w-3.5 fill-current" />
                  <span>Job</span>
                </button>

                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isTailoring}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:pointer-events-none disabled:opacity-50"
                  title="Regenerate Tailored Resume"
                >
                  <RotateCcw className={cn("h-3 w-3", isTailoring && "animate-spin")} />
                  <span>{isTailoring ? "Regenerating…" : "Regenerate"}</span>
                </button>
              </div>

              {/* Center Group: Summary & Budget Controls Centered Across Full Bar Width */}
              <div className="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center justify-center">
                <div className="pointer-events-auto flex items-center gap-2.5">
                  <label className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground/80 hover:text-foreground cursor-pointer select-none">
                    <Checkbox
                      checked={includeSummary}
                      onCheckedChange={(val) => {
                        const next = Boolean(val);
                        setIncludeSummary(next);
                        void handleTriggerTailoring({ summaryOverride: next });
                      }}
                    />
                    <span>Summary</span>
                  </label>

                  <div className="h-3.5 w-px bg-border/60 shrink-0" aria-hidden="true" />

                  <div className="inline-flex rounded-md border border-input/60 bg-card p-0.5 shadow-sm">
                    {(["auto", 1, 2] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          setPageBudget(b);
                          void handleTriggerTailoring({ budgetOverride: b });
                        }}
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                          pageBudget === b
                            ? "bg-muted text-foreground font-semibold shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        {b === "auto" ? "Auto" : `${b}p`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Group: View in Leads in Toolbar Button Style */}
              <div className="z-10 flex items-center shrink-0">
                <a
                  href={`${baseUrl}/jobs?tab=leads`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  title="View leads in MailPilot"
                >
                  <span>View in Leads</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              </div>
            </div>

            {exportMessage && (
              <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 text-center text-xs font-medium text-primary">
                {exportMessage}
              </div>
            )}

            {/* Embedded ResumeDraftSheet Container */}
            <div className="flex-1 min-h-0 overflow-hidden bg-muted/10">
              <ResumeDraftSheet
                draft={preview.draft}
                disabled={isTailoring}
                exporting={isExporting}
                onExport={handleExport}
                onCommit={handleCommit}
                onToggle={handleToggle}
                onMove={handleMove}
                onRefine={handleRefine}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <SidePanelApp />
    </React.StrictMode>
  );
}
