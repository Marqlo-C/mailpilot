export type ExtractedJobContext = {
  company: string;
  title: string;
  description: string;
  url: string;
  location?: string;
  salary?: string;
  source: string;
  extractedAt: string;
};

export type Environment = "dev" | "prod" | "custom";

export type EnvironmentOption = {
  id: Environment;
  label: string;
  url: string;
};

export const DEFAULT_ENVIRONMENTS: EnvironmentOption[] = [
  { id: "dev", label: "Local Dev (:3000)", url: "http://localhost:3000" },
  { id: "prod", label: "Production", url: "https://mailpilot-prod.vercel.app" },
];

export type ExtensionSession = {
  ok: boolean;
  account?: {
    id: string;
    email: string;
    name: string | null;
    picture: string | null;
  };
  profile?: {
    fullName: string;
    summary?: string | null;
    email?: string;
    phone?: string;
    location?: string;
    skills?: string[];
    experienceCount: number;
    projectCount: number;
  };
  error?: string;
};

export type ResumeDraftNode = {
  id: string;
  type: string;
  section: string;
  parentId?: string;
  content: string;
  selected: boolean;
  metadata?: Record<string, unknown>;
};

export type ResumeExportConfig = {
  includeSummary: boolean;
  pageBudget: "auto" | 1 | 2;
  sectionOrder?: string[];
  disabledSections?: string[];
};

export type TailoredResumeDraft = {
  opportunityId: string;
  nodes: ResumeDraftNode[];
  exportConfig: ResumeExportConfig;
  updatedAt: string;
};

export type OpportunityResumePreview = {
  filename: string;
  pdfBase64: string;
  docxBase64?: string;
  experiences: unknown[];
  projects: unknown[];
  tailoredSummary?: string;
  strategyRationale?: string;
  includeSummary: boolean;
  draft: TailoredResumeDraft;
};

export type TailorResponse = {
  ok: boolean;
  opportunityId: string;
  preview: OpportunityResumePreview;
  error?: string;
};

export type NodeUpdateResponse = {
  ok: boolean;
  preview: OpportunityResumePreview;
  error?: string;
};

export type ExportResponse = {
  ok: boolean;
  filename: string;
  format: "pdf" | "docx";
  base64: string;
  error?: string;
};
