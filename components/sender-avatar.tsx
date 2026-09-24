"use client";

import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  extractApexDomain,
  faviconUrlForDomain,
  getCleanDomain,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

type SenderAvatarProps = {
  email?: string | null;
  name?: string | null;
  /** Optional explicit brand domain when email is unavailable (e.g. jobs). */
  domain?: string | null;
  className?: string;
};

export function getSenderInitials(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  const source = (name?.trim() || email?.split("@")[0] || "?").trim();
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Displays a brand favicon for custom sender domains, or initials
 * for consumer webmail / unresolved hosts.
 */
export function SenderAvatar({
  email,
  name,
  domain: domainProp,
  className,
}: SenderAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const cleanDomain = useMemo(() => {
    if (email) {
      return getCleanDomain(email);
    }
    if (domainProp) {
      // Reuse apex extraction for explicit domains (jobs action URLs, etc.)
      return extractApexDomain(domainProp);
    }
    return null;
  }, [email, domainProp]);

  const initials = getSenderInitials(name, email);
  const showImage = Boolean(cleanDomain) && !imageFailed;

  return (
    <Avatar className={cn("h-9 w-9", className)}>
      {showImage && cleanDomain ? (
        <AvatarImage
          src={faviconUrlForDomain(cleanDomain)}
          alt={name ?? email ?? cleanDomain}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Best-effort brand domain from an action URL host (skips common ATS hosts).
 */
export function domainFromActionUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const ats = new Set([
      "greenhouse.io",
      "boards.greenhouse.io",
      "lever.co",
      "jobs.lever.co",
      "myworkdayjobs.com",
      "workday.com",
      "ashbyhq.com",
      "jobs.ashbyhq.com",
      "smartrecruiters.com",
      "icims.com",
      "linkedin.com",
      "calendly.com",
    ]);
    if (ats.has(host) || [...ats].some((d) => host.endsWith(`.${d}`))) {
      return null;
    }
    return extractApexDomain(host);
  } catch {
    return null;
  }
}
