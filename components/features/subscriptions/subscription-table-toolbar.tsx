"use client";

import {
  SubscriptionsToolbar,
  type SubscriptionsToolbarProps,
} from "@/components/features/subscriptions/subscriptions-toolbar";

export type SubscriptionTableToolbarProps = SubscriptionsToolbarProps;

/**
 * Filter controls and toolbar for the subscriptions view.
 */
export function SubscriptionTableToolbar(props: SubscriptionTableToolbarProps) {
  return <SubscriptionsToolbar {...props} />;
}
