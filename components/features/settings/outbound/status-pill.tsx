"use client";

import * as React from "react";
import { SettingsStatusPill } from "@/components/ui/tactile/settings-status-pill";

export interface OutboundStatusPillProps {
  isRecommended: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Status pill for Outbound tailoring cards.
 * Delegated thin wrapper around SettingsStatusPill for backward compatibility.
 */
export function OutboundStatusPill({
  isRecommended,
  children,
  className,
}: OutboundStatusPillProps) {
  return (
    <SettingsStatusPill
      variant={isRecommended ? "recommended" : "alternative"}
      className={className}
    >
      {children}
    </SettingsStatusPill>
  );
}
