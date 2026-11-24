import type { SVGProps } from "react";

import { FileRotateIcon } from "@/components/ui/icons/file-rotate-icon";
import { FileSparklesIcon } from "@/components/ui/icons/file-sparkles-icon";
import { MailRotateIcon } from "@/components/ui/icons/mail-rotate-icon";
import { ACE_REGEN_STROKE } from "@/components/ui/icons/sparkles-accents";

export type AceRegenIconProps = SVGProps<SVGSVGElement> & {
  target: "email" | "resume";
  /** First-time resume create (sparkles); otherwise rewrite (rotate). */
  create: boolean;
};

/**
 * Ace generate / regenerate square — target + verb at a glance.
 * Resume create → file+sparkles; resume rewrite → file+rotate; email → mail+rotate.
 */
export function AceRegenIcon({
  target,
  create,
  width = 17,
  height = 17,
  className,
  ...props
}: AceRegenIconProps) {
  const shared = {
    width,
    height,
    className,
    ...props,
    strokeWidth: ACE_REGEN_STROKE,
  };
  if (target === "resume" && create) {
    return <FileSparklesIcon {...shared} />;
  }
  if (target === "resume") {
    return <FileRotateIcon {...shared} />;
  }
  return <MailRotateIcon {...shared} />;
}
