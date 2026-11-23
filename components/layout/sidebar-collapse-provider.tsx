"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SidebarCollapseContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  tabletDrawerOpen: boolean;
  setTabletDrawerOpen: (open: boolean) => void;
  toggleTabletDrawer: () => void;
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
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(false);
  const collapsedRef = useRef(collapsed);
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);
  const draftOwnedCollapseRef = useRef(false);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const toggleTabletDrawer = useCallback(() => {
    setTabletDrawerOpen((prev) => !prev);
  }, []);

  // Ensure rotating from portrait to landscape (>=1024px) automatically closes the drawer and displays docked sidebar
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handleDesktopChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setTabletDrawerOpen(false);
      }
    };
    handleDesktopChange(mq);
    mq.addEventListener("change", handleDesktopChange);
    return () => {
      mq.removeEventListener("change", handleDesktopChange);
    };
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
      tabletDrawerOpen,
      setTabletDrawerOpen,
      toggleTabletDrawer,
      setDraftResumeSidebarMode,
    }),
    [
      collapsed,
      toggleSidebar,
      tabletDrawerOpen,
      setTabletDrawerOpen,
      toggleTabletDrawer,
      setDraftResumeSidebarMode,
    ]
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
