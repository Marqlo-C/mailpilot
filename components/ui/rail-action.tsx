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
  railActionSecondaryClass,
  RAIL_ACTION_SURFACE_DARK,
} from "@/components/ui/styles/action-button-styles";
import {
  persistRailAction,
  readRailAction,
  type RailActionVariant,
} from "@/lib/ui/rail-action-preference";

const RailActionContext = createContext<{
  variant: RailActionVariant;
  setVariant: (next: RailActionVariant) => void;
  accountId: string | null;
} | null>(null);

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function RailActionProvider({
  accountId,
  children,
}: {
  accountId: string | null;
  children: ReactNode;
}) {
  const [variant, setVariantState] = useState<RailActionVariant>("light");

  useClientLayoutEffect(() => {
    if (!accountId) {
      setVariantState("light");
      return;
    }
    setVariantState(readRailAction(accountId));
  }, [accountId]);

  const setVariant = useCallback(
    (next: RailActionVariant) => {
      setVariantState(next);
      if (accountId) persistRailAction(accountId, next);
    },
    [accountId]
  );

  const value = useMemo(
    () => ({ variant, setVariant, accountId }),
    [variant, setVariant, accountId]
  );

  return (
    <RailActionContext.Provider value={value}>
      {children}
    </RailActionContext.Provider>
  );
}

export function useRailAction() {
  const context = useContext(RailActionContext);
  if (!context) {
    throw new Error("useRailAction must be used within RailActionProvider");
  }
  return context;
}

/** Boxy secondary action on the tab-rail row, in the saved light or dark plate. */
export function useRailActionClass() {
  const { variant } = useRailAction();
  return railActionSecondaryClass(variant);
}

/** Color-only override for the split Sync Inbox control. Empty when light. */
export function useRailActionToneClass() {
  const { variant } = useRailAction();
  return variant === "dark" ? RAIL_ACTION_SURFACE_DARK : "";
}
