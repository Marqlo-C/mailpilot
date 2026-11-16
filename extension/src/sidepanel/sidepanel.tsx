import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import "@/app/globals.css";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { injectedExtractionScript } from "./injected-extractor";
import { SidePanelHeader } from "./views/sidepanel-header";
import { JobDetailsView } from "./views/job-details-view";
import { ResumeDraftView } from "./views/resume-draft-view";
import type { TailoredResumeDraft } from "@/lib/resume-draft";
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
  const [logoUrl, setLogoUrl] = useState<string>("");
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
    setLogoUrl("");
    setExtracted(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("No active browser tab found.");
      }

      if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
        throw new Error("Cannot extract from browser internal pages. Navigate to a job listing.");
      }

      let extractedData: ExtractedJobContext | undefined;

      // 1. First attempt: Message active content script (extractor.js)
      try {
        const msgRes = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_JOB_CONTEXT" });
        if (msgRes?.ok && msgRes?.data) {
          extractedData = msgRes.data;
        }
      } catch {
        // Content script might not be injected yet
      }

      // 2. Second attempt: Inject extractor.js into active tab and retry message
      if (!extractedData) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["extractor.js"],
          });
          const retryRes = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_JOB_CONTEXT" });
          if (retryRes?.ok && retryRes?.data) {
            extractedData = retryRes.data;
          }
        } catch {
          // Fall through to standalone execution
        }
      }

      // 3. Fallback: Standalone inline script execution if messaging failed
      if (!extractedData) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: injectedExtractionScript,
        });
        extractedData = results[0]?.result as ExtractedJobContext | undefined;
      }

      if (extractedData) {
        setExtracted(extractedData);
        setCompany(extractedData.company);
        setTitle(extractedData.title);
        setLocation(extractedData.location || "");
        setSalary(extractedData.salary || "");
        setUrl(extractedData.url);
        setLogoUrl(extractedData.logoUrl || "");
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
        logoUrl: logoUrl.trim() || undefined,
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

  const googleLogoFallback = company ? getCompanyLogoUrl(company, null, url) : null;
  const companyLogoSrc = logoUrl || googleLogoFallback;

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas-fixed text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <SidePanelHeader
        env={env}
        baseUrl={baseUrl}
        session={session}
        checkingSession={checkingSession}
        activeTab={activeTab}
        preview={preview}
        isExtracting={isExtracting}
        onSwitchEnvironment={handleSwitchEnvironment}
        onRefreshSession={refreshSession}
        onExtractFromTab={handleExtractFromTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Body Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === "job" || !preview ? (
          <JobDetailsView
            company={company}
            setCompany={setCompany}
            title={title}
            setTitle={setTitle}
            location={location}
            setLocation={setLocation}
            salary={salary}
            setSalary={setSalary}
            url={url}
            setUrl={setUrl}
            description={description}
            setDescription={setDescription}
            companyLogoSrc={companyLogoSrc}
            googleLogoFallback={googleLogoFallback}
            extracted={extracted}
            tailorError={tailorError}
            includeSummary={includeSummary}
            setIncludeSummary={setIncludeSummary}
            pageBudget={pageBudget}
            setPageBudget={setPageBudget}
            isTailoring={isTailoring}
            session={session}
            preview={preview}
            setOpportunityId={setOpportunityId}
            onTriggerTailoring={handleTriggerTailoring}
          />
        ) : (
          <ResumeDraftView
            preview={preview}
            baseUrl={baseUrl}
            isTailoring={isTailoring}
            isExporting={isExporting}
            exportMessage={exportMessage}
            includeSummary={includeSummary}
            pageBudget={pageBudget}
            onBackToJob={() => setActiveTab("job")}
            onRegenerate={handleRegenerate}
            onToggleSummary={setIncludeSummary}
            onSetPageBudget={setPageBudget}
            onExport={handleExport}
            onCommit={handleCommit}
            onToggle={handleToggle}
            onMove={handleMove}
            onRefine={handleRefine}
          />
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
