import * as React from "react";
import {
  EmptyState as CompositeEmptyState,
  type EmptyStateProps,
} from "@/components/ui/composites/empty-state";

export interface SubscriptionEmptyStateProps
  extends Omit<EmptyStateProps, "description"> {
  /** Optional body copy alias for backward compatibility. */
  body?: React.ReactNode;
  /** Secondary explanatory description. */
  description?: React.ReactNode;
}

/**
 * Subscriptions domain wrapper around the centralized EmptyState composite.
 * Preserves the `{ title, body }` contract used in subscriptions tab panes.
 */
export function EmptyState({
  body,
  description,
  size = "lg",
  ...props
}: SubscriptionEmptyStateProps) {
  return (
    <CompositeEmptyState
      size={size}
      description={description ?? body}
      {...props}
    />
  );
}
