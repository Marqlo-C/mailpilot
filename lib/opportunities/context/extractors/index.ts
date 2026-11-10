import type { PlatformExtractor } from "./types";
import { indeedExtractor, extractIndeedSemanticDom } from "./indeed";
import { glassdoorExtractor, extractGlassdoorSemanticDom } from "./glassdoor";
import { greenhouseExtractor, extractGreenhouseSemanticDom } from "./greenhouse";
import { leverExtractor, extractLeverSemanticDom } from "./lever";
import { monsterExtractor, extractMonsterSemanticDom } from "./monster";
import { jobleadsExtractor, extractJobleadsSemanticDom } from "./jobleads";

export type { PlatformExtractor };
export {
  indeedExtractor,
  extractIndeedSemanticDom,
  glassdoorExtractor,
  extractGlassdoorSemanticDom,
  greenhouseExtractor,
  extractGreenhouseSemanticDom,
  leverExtractor,
  extractLeverSemanticDom,
  monsterExtractor,
  extractMonsterSemanticDom,
  jobleadsExtractor,
  extractJobleadsSemanticDom,
};

export const PLATFORM_EXTRACTORS: PlatformExtractor[] = [
  indeedExtractor,
  glassdoorExtractor,
  greenhouseExtractor,
  leverExtractor,
  monsterExtractor,
  jobleadsExtractor,
];

export function findMatchingPlatformExtractor(
  html: string,
  url: string
): PlatformExtractor | undefined {
  return PLATFORM_EXTRACTORS.find((extractor) => extractor.matches(html, url));
}
