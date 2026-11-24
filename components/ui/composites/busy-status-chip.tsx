import { Loader } from "@/components/ui/loader";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";

/** Wave + shimmer status chip — floats over template skeletons. */
export function BusyStatusChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none inline-flex items-center gap-2 rounded-md border border-border/60",
        "bg-card/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-sm",
        className
      )}
    >
      <Loader size="sm" />
      <TextShimmer>{label}</TextShimmer>
    </div>
  );
}
