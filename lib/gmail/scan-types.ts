export const SCAN_DAY_OPTIONS = [5, 10, 15, 30] as const;
export type ScanDays = (typeof SCAN_DAY_OPTIONS)[number];
