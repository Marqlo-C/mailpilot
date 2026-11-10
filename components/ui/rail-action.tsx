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

function applyRailActionDataset(variant: RailActionVariant) {
  if (typeof document === "undefined") return;
  if (variant === "dark") {
    document.documentElement.dataset.mpRailAction = "dark";
  } else {
    document.documentElement.removeAttribute("data-mp-rail-action");
  }
}

export function RailActionProvider({
  accountId,
  initialVariant,
  children,
}: {
  accountId: string | null;
  initialVariant?: RailActionVariant;
  children: ReactNode;
}) {
  const [variant, setVariantState] = useState<RailActionVariant>(
    () => initialVariant ?? (accountId ? readRailAction(accountId) : "light")
  );

  useClientLayoutEffect(() => {
    if (!accountId) {
      setVariantState("light");
      applyRailActionDataset("light");
      return;
    }
    const current = readRailAction(accountId);
    setVariantState((prev) => (prev === current ? prev : current));
    applyRailActionDataset(current);
  }, [accountId]);

  const setVariant = useCallback(
    (next: RailActionVariant) => {
      setVariantState(next);
      applyRailActionDataset(next);
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
