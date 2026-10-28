"use client";

import { ChevronDown, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRailAction, useRailActionToneClass } from "@/components/ui/rail-action";
import { cn } from "@/lib/utils";

/**
 * Visual stand-in for the tab-rail Sync Inbox control.
 * Neither half starts a sync or opens a menu.
 */
export function SyncInboxSample({ className }: { className?: string }) {
  const { variant } = useRailAction();
  const toneClass = useRailActionToneClass();

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("rounded-r-none border-r-0 shadow-md", toneClass)}
        data-mp-rail-action=""
        aria-label="Sync Inbox sample"
      >
        <RefreshCw className="h-4 w-4" />
        Sync Inbox
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "rounded-l-none px-2 shadow-md",
          toneClass,
          variant === "dark" && "!border-l-[#e4f7f3]/15"
        )}
        data-mp-rail-action=""
        aria-label="Sync Inbox sample menu"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
