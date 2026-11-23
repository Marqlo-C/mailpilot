import { BriefcasePlus, CircleDollarSign, MapPin, Sparkles } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import { Badge } from "@/components/ui/badge";
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
    <div className="mx-auto max-w-xl space-y-4 p-4">
      {tailorError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {tailorError}
        </div>
      ) : null}

      <SettingsSectionCard
        icon={<LogoFrameIcon icon={BriefcasePlus} />}
        title="Job Details"
        subtitle="Import job details from your active tab above or enter them below."
        curvedDivider
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CompanyLogo
              key={`${company}-${companyLogoSrc}`}
              src={companyLogoSrc}
              fallbackSrc={googleLogoFallback}
              name={company || "Company"}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {company || "No company extracted"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {title || "No role title specified"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className="text-[10px] font-medium">
                External link
              </Badge>
              {extracted?.source ? (
                <span className="text-[10px] text-muted-foreground">
                  via {extracted.source}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10.5px] font-medium text-muted-foreground">
                Company Name
              </Label>
              <Input
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setOpportunityId(null);
                }}
                placeholder="e.g. DoorDash"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10.5px] font-medium text-muted-foreground">
                Role Title
              </Label>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setOpportunityId(null);
                }}
                placeholder="e.g. Senior Software Engineer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10.5px] font-medium text-muted-foreground">
                Location
              </Label>
              <Input
                leadingIcon={MapPin}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco, CA"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10.5px] font-medium text-muted-foreground">
                Salary / Comp
              </Label>
              <Input
                leadingIcon={CircleDollarSign}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. $160k - $210k"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10.5px] font-medium text-muted-foreground">
              Application URL
            </Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10.5px] font-medium text-muted-foreground">
                Job Description
              </Label>
              <span className="text-[10px] text-muted-foreground">
                {description.length} chars
              </span>
            </div>
            <Input
              multiline
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Paste full job description or extract from current page..."
            />
          </div>
        </div>
      </SettingsSectionCard>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-3.5 py-2.5">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <Checkbox
              checked={includeSummary}
              onCheckedChange={(val) => setIncludeSummary(Boolean(val))}
            />
            <span className="text-xs font-medium text-foreground">
              Include Summary
            </span>
          </label>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
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
                      ? "bg-muted font-semibold text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {b === "auto" ? "Auto" : `${b}p`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2.5 p-3.5">
          <button
            type="button"
            onClick={onTriggerTailoring}
            disabled={isTailoring || !session?.ok}
            className={cn(
              PRIMARY_ACTION_BTN_CLASSNAME,
              "h-10 w-full cursor-pointer justify-center gap-2 font-semibold shadow-xs"
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
                <span>
                  {preview ? "Regenerate Tailored Resume" : "Tailor Resume"}
                </span>
              </>
            )}
          </button>

          {!session?.ok ? (
            <p className="text-center text-[11px] text-destructive">
              Please log into MailPilot above before tailoring.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
