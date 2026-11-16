"use client";

import * as React from "react";

export type NestedCardLevel = 1 | 2 | 3 | 4;

export const NestedCardContext = React.createContext<{ level: NestedCardLevel }>({
  level: 1,
});

export function useNestedCardLevel(): NestedCardLevel {
  return React.useContext(NestedCardContext).level;
}
