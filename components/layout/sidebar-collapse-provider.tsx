"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SidebarCollapseContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  /**
   * While a dual-pane draft+resume dialog needs width: collapse an expanded
   * sidebar. Restore only if this mode was what collapsed it; leave an
   * already-collapsed sidebar alone.
   */
  setDraftResumeSidebarMode: (active: boolean) => void;
};

const SidebarCollapseContext =
  createContext<SidebarCollapseContextValue | null>(null);

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const draftOwnedCollapseRef = useRef(false);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const setDraftResumeSidebarMode = useCallback((active: boolean) => {
    if (active) {
      if (!collapsedRef.current) {
        draftOwnedCollapseRef.current = true;
        setCollapsed(true);
      }
      return;
    }

    if (draftOwnedCollapseRef.current) {
      draftOwnedCollapseRef.current = false;
      setCollapsed(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleSidebar,
      setDraftResumeSidebarMode,
    }),
    [collapsed, toggleSidebar, setDraftResumeSidebarMode]
  );

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse() {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error(
      "useSidebarCollapse must be used within SidebarCollapseProvider"
    );
  }
  return ctx;
}
