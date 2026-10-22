"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobApplication } from "@prisma/client";
import { Check, Copy, Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  downloadTailoredPdfAction,
  markPortalAsApplied,
} from "@/app/actions/dispatch";
import type { MasterProfileInput } from "@/lib/validations/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type AtsHandoffDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: JobApplication | null;
  profile: MasterProfileInput | null;
};

async function copyText(label: string, value: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`Copied ${label}`);
}

/**
 * Extensible hook point for future headless browser ATS automation.
 */
export function onAutomateWithAgent(_applicationId: string): void {
  toast.message("Agent automation coming soon");
}

export function AtsHandoffDrawer({
  open,
  onOpenChange,
  application,
  profile,
}: AtsHandoffDrawerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!application) return null;

  const keyBullets =
    profile?.experiences
      .flatMap((e) => e.bullets.map((b) => b.rawText))
      .slice(0, 5) ?? [];

  const linkedIn =
    profile?.links.find((l) => /linkedin/i.test(l.label) || /linkedin\.com/i.test(l.url))
      ?.url ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>ATS Quick-Fill</SheetTitle>
          <SheetDescription>
            {application.companyName ?? "Company"} ·{" "}
            {application.roleTitle ?? "Role"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-2">
            {typeof application.matchScore === "number" && (
              <Badge>Match {application.matchScore}%</Badge>
            )}
            <Badge variant="secondary">Portal</Badge>
          </div>

          {application.matchRationale && (
            <p className="text-sm text-muted-foreground">
              {application.matchRationale}
            </p>
          )}

          {application.actionUrl && (
            <Button asChild variant="outline" className="w-full justify-start">
              <a href={application.actionUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open application portal
              </a>
            </Button>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Copy fields
            </p>
            {[
              ["Full Name", profile?.fullName ?? ""],
              ["Phone", profile?.phone ?? ""],
              ["LinkedIn", linkedIn],
              ["Summary", profile?.summary ?? ""],
              ["Key Bullets", keyBullets.join("\n")],
            ].map(([label, value]) => (
              <Button
                key={label}
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-between"
                disabled={!value}
                onClick={() => void copyText(label, value)}
              >
                {label}
                <Copy className="h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await downloadTailoredPdfAction(application.id);
                if (!result.ok || !result.data) {
                  toast.error(result.ok ? "No PDF" : result.error);
                  return;
                }
                const link = document.createElement("a");
                link.href = `data:application/pdf;base64,${result.data.base64}`;
                link.download = result.data.filename;
                link.click();
              });
            }}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download Tailored PDF
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await markPortalAsApplied(application.id);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Marked as applied");
                onOpenChange(false);
                router.refresh();
              });
            }}
          >
            <Check className="h-4 w-4" />
            Mark as Applied
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAutomateWithAgent(application.id)}
          >
            Automate with agent (soon)
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
