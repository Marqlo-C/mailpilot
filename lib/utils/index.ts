import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export * from "./company-logo";
export * from "./date";
export * from "./domain";
export * from "./format-distance";
export * from "./bridge-scripts";
export * from "./format";
export * from "./layout";
export * from "./location";
export * from "./url";
