import { Suspense } from "react";

import { LoginView } from "@/components/features/login/login-view";

/**
 * Explicit Suspense root keeps the page slot stable under Next 16.4.
 * Login UI is sync; auth query params are read client-side in LoginAuthControls.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
