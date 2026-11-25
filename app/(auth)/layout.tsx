/**
 * Pass-through only. A DOM wrapper here hydrates as `div` vs Next’s `_R_`
 * flight script and triggers Recoverable hydration errors on /login.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
