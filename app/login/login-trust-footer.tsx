"use client";

import { ShieldCheck } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function LoginTrustFooter() {
  return (
    <div className="border-t border-border bg-muted/60 px-3 py-2.5">
      <div className="flex items-start gap-1.5">
        <ShieldCheck className="mt-px size-3 shrink-0 text-teal-600/80" />
        <div className="min-w-0 text-left">
          <p className="text-[10px] font-medium leading-snug text-muted-foreground/90">
            Secured via Google OAuth
          </p>
          <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground/65">
            Mailbox access is limited to inbox automation and application
            dispatch. Enable Google 2-Step Verification.{" "}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                  >
                    Learn more about the risks
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[260px] text-left font-normal leading-relaxed"
                >
                  Mail Pilot requests Google profile identity plus Gmail modify
                  and compose scopes so it can read triage signals, apply
                  labels/trash for cleanup, and create or send application
                  drafts you approve. Tokens stay on this app&apos;s server for
                  your linked accounts; revoke access anytime in your Google
                  Account security settings.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>
        </div>
      </div>
    </div>
  );
}
