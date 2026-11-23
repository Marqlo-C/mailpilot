import * as React from "react";

import {
  TextField,
  type AnyTextFieldProps,
} from "@/components/ui/tactile/text-field";

/**
 * App-wide text input — search-bar chrome via `TextField`.
 * Use `variant="bare"` for borderless card embeds, `variant="sidebar"` for flyouts.
 */
const Input = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  AnyTextFieldProps
>(function Input(props, ref) {
  return <TextField ref={ref} {...props} />;
});
Input.displayName = "Input";

export { Input };
export type { AnyTextFieldProps as InputProps };
