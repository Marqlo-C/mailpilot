import { BriefcasePlus, CircleDollarSign, MapPin, Sparkles } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CompanyLogo, LogoFrameIcon } from "@/components/ui/logo-frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { cn } from "@/lib/utils";
import type {
  ExtractedJobContext,
  ExtensionSession,
  OpportunityResumePreview,
} from "../../lib/types";

export type JobDetailsViewProps = {
  company: string;
  setCompany: (val: string) => void;
  title: string;
  setTitle: (val: string) => void;
  location: string;
  setLocation: (val: string) => void;
  salary: string;
  setSalary: (val: string) => void;
  url: string;
  setUrl: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  companyLogoSrc: string | null;
  googleLogoFallback: string | null;
  extracted: ExtractedJobContext | null;
  tailorError: string | null;
  includeSummary: boolean;
  setIncludeSummary: (val: boolean) => void;
  pageBudget: "auto" | 1 | 2;
  setPageBudget: (val: "auto" | 1 | 2) => void;
  isTailoring: boolean;
  session: ExtensionSession | null;
  preview: OpportunityResumePreview | null;
  setOpportunityId: (id: string | null) => void;
  onTriggerTailoring: () => void;
};

export function JobDetailsView({
  company,
  setCompany,
  title,
  setTitle,
  location,
  setLocation,
  salary,
  setSalary,
  url,
  setUrl,
  description,
  setDescription,
  companyLogoSrc,
  googleLogoFallback,
  extracted,
  tailorError,
  includeSummary,
  setIncludeSummary,
  pageBudget,
  setPageBudget,
  isTailoring,
  session,
  preview,
  setOpportunityId,
  onTriggerTailoring,
}: JobDetailsViewProps) {
  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      {tailorError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {tailorError}
        </div>
      )}

      {/* 1. Master Job Details First-Level Card */}
      <SettingsSectionCard
        icon={<LogoFrameIcon icon={BriefcasePlus} />}
        title="Job Details"
        subtitle="Import job details from your active tab above or enter them below."
        curvedDivider
      >
        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 pt-3.5 px-3.5">
            <div className="flex items-start gap-3">
              <CompanyLogo
                key={`${company}-${companyLogoSrc}`}
                src={companyLogoSrc}
                fallbackSrc={googleLogoFallback}
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

      {/* 2. Tailoring Preferences & Action Card */}
      <div className="rounded-xl border border-border/80 bg-card shadow-md overflow-hidden">
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

        <div className="p-3.5 space-y-2.5">
          <button
            type="button"
            onClick={onTriggerTailoring}
            disabled={isTailoring || !session?.ok}
            className={cn(
              PRIMARY_ACTION_BTN_CLASSNAME,
              "w-full h-10 font-semibold gap-2 justify-center shadow-xs cursor-pointer"
            )}
          >
            {isTailoring ? (
              <>
                <Loader size="sm" className="text-[#e4f7f3]" />
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
  );
}
