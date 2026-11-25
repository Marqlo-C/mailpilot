import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Email body shape — short salutation, blank, paragraphs, then sign-off + name.
 * Ace rewrites the message body only (To/Subject stay).
 */
export function EmailDraftBusySkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col px-3 pb-14 pt-2",
        className
      )}
      aria-hidden
    >
      {/* Salutation — e.g. "Hi Alex," */}
      <Skeleton className="h-3 w-[22%] rounded-sm" />

      {/* Blank line after greeting */}
      <div className="h-4 shrink-0" />

      {/* Opening paragraph */}
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3 w-[94%] rounded-sm" />
        <Skeleton className="h-3 w-[88%] rounded-sm" />
        <Skeleton className="h-3 w-[91%] rounded-sm" />
        <Skeleton className="h-3 w-[64%] rounded-sm" />
      </div>

      <div className="h-4 shrink-0" />

      {/* Second paragraph */}
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3 w-[90%] rounded-sm" />
        <Skeleton className="h-3 w-[86%] rounded-sm" />
        <Skeleton className="h-3 w-[78%] rounded-sm" />
        <Skeleton className="h-3 w-[52%] rounded-sm" />
      </div>

      <div className="h-5 shrink-0" />

      {/* Sign-off — e.g. "Best," */}
      <Skeleton className="h-3 w-[14%] rounded-sm" />
      <div className="h-2.5 shrink-0" />
      {/* Name */}
      <Skeleton className="h-3 w-[28%] rounded-sm" />
    </div>
  );
}

export { ResumeDraftBusySkeleton } from "@/components/features/opportunities/drawer/subcomponents/resume-draft-busy-skeleton";
