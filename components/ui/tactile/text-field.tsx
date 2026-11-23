"use client";

import * as React from "react";
import { X, type LucideIcon } from "lucide-react";

import {
  FIELD_BARE_CLASSNAME,
  FIELD_INPUT_CLASSNAME,
  FIELD_LEADING_ICON_CLASSNAME,
  FIELD_SHELL_CLASSNAME,
  FIELD_SHELL_GAP_CLASSNAME,
  FIELD_SHELL_GAP_WITH_ICON_CLASSNAME,
  FIELD_SHELL_MULTILINE_CLASSNAME,
  FIELD_SHELL_PAD_CLASSNAME,
  FIELD_SIDEBAR_INPUT_CLASSNAME,
  FIELD_SIDEBAR_LEADING_ICON_CLASSNAME,
  FIELD_SIDEBAR_SHELL_CLASSNAME,
  FIELD_SIDEBAR_SHELL_MULTILINE_CLASSNAME,
  FIELD_SIDEBAR_TRAILING_GHOST_CLASSNAME,
  FIELD_TEXTAREA_CLASSNAME,
  FIELD_TRAILING_GHOST_CLASSNAME,
} from "@/components/ui/styles/field-chrome";
import { cn } from "@/lib/utils";

export type TextFieldVariant = "default" | "bare" | "sidebar";

type FieldChromeProps = {
  /**
   * `default` — search-bar shell (SSOT).
   * `bare` — borderless inline control for embedded cards.
   * `sidebar` — dark flyout shell (same geometry, readable at rest).
   */
  variant?: TextFieldVariant;
  /** Lucide icon component rendered before the control. */
  leadingIcon?: LucideIcon;
  /**
   * Extra classes on the leading icon (e.g. optical size bumps for
   * glyphs that read smaller than Search in the same `size-4` box).
   */
  leadingIconClassName?: string;
  /** Extra trailing controls (after optional clear). */
  trailing?: React.ReactNode;
  /** Show an X ghost when the value is non-empty. */
  clearable?: boolean;
  onClear?: () => void;
  /** Classes on the outer shell (ignored for `bare`). */
  shellClassName?: string;
  /** Classes on the native control. */
  inputClassName?: string;
  /** Monospace value (API keys, emails, model ids). */
  mono?: boolean;
};

type InputNativeProps = Omit<React.ComponentProps<"input">, "size">;
type TextareaNativeProps = React.ComponentProps<"textarea">;

export type TextFieldProps = FieldChromeProps &
  InputNativeProps & {
    multiline?: false;
  };

export type TextAreaFieldProps = FieldChromeProps &
  TextareaNativeProps & {
    multiline: true;
  };

export type AnyTextFieldProps = TextFieldProps | TextAreaFieldProps;

type FieldTrailingButtonProps = React.ComponentProps<"button"> & {
  /** Match dark flyout plate when the control sits in a sidebar field. */
  tone?: "default" | "sidebar";
};

/**
 * Ghost trailing action used inside search-bar fields (clear, mic, filters, save).
 */
export function FieldTrailingButton({
  className,
  tone = "default",
  ...props
}: FieldTrailingButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        tone === "sidebar"
          ? FIELD_SIDEBAR_TRAILING_GHOST_CLASSNAME
          : FIELD_TRAILING_GHOST_CLASSNAME,
        className
      )}
      {...props}
    />
  );
}

/**
 * Search-bar-styled text field. Prefer this (or `Input`, which re-exports it)
 * over ad-hoc bordered inputs.
 */
export const TextField = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  AnyTextFieldProps
>(function TextField(props, ref) {
  const {
    variant = "default",
    leadingIcon: LeadingIcon,
    leadingIconClassName,
    trailing,
    clearable = false,
    onClear,
    shellClassName,
    inputClassName,
    mono = false,
    className,
    disabled,
    multiline,
    ...rest
  } = props as AnyTextFieldProps & { multiline?: boolean };

  const value = "value" in rest ? rest.value : undefined;
  const hasValue =
    value !== undefined && value !== null && String(value).length > 0;
  const showClear =
    clearable && hasValue && !disabled && typeof onClear === "function";
  const isSidebar = variant === "sidebar";
  const usesShell = variant === "default" || isSidebar;

  const controlClassName = cn(
    isSidebar
      ? FIELD_SIDEBAR_INPUT_CLASSNAME
      : multiline
        ? FIELD_TEXTAREA_CLASSNAME
        : FIELD_INPUT_CLASSNAME,
    isSidebar && multiline && "min-h-[4.5rem] resize-y leading-relaxed",
    mono && "font-mono",
    inputClassName,
    !usesShell && className
  );

  const clearButton = showClear ? (
    <FieldTrailingButton
      tone={isSidebar ? "sidebar" : "default"}
      aria-label="Clear"
      disabled={disabled}
      onClick={() => onClear?.()}
    >
      <X className="size-4" aria-hidden />
    </FieldTrailingButton>
  ) : null;

  const leading = LeadingIcon ? (
    <LeadingIcon
      className={cn(
        isSidebar
          ? FIELD_SIDEBAR_LEADING_ICON_CLASSNAME
          : FIELD_LEADING_ICON_CLASSNAME,
        leadingIconClassName
      )}
      aria-hidden
    />
  ) : null;

  if (variant === "bare") {
    if (multiline) {
      return (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          disabled={disabled}
          className={cn(
            FIELD_BARE_CLASSNAME,
            "min-h-20 resize-y text-xs leading-relaxed text-foreground/85",
            controlClassName
          )}
          {...(rest as TextareaNativeProps)}
        />
      );
    }
    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        disabled={disabled}
        className={cn(FIELD_BARE_CLASSNAME, controlClassName)}
        {...(rest as InputNativeProps)}
      />
    );
  }

  return (
    <div
      data-mp-toolbar-field={isSidebar ? undefined : ""}
      className={cn(
        multiline
          ? isSidebar
            ? FIELD_SIDEBAR_SHELL_MULTILINE_CLASSNAME
            : FIELD_SHELL_MULTILINE_CLASSNAME
          : isSidebar
            ? FIELD_SIDEBAR_SHELL_CLASSNAME
            : FIELD_SHELL_CLASSNAME,
        LeadingIcon
          ? FIELD_SHELL_GAP_WITH_ICON_CLASSNAME
          : FIELD_SHELL_GAP_CLASSNAME,
        !multiline && FIELD_SHELL_PAD_CLASSNAME,
        disabled && "opacity-50",
        shellClassName,
        className
      )}
    >
      {leading}
      {multiline ? (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          disabled={disabled}
          className={controlClassName}
          {...(rest as TextareaNativeProps)}
        />
      ) : (
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          disabled={disabled}
          className={controlClassName}
          {...(rest as InputNativeProps)}
        />
      )}
      {(showClear || trailing) && (
        <div className="flex shrink-0 items-center gap-0.5 self-center">
          {clearButton}
          {trailing}
        </div>
      )}
    </div>
  );
});

TextField.displayName = "TextField";
