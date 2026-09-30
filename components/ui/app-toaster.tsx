"use client";

import { Toaster } from "sonner";

/** Centers toasts in the main column; clears the mobile bottom nav. */
export function AppToaster() {
  return (
    <Toaster
      richColors
      position="top-center"
      offset={{ top: 16, bottom: 16 }}
      mobileOffset={{
        top: 16,
        bottom: "calc(16px + var(--app-mobile-bottom-inset, 0px))",
      }}
      style={{
        left: "calc(var(--app-sidebar-width, 0px) + (100vw - var(--app-sidebar-width, 0px)) / 2)",
        right: "auto",
        transform: "translateX(-50%)",
      }}
    />
  );
}
