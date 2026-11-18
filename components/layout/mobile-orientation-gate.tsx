"use client";

import type React from "react";

export type MobileOrientationGateProps = {
  className?: string;
};

/**
 * MobileOrientationGate
 *
 * Previously displayed a full-screen blocking wall on smartphones held in portrait (<744px).
 * Made inert/safe so mobile users in portrait are never locked out of MailPilot.
 */
export function MobileOrientationGate(_props: MobileOrientationGateProps): React.JSX.Element | null {
  return null;
}
