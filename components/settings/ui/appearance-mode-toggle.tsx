"use client";

import { useTabRailClasses } from "@/components/ui/tactile/segmented-tabs";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export type AppearanceMode = (typeof OPTIONS)[number]["value"];

/** Light / dark choice in a settings card title, matching the header control slot. */
export function AppearanceModeToggle({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: AppearanceMode;
  onChange: (next: AppearanceMode) => void;
  disabled?: boolean;
  label: string;
}) {
  const { listClassName, triggerClassName } = useTabRailClasses();

  return (
    <div
      className={listClassName}
      data-mp-tab-rail=""
      role="radiogroup"
      aria-label={label}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-state={value === option.value ? "active" : "inactive"}
          className={triggerClassName}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
