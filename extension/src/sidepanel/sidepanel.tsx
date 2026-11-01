import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
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
  ResumeDraftNode,
} from "../lib/types";
import { extractJobContextFromDocument } from "../content/extractor";

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

  // Inline Editing & Surgical Refinement
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [refiningNodeId, setRefiningNodeId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState<string>("");
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Initial load: resolve environment and session
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
    let targetUrl = "https://mailpilot-prod.vercel.app";
    if (targetEnv === "dev") targetUrl = "http://localhost:3000";
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

      // Execute client-side extraction in page context
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Direct execution of extractor logic inside the host page DOM
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

          // Check JSON-LD
          let jsonLdResult: any = null;
          const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
          for (const s of Array.from(scripts)) {
            try {
              const parsed = JSON.parse(s.textContent || "{}");
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const it of items) {
                const isJob = it["@type"] === "JobPosting" || (Array.isArray(it["@graph"]) && it["@graph"].some((g: any) => g["@type"] === "JobPosting"));
                const target = it["@type"] === "JobPosting" ? it : it["@graph"]?.find((g: any) => g["@type"] === "JobPosting");
                if (target) {
                  jsonLdResult = {
                    title: clean(target.title),
                    company: clean(target.hiringOrganization?.name),
                    description: clean(target.description),
                    location: target.jobLocation?.address?.addressLocality,
                    salary: target.baseSalary?.value?.minValue ? `$${target.baseSalary.value.minValue} - $${target.baseSalary.value.maxValue}` : undefined,
                  };
                  break;
                }
              }
            } catch {}
          }

          // DOM Selectors
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

          const domDesc = q([
            "#job-details",
            "#jobDescriptionText",
            ".jobDescriptionContent",
            "#content",
            "[data-automation-id='jobPostingDescription']",
            ".section-wrapper.page-full-width",
            "#job-description",
          ]);

          const domLocation = q([
            ".job-details-jobs-unified-top-card__bullet",
            "[data-testid='jobsearch-JobInfoHeader-companyLocation']",
            "[data-test='job-location']",
            ".location",
          ]);

          const domSalary = q([
            "#salaryInfoAndJobType",
            "[data-test='detailSalary']",
            ".compensation__salary",
          ]);

          return {
            title: jsonLdResult?.title || domTitle || clean(doc.title),
            company: jsonLdResult?.company || domCompany || "",
            description: jsonLdResult?.description || domDesc || clean(doc.body?.innerText?.slice(0, 3000)),
            location: jsonLdResult?.location || domLocation || undefined,
            salary: jsonLdResult?.salary || domSalary || undefined,
            url: href,
            source: href.includes("linkedin") ? "LinkedIn" : href.includes("indeed") ? "Indeed" : href.includes("glassdoor") ? "Glassdoor" : "Web",
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

  async function handleTriggerTailoring() {
    if (!company.trim() || !title.trim()) {
      setTailorError("Please enter both Company name and Role title.");
      return;
    }
    if (!description.trim()) {
      setTailorError("Job description cannot be empty.");
      return;
    }

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
        pageBudget,
        includeSummary,
        opportunityId: opportunityId || undefined,
      });

      if (!res.ok) {
        throw new Error(res.error || "Failed to tailor resume");
      }

      setOpportunityId(res.opportunityId);
      setPreview(res.preview);
      setActiveTab("draft");
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : "Tailoring request failed");
    } finally {
      setIsTailoring(false);
    }
  }

  async function handleToggleNode(node: ResumeDraftNode) {
    if (!opportunityId || !preview) return;
    const newSelected = !node.selected;

    // Optimistic UI update
    const updatedNodes = preview.draft.nodes.map((n) =>
      n.id === node.id ? { ...n, selected: newSelected } : n
    );
    setPreview({
      ...preview,
      draft: { ...preview.draft, nodes: updatedNodes },
    });

    try {
      const res = await updateDraftNode({
        opportunityId,
        nodeId: node.id,
        selected: newSelected,
      });
      if (res.ok) setPreview(res.preview);
    } catch (err) {
      console.error("Toggle node failed", err);
    }
  }

  async function handleSaveNodeEdit(nodeId: string) {
    if (!opportunityId || !preview) return;
    const content = editingText.trim();
    setEditingNodeId(null);

    // Optimistic UI update
    const updatedNodes = preview.draft.nodes.map((n) =>
      n.id === nodeId ? { ...n, content } : n
    );
    setPreview({
      ...preview,
      draft: { ...preview.draft, nodes: updatedNodes },
    });

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

  async function handleReorderNode(nodeId: string, direction: "up" | "down") {
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

  async function handleRefineNode(nodeId: string) {
    if (!opportunityId || !refineInstruction.trim()) return;
    setIsRefining(true);
    try {
      const res = await refineDraftNode({
        opportunityId,
        nodeId,
        instruction: refineInstruction.trim(),
      });
      if (res.ok) {
        setPreview(res.preview);
        setRefiningNodeId(null);
        setRefineInstruction("");
      }
    } catch (err) {
      console.error("Refine node failed", err);
    } finally {
      setIsRefining(false);
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

      // Download via data URL
      const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const dataUrl = `data:${mime};base64,${res.base64}`;

      if (chrome.downloads?.download) {
        await chrome.downloads.download({
          url: dataUrl,
          filename: res.filename,
          saveAs: true,
        });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = res.filename;
        a.click();
      }
      setExportMessage(`Successfully exported ${res.filename}`);
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  // Filter nodes into sections for the draft sheet
  const draftNodes = preview?.draft?.nodes ?? [];
  const headerNode = draftNodes.find((n) => n.type === "header");
  const summaryNode = draftNodes.find((n) => n.section === "summary" && n.type === "summary");
  const skillNodes = draftNodes.filter((n) => n.section === "skills" && n.type === "skill_group");
  const experienceNodes = draftNodes.filter((n) => n.section === "experience");
  const projectNodes = draftNodes.filter((n) => n.section === "projects");
  const educationNodes = draftNodes.filter((n) => n.section === "education");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0b0f19", color: "#f3f4f6" }}>
      {/* Top Header Bar */}
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", backgroundColor: "#111827", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <img src="icons/icon-48.png" alt="MailPilot" style={{ width: "24px", height: "24px", borderRadius: "4px" }} />
          <span style={{ fontWeight: 700, fontSize: "14px", letterSpacing: "-0.01em", color: "#ffffff" }}>MailPilot</span>
          <span style={{ fontSize: "10px", backgroundColor: "#2563eb", color: "#ffffff", padding: "2px 6px", borderRadius: "10px", fontWeight: 600 }}>Companion</span>
        </div>

        {/* Environment Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ display: "flex", backgroundColor: "#1f2937", borderRadius: "6px", padding: "2px" }}>
            <button
              onClick={() => handleSwitchEnvironment("dev")}
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                backgroundColor: env === "dev" ? "#3b82f6" : "transparent",
                color: env === "dev" ? "#ffffff" : "#9ca3af",
              }}
            >
              Dev :3000
            </button>
            <button
              onClick={() => handleSwitchEnvironment("prod")}
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                backgroundColor: env === "prod" ? "#2563eb" : "transparent",
                color: env === "prod" ? "#ffffff" : "#9ca3af",
              }}
            >
              Prod
            </button>
          </div>

          {/* Connection Status Indicator */}
          <div
            title={session?.ok ? `Connected as ${session.profile?.fullName || session.account?.email}` : "Not logged in or unreachable"}
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: checkingSession ? "#9ca3af" : session?.ok ? "#10b981" : "#ef4444",
            }}
          />
        </div>
      </header>

      {/* User Session Bar */}
      <div style={{ padding: "8px 16px", backgroundColor: "#182234", borderBottom: "1px solid #1f2937", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {checkingSession ? (
          <span style={{ color: "#9ca3af" }}>Checking connection...</span>
        ) : session?.ok ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "bold" }}>
              {session.profile?.fullName?.[0] || session.account?.name?.[0] || "U"}
            </div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: 600, color: "#e5e7eb" }}>{session.profile?.fullName || session.account?.name}</span>
              {session.profile?.email && (
                <span style={{ color: "#9ca3af", marginLeft: "4px" }}>• {session.profile.email}</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span style={{ color: "#f87171" }}>Not authenticated to {env === "dev" ? "localhost" : "MailPilot"}</span>
            <a
              href={baseUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#60a5fa", textDecoration: "none", fontWeight: 600 }}
            >
              Log In →
            </a>
          </div>
        )}

        {preview && (
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => setActiveTab("job")}
              style={{
                padding: "2px 8px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                backgroundColor: activeTab === "job" ? "#374151" : "transparent",
                color: activeTab === "job" ? "#ffffff" : "#9ca3af",
              }}
            >
              Job
            </button>
            <button
              onClick={() => setActiveTab("draft")}
              style={{
                padding: "2px 8px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                backgroundColor: activeTab === "draft" ? "#2563eb" : "transparent",
                color: "#ffffff",
                fontWeight: 600,
              }}
            >
              Resume Draft ✨
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {activeTab === "job" ? (
          <div>
            {/* Extractor Trigger Card */}
            <div style={{ backgroundColor: "#131b2e", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f9fafb" }}>Active Tab Extractor</h3>
                  <p style={{ fontSize: "11px", color: "#94a3b8" }}>Extract job context directly from LinkedIn, Indeed, Glassdoor, etc.</p>
                </div>
                <button
                  onClick={handleExtractFromTab}
                  disabled={isExtracting}
                  style={{
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: isExtracting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isExtracting ? "Extracting..." : "Detect Job Context"}
                </button>
              </div>

              {extracted?.source && (
                <div style={{ display: "inline-block", fontSize: "10px", fontWeight: 600, color: "#38bdf8", backgroundColor: "rgba(56, 189, 248, 0.1)", padding: "2px 6px", borderRadius: "4px", marginBottom: "12px" }}>
                  Source: {extracted.source}
                </div>
              )}

              {/* Editable Fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#cbd5e1", marginBottom: "4px" }}>Role Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#ffffff", fontSize: "12px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#cbd5e1", marginBottom: "4px" }}>Company Name</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Stripe"
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#ffffff", fontSize: "12px" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#cbd5e1", marginBottom: "4px" }}>Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. San Francisco, CA"
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#ffffff", fontSize: "12px" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#cbd5e1", marginBottom: "4px" }}>Salary</label>
                    <input
                      type="text"
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      placeholder="e.g. $140,000 - $180,000"
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#ffffff", fontSize: "12px" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#cbd5e1", marginBottom: "4px" }}>Job Description</label>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Paste or inspect job description text..."
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#ffffff", fontSize: "11px", fontFamily: "inherit" }}
                  />
                </div>
              </div>
            </div>

            {/* Tailoring Budget & Controls */}
            <div style={{ backgroundColor: "#131b2e", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 600, color: "#f9fafb", marginBottom: "8px" }}>Tailoring Strategy</h4>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>Target Budget:</span>
                {(["auto", 1, 2] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setPageBudget(b)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      cursor: "pointer",
                      backgroundColor: pageBudget === b ? "#2563eb" : "#1e293b",
                      color: pageBudget === b ? "#ffffff" : "#94a3b8",
                      fontWeight: 600,
                    }}
                  >
                    {b === "auto" ? "Auto Fit" : `${b} Page${b > 1 ? "s" : ""}`}
                  </button>
                ))}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#cbd5e1", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) => setIncludeSummary(e.target.checked)}
                />
                Include Executive Summary
              </label>
            </div>

            {tailorError && (
              <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", color: "#fca5a5", fontSize: "12px", marginBottom: "14px" }}>
                {tailorError}
              </div>
            )}

            <button
              onClick={handleTriggerTailoring}
              disabled={isTailoring || !session?.ok}
              style={{
                width: "100%",
                padding: "10px",
                backgroundColor: isTailoring || !session?.ok ? "#374151" : "#16a34a",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "13px",
                borderRadius: "6px",
                border: "none",
                cursor: isTailoring || !session?.ok ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isTailoring ? "Tailoring Resume (Syncing to Leads)..." : "Tailor Resume & Save to Leads"}
            </button>
          </div>
        ) : (
          /* Interactive Resume Draft Sheet (WYSIWYG Layout Physics) */
          <div>
            {/* Action Bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => handleExport("pdf")}
                  disabled={isExporting}
                  style={{
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "5px 10px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Download PDF
                </button>
                <button
                  onClick={() => handleExport("docx")}
                  disabled={isExporting}
                  style={{
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "5px 10px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Download DOCX
                </button>
              </div>

              <a
                href={baseUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "11px", color: "#60a5fa", textDecoration: "none", fontWeight: 600 }}
              >
                View in MailPilot Leads ↗
              </a>
            </div>

            {exportMessage && (
              <div style={{ padding: "8px 12px", borderRadius: "4px", backgroundColor: "rgba(16, 185, 129, 0.2)", border: "1px solid #10b981", color: "#6ee7b7", fontSize: "11px", marginBottom: "12px" }}>
                {exportMessage}
              </div>
            )}

            {/* Resume Sheet Container (Simulating Printable Page) */}
            <div
              style={{
                backgroundColor: "#ffffff",
                color: "#111827",
                borderRadius: "4px",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
                padding: "24px 20px",
                fontFamily: "var(--font-sans)",
                fontSize: "10pt",
                lineHeight: 1.35,
                position: "relative",
              }}
            >
              {/* Header */}
              {headerNode && (
                <div style={{ textAlign: "center", marginBottom: "14px", borderBottom: "1px solid #e5e7eb", paddingBottom: "10px" }}>
                  <h1 style={{ fontSize: "18pt", fontWeight: 800, letterSpacing: "-0.02em", color: "#111827", margin: "0 0 4px 0" }}>
                    {headerNode.content}
                  </h1>
                  {typeof headerNode.metadata?.contactLine === "string" && (
                    <div style={{ fontSize: "8.5pt", color: "#4b5563" }}>
                      {headerNode.metadata.contactLine}
                    </div>
                  )}
                </div>
              )}

              {/* Executive Summary */}
              {summaryNode && summaryNode.selected && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ borderBottom: "1px solid #d1d5db", paddingBottom: "2px", fontWeight: 700, fontSize: "9pt", letterSpacing: "0.05em", color: "#111827", textTransform: "uppercase", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                    <span>Professional Summary</span>
                    <button
                      onClick={() => handleToggleNode(summaryNode)}
                      style={{ fontSize: "9px", background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                    >
                      Hide
                    </button>
                  </div>
                  <p style={{ fontSize: "8.5pt", color: "#374151", margin: 0 }}>{summaryNode.content}</p>
                </div>
              )}

              {/* Skills */}
              {skillNodes.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ borderBottom: "1px solid #d1d5db", paddingBottom: "2px", fontWeight: 700, fontSize: "9pt", letterSpacing: "0.05em", color: "#111827", textTransform: "uppercase", marginBottom: "4px" }}>
                    Technical Skills
                  </div>
                  {skillNodes.map((s) => (
                    <div key={s.id} style={{ fontSize: "8.5pt", color: "#374151", marginBottom: "2px" }}>
                      <strong>{s.metadata?.label as string || "Skills"}: </strong>
                      {s.content}
                    </div>
                  ))}
                </div>
              )}

              {/* Experience */}
              {experienceNodes.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ borderBottom: "1px solid #d1d5db", paddingBottom: "2px", fontWeight: 700, fontSize: "9pt", letterSpacing: "0.05em", color: "#111827", textTransform: "uppercase", marginBottom: "6px" }}>
                    Professional Experience
                  </div>

                  {experienceNodes.map((item) => {
                    if (item.type === "experience_header") {
                      return (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "8px", marginBottom: "2px" }}>
                          <div>
                            <strong style={{ fontSize: "9pt", color: "#111827" }}>{item.content}</strong>
                            {typeof item.metadata?.company === "string" && (
                              <span style={{ fontSize: "8.5pt", color: "#4b5563" }}> • {item.metadata.company}</span>
                            )}
                          </div>
                          {typeof item.metadata?.dates === "string" && (
                            <span style={{ fontSize: "8pt", color: "#6b7280" }}>{item.metadata.dates}</span>
                          )}
                        </div>
                      );
                    }

                    // Experience Bullet
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "6px",
                          marginBottom: "3px",
                          opacity: item.selected ? 1 : 0.4,
                          backgroundColor: editingNodeId === item.id ? "rgba(59, 130, 246, 0.05)" : "transparent",
                          borderRadius: "3px",
                          padding: "2px 0",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleNode(item)}
                          style={{ marginTop: "3px", cursor: "pointer" }}
                        />
                        <div style={{ flex: 1 }}>
                          {editingNodeId === item.id ? (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                style={{ width: "100%", fontSize: "8.5pt", padding: "4px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                rows={2}
                              />
                              <button
                                onClick={() => handleSaveNodeEdit(item.id)}
                                style={{ backgroundColor: "#2563eb", color: "#ffffff", border: "none", borderRadius: "3px", padding: "2px 6px", fontSize: "10px", cursor: "pointer" }}
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontSize: "8.5pt", color: "#374151" }}>
                              <span>• {item.content}</span>
                              <div style={{ display: "inline-flex", gap: "4px", marginLeft: "6px" }}>
                                <button
                                  onClick={() => {
                                    setEditingNodeId(item.id);
                                    setEditingText(item.content);
                                  }}
                                  style={{ fontSize: "9px", background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleReorderNode(item.id, "up")}
                                  style={{ fontSize: "9px", background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => handleReorderNode(item.id, "down")}
                                  style={{ fontSize: "9px", background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                                >
                                  ▼
                                </button>
                                <button
                                  onClick={() => {
                                    setRefiningNodeId(refiningNodeId === item.id ? null : item.id);
                                    setRefineInstruction("");
                                  }}
                                  style={{ fontSize: "9px", background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontWeight: 600 }}
                                >
                                  ✨ Refine
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Refine Line Dialog */}
                          {refiningNodeId === item.id && (
                            <div style={{ marginTop: "4px", padding: "6px", backgroundColor: "#f3f4f6", borderRadius: "4px", border: "1px solid #e5e7eb" }}>
                              <input
                                type="text"
                                placeholder="Refine line with AI: e.g. Add metrics, emphasize latency..."
                                value={refineInstruction}
                                onChange={(e) => setRefineInstruction(e.target.value)}
                                style={{ width: "100%", fontSize: "9px", padding: "4px 6px", marginBottom: "4px", borderRadius: "3px", border: "1px solid #d1d5db" }}
                              />
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}>
                                <button
                                  onClick={() => setRefiningNodeId(null)}
                                  style={{ fontSize: "9px", background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleRefineNode(item.id)}
                                  disabled={isRefining}
                                  style={{ backgroundColor: "#6366f1", color: "#ffffff", border: "none", borderRadius: "3px", padding: "2px 8px", fontSize: "9px", cursor: isRefining ? "not-allowed" : "pointer" }}
                                >
                                  {isRefining ? "Refining..." : "Rewrite"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Projects */}
              {projectNodes.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ borderBottom: "1px solid #d1d5db", paddingBottom: "2px", fontWeight: 700, fontSize: "9pt", letterSpacing: "0.05em", color: "#111827", textTransform: "uppercase", marginBottom: "6px" }}>
                    Notable Projects
                  </div>
                  {projectNodes.map((item) => {
                    if (item.type === "project_header") {
                      return (
                        <div key={item.id} style={{ marginTop: "6px", marginBottom: "2px" }}>
                          <strong style={{ fontSize: "9pt", color: "#111827" }}>{item.content}</strong>
                          {typeof item.metadata?.techStack === "string" && (
                            <span style={{ fontSize: "8pt", color: "#4b5563" }}> | {item.metadata.techStack}</span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "2px", opacity: item.selected ? 1 : 0.4 }}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleNode(item)}
                          style={{ marginTop: "3px", cursor: "pointer" }}
                        />
                        <span style={{ fontSize: "8.5pt", color: "#374151" }}>• {item.content}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Page 1 Ceiling Boundary Marker */}
              <div
                style={{
                  margin: "16px 0",
                  borderTop: "1.5px dashed #ef4444",
                  position: "relative",
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "-8px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "#fef2f2",
                    color: "#dc2626",
                    padding: "0 8px",
                    fontSize: "8px",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    borderRadius: "3px",
                    border: "1px solid #fecaca",
                  }}
                >
                  Page 1 Boundary (792pt)
                </span>
              </div>

              {/* Education */}
              {educationNodes.length > 0 && (
                <div>
                  <div style={{ borderBottom: "1px solid #d1d5db", paddingBottom: "2px", fontWeight: 700, fontSize: "9pt", letterSpacing: "0.05em", color: "#111827", textTransform: "uppercase", marginBottom: "4px" }}>
                    Education
                  </div>
                  {educationNodes.map((item) => (
                    <div key={item.id} style={{ fontSize: "8.5pt", color: "#374151", marginBottom: "2px" }}>
                      {item.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mount Side Panel
const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<SidePanelApp />);
}
