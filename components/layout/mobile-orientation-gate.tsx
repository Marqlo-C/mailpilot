"use client";

import React from "react";
import { Smartphone, RotateCcw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export type MobileOrientationGateProps = {
  className?: string;
};

/**
 * MobileOrientationGate
 *
 * Full-screen blocking canvas active exclusively on smartphones held in portrait orientation
 * (max-width: 743px and orientation: portrait).
 *
 * Prompts the user to rotate their device into landscape orientation to access MailPilot's
 * high-density desktop-grade interface. When rotated or on tablet/desktop viewports (>=744px),
 * the gate is completely hidden and inert via CSS media queries.
 */
export function MobileOrientationGate({ className }: MobileOrientationGateProps) {
  return (
    <aside
      data-mobile-orientation-gate
      aria-label="Device orientation required"
      aria-live="polite"
      role="status"
      className={cn(
        "fixed inset-0 z-[100] hidden select-none flex-col items-center justify-center p-6 text-center",
        "bg-[#101418] text-[#e4f7f3]",
        "[@media(max-width:743px)_and_(orientation:portrait)]:flex",
        "portrait:max-[743px]:flex",
        className
      )}
    >
      {/* Brand icon mark */}
      <div className="mb-6 flex items-center justify-center">
        <Logo variant="icon" size="lg" />
      </div>

      {/* Tactile animated device rotation icon */}
      <div
        className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-sm"
        aria-hidden="true"
      >
        <Smartphone className="h-8 w-8 text-primary animate-pulse transition-transform" />
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-[#181e26] text-primary shadow">
          <RotateCcw className="h-3.5 w-3.5 animate-spin [animation-duration:6s]" />
        </span>
      </div>

      {/* Title */}
      <h2 className="text-lg font-semibold tracking-tight text-white">
        Rotate to Landscape
      </h2>

      {/* Explanatory copy */}
      <p className="mt-1.5 max-w-xs text-xs text-white/60">
        MailPilot is a dense workstation designed for wide displays. Please turn
        your phone to landscape mode to continue.
      </p>
    </aside>
  );
}
