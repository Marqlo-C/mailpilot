"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  persistToolbar,
  readToolbar,
  type ToolbarVariant,
} from "@/lib/ui/toolbar-preference";

const ToolbarThemeContext = createContext<{
  variant: ToolbarVariant;
  setVariant: (next: ToolbarVariant) => void;
  accountId: string | null;
} | null>(null);

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function applyToolbarDataset(variant: ToolbarVariant) {
  if (typeof document === "undefined") return;
  if (variant === "dark") {
    document.documentElement.dataset.mpToolbar = "dark";
  } else {
    document.documentElement.removeAttribute("data-mp-toolbar");
  }
}

export function ToolbarThemeProvider({
  accountId,
  children,
}: {
  accountId: string | null;
  children: ReactNode;
}) {
  const [variant, setVariantState] = useState<ToolbarVariant>("light");

  useClientLayoutEffect(() => {
    if (!accountId) {
      setVariantState("light");
      applyToolbarDataset("light");
      return;
    }
    const next = readToolbar(accountId);
    setVariantState(next);
    applyToolbarDataset(next);
  }, [accountId]);

  const setVariant = useCallback(
    (next: ToolbarVariant) => {
      setVariantState(next);
      applyToolbarDataset(next);
      if (accountId) persistToolbar(accountId, next);
    },
    [accountId]
  );

  const value = useMemo(
    () => ({ variant, setVariant, accountId }),
    [variant, setVariant, accountId]
  );

  return (
    <ToolbarThemeContext.Provider value={value}>
      {children}
    </ToolbarThemeContext.Provider>
  );
}

export function useToolbarTheme() {
  const context = useContext(ToolbarThemeContext);
  if (!context) {
    throw new Error("useToolbarTheme must be used within ToolbarThemeProvider");
  }
  return context;
}
