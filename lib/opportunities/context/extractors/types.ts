import type { ScrapedJobPosting } from "../context.schema";

export interface PlatformExtractor {
  name: string;
  matches(html: string, url: string): boolean;
  extract(html: string, url: string): ScrapedJobPosting | null;
}
