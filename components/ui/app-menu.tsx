"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToolbarThemeVariant } from "@/components/ui/toolbar-theme";
import { cn } from "@/lib/utils";

/** Light = filter/search chrome; dark = sidebar flyout / bulk plate. */
export type AppMenuSurface = "light" | "dark";

/**
 * Shared menu tokens. Trigger + item type scale together per `size`:
 * - default / compact → `text-xs` (filter bars, settings, ⋮ menus)
 * - meta → `text-[11px]` (page-size Show control)
 */
export const appMenuClassNames = {
  light: {
    trigger:
      "flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/50 bg-card px-3 text-xs font-medium text-foreground shadow-sm outline-none transition-[box-shadow,border-color] hover:bg-card focus-visible:border-border focus-visible:shadow data-[state=open]:border-border data-[state=open]:shadow disabled:cursor-not-allowed disabled:opacity-50",
    triggerCompact:
      "flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm outline-none transition-colors hover:bg-card focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:ring-1 data-[state=open]:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    triggerMeta:
      "flex h-6 w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border/50 bg-card px-2 text-[11px] font-medium text-foreground shadow-md outline-none transition-colors hover:bg-card focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    content:
      "z-50 min-w-[8rem] overflow-hidden rounded-lg border border-border/50 bg-card p-1 text-foreground shadow-md",
    item: "cursor-pointer justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground/80 focus:bg-muted focus:text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5",
    itemMeta:
      "cursor-pointer justify-between gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/80 focus:bg-muted focus:text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:!size-2.5",
    label: "px-2.5 py-1.5 text-xs font-semibold text-foreground",
    separator: "-mx-1 my-1 h-px bg-border/60",
    chevron: "size-3.5 shrink-0 text-muted-foreground/70",
    chevronCompact: "size-3 shrink-0 text-muted-foreground",
    chevronMeta: "size-2.5 shrink-0 text-foreground/70",
  },
  dark: {
    trigger:
      "flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-[#e4f7f3] shadow-none outline-none transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/20 data-[state=open]:bg-[hsl(var(--sidebar-highlight))] data-[state=open]:text-[#e4f7f3] disabled:cursor-not-allowed disabled:opacity-50",
    triggerCompact:
      "flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-[#e4f7f3] shadow-none outline-none transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/20 data-[state=open]:bg-[hsl(var(--sidebar-highlight))] disabled:cursor-not-allowed disabled:opacity-50",
    triggerMeta:
      "flex h-6 w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] font-medium text-[#e4f7f3] shadow-none outline-none transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50",
    content:
      "z-[160] min-w-[8rem] overflow-hidden rounded-lg border border-white/10 bg-[hsl(var(--sidebar-panel))] p-1 text-[#e4f7f3] shadow-md",
    item: "cursor-pointer justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#e4f7f3]/80 focus:bg-white/10 focus:text-[#e4f7f3] data-[highlighted]:bg-white/10 data-[highlighted]:text-[#e4f7f3] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5",
    itemMeta:
      "cursor-pointer justify-between gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[#e4f7f3]/80 focus:bg-white/10 focus:text-[#e4f7f3] data-[highlighted]:bg-white/10 data-[highlighted]:text-[#e4f7f3] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:!size-2.5",
    label: "px-2.5 py-1.5 text-xs font-semibold text-[#e4f7f3]",
    separator: "-mx-1 my-1 h-px bg-white/10",
    chevron: "size-3.5 shrink-0 text-[#e4f7f3]/55",
    chevronCompact: "size-3 shrink-0 text-[#e4f7f3]/55",
    chevronMeta: "size-2.5 shrink-0 text-[#e4f7f3]/55",
  },
} as const;

const AppMenuSurfaceContext = createContext<AppMenuSurface>("light");

export function useAppMenuSurface(): AppMenuSurface {
  return useContext(AppMenuSurfaceContext);
}

export function AppMenuSurfaceProvider({
  surface,
  children,
}: {
  surface: AppMenuSurface;
  children: ReactNode;
}) {
  return (
    <AppMenuSurfaceContext.Provider value={surface}>
      {children}
    </AppMenuSurfaceContext.Provider>
  );
}

type AppMenuContentProps = ComponentPropsWithoutRef<
  typeof DropdownMenuContent
> & {
  surface?: AppMenuSurface;
};

/** Themed panel — pass `surface` once; items/labels/separators inherit it. */
export function AppMenuContent({
  surface = "light",
  className,
  children,
  ...props
}: AppMenuContentProps) {
  return (
    <DropdownMenuContent
      {...props}
      className={cn(appMenuClassNames[surface].content, className)}
    >
      <AppMenuSurfaceProvider surface={surface}>
        {children}
      </AppMenuSurfaceProvider>
    </DropdownMenuContent>
  );
}

export function AppMenuItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuItem>) {
  const surface = useAppMenuSurface();
  return (
    <DropdownMenuItem
      {...props}
      className={cn(appMenuClassNames[surface].item, className)}
    />
  );
}

export function AppMenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuLabel>) {
  const surface = useAppMenuSurface();
  return (
    <DropdownMenuLabel
      {...props}
      className={cn(appMenuClassNames[surface].label, className)}
    />
  );
}

export function AppMenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuSeparator>) {
  const surface = useAppMenuSurface();
  return (
    <DropdownMenuSeparator
      {...props}
      className={cn(appMenuClassNames[surface].separator, className)}
    />
  );
}

export type AppMenuOption = {
  value: string;
  label: ReactNode;
};

type AppMenuSelectProps = {
  id?: string;
  value: string;
  options: readonly AppMenuOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  surface?: AppMenuSurface;
  /** Field height: default h-8, compact h-7 (filters), meta h-6 (page size). */
  size?: "default" | "compact" | "meta";
  /**
   * When true, the open menu locks to the trigger’s rendered width.
   * Measured option width is applied as `minWidth` only — `className`
   * (`w-full`, flex-1, etc.) can still make the bar wider than content.
   */
  matchTriggerWidth?: boolean;
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  "aria-label"?: string;
};

/**
 * Custom select — same chrome as FlyoutSelect (dark) / filter selects (light).
 * Replaces native `<select>` system pickers.
 */
export function AppMenuSelect({
  id,
  value,
  options,
  placeholder,
  disabled,
  onChange,
  className,
  triggerClassName,
  surface = "light",
  size = "default",
  matchTriggerWidth = true,
  modal = true,
  onOpenChange,
  align = "start",
  "aria-label": ariaLabel,
}: AppMenuSelectProps) {
  const selected = options.find((option) => option.value === value);
  const tokens = appMenuClassNames[surface];
  const triggerTone =
    size === "meta"
      ? tokens.triggerMeta
      : size === "compact"
        ? tokens.triggerCompact
        : tokens.trigger;
  const chevronTone =
    size === "meta"
      ? tokens.chevronMeta
      : size === "compact"
        ? tokens.chevronCompact
        : tokens.chevron;
  // Item type tracks trigger size so the open menu matches the closed bar.
  const itemTone = size === "meta" ? tokens.itemMeta : tokens.item;
  const checkClass =
    size === "meta" ? "size-2.5 shrink-0" : "size-3.5 shrink-0";
  const measureRef = useRef<HTMLDivElement>(null);
  const [menuWidthPx, setMenuWidthPx] = useState<number | undefined>();

  // Floor the trigger at the widest option + check. Callers may still
  // stretch wider via `w-full` / flex — never shrink below content.
  useLayoutEffect(() => {
    if (!matchTriggerWidth) {
      setMenuWidthPx(undefined);
      return;
    }
    const root = measureRef.current;
    if (!root) return;
    let widest = 0;
    root.querySelectorAll<HTMLElement>("[data-app-menu-measure-row]").forEach(
      (row) => {
        widest = Math.max(widest, row.scrollWidth);
      }
    );
    // Panel `p-1` (8) + content border (2).
    const next = widest > 0 ? Math.ceil(widest + 10) : undefined;
    setMenuWidthPx((prev) => (prev === next ? prev : next));
  }, [options, size, surface, placeholder, matchTriggerWidth]);

  // Default: fill parent (`w-full`). Opt into content-hug with `w-auto`
  // (toolbar filters / page size) — measured minWidth still floors the bar.
  const hugContent =
    !matchTriggerWidth ||
    /(?:^|\s)!?w-auto(?:\s|$)/.test(className ?? "");

  return (
    <div
      className={cn(
        "relative max-w-full min-w-0",
        hugContent ? "inline-flex" : "flex w-full"
      )}
    >
      {matchTriggerWidth ? (
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none fixed left-[-10000px] top-0 w-max"
        >
          {(options.length > 0
            ? options
            : [{ value: "_", label: placeholder ?? "Select" }]
          ).map((option) => (
            <div
              key={option.value}
              data-app-menu-measure-row=""
              className={cn(
                "flex w-max items-center justify-between",
                itemTone
              )}
            >
              <span className="whitespace-nowrap">{option.label}</span>
              <Check className={checkClass} />
            </div>
          ))}
        </div>
      ) : null}
      <DropdownMenu modal={modal} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled || options.length === 0}
            aria-label={ariaLabel}
            style={
              menuWidthPx != null
                ? ({ minWidth: menuWidthPx } as const)
                : undefined
            }
            className={cn(
              triggerTone,
              hugContent && "!w-auto",
              triggerClassName,
              className
            )}
          >
            <span className="whitespace-nowrap">
              {selected?.label ?? placeholder ?? "Select"}
            </span>
            <ChevronDown className={chevronTone} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <AppMenuContent
          surface={surface}
          align={align}
          className={cn(
            matchTriggerWidth
              ? // Lock to trigger — overrides content/base `min-w-[8rem]`.
                "w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]"
              : // Drop token `min-w-[8rem]` for compact menus (page size).
                "w-max min-w-0"
          )}
        >
          {options.length === 0 ? (
            <AppMenuItem disabled className={itemTone}>
              {placeholder ?? "No options"}
            </AppMenuItem>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <AppMenuItem
                  key={option.value}
                  onSelect={() => {
                    if (option.value === value) return;
                    onChange(option.value);
                  }}
                  className={cn(itemTone, "justify-between")}
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  <Check
                    className={cn(
                      checkClass,
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                </AppMenuItem>
              );
            })
          )}
        </AppMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Filter/sort/page-size select that tracks the toolbar light/dark preference. */
export function ToolbarMenuSelect(
  props: Omit<AppMenuSelectProps, "surface" | "size"> & {
    size?: AppMenuSelectProps["size"];
  }
) {
  const variant = useToolbarThemeVariant();
  return (
    <AppMenuSelect
      {...props}
      surface={variant}
      size={props.size ?? "compact"}
      modal={false}
      // Toolbar controls hug content (or an explicit min-w), not the search field.
      className={cn("w-auto", props.className)}
    />
  );
}
