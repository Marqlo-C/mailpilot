import type { ScrapedJobPosting } from "../schema.ssot";

export interface PlatformExtractor {
  name: string;
  matches(html: string, url: string): boolean;
  extract(html: string, url: string): ScrapedJobPosting | null;
}
