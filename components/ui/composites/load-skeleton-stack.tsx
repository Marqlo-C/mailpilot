import { Loader } from "@/components/ui/loader";
import { Skeleton } from "@/components/ui/skeleton";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";

export type LoadSkeletonStackProps = {
  message: string;
  className?: string;
  loaderClassName?: string;
  /** Use lighter bars on dark sidebar flyouts. */
  tone?: "default" | "sidebar";
};

/**
 * Shared bootstrap / preview loading stack: shimmer bars + wave + label.
 */
export function LoadSkeletonStack({
  message,
  className,
  loaderClassName,
  tone = "default",
}: LoadSkeletonStackProps) {
  const barClass = tone === "sidebar" ? "bg-white/10" : undefined;
  const shimmerClass =
    tone === "sidebar" ? "via-white/25" : undefined;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="space-y-2">
        <Skeleton
          className={cn("h-3 w-3/4", barClass)}
          shimmerClassName={shimmerClass}
        />
        <Skeleton
          className={cn("h-3 w-1/2", barClass)}
          shimmerClassName={shimmerClass}
        />
        <Skeleton
          className={cn("h-14 w-full", barClass)}
          shimmerClassName={shimmerClass}
        />
      </div>
      <div
        className={cn(
          "flex items-center gap-2 text-xs",
          tone === "sidebar" ? "text-[#e4f7f3]/60" : "text-muted-foreground"
        )}
      >
        <Loader
          size="sm"
          className={cn(
            tone === "sidebar" && "text-[#e4f7f3]",
            loaderClassName
          )}
        />
        <TextShimmer
          className={
            tone === "sidebar"
              ? "[--foreground:172_47%_92%] [--muted-foreground:172_30%_70%]"
              : undefined
          }
        >
          {message}
        </TextShimmer>
      </div>
    </div>
  );
}
