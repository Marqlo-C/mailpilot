/**
 * ============================================================================
 * WEB SCRAPING PROXY DISPATCHER
 *
 * Centralized proxy dispatcher governing external bot-bypass scraping networks
 * (ScrapingAnt and HasData).
 *
 * Governed by the `web_scraping_proxies` feature flag:
 * - When enabled: Resolves BYOK credentials and dispatches requests to proxy networks.
 * - When disabled (Direct Egress Fallback): Bypasses third-party proxy egress,
 *   surfaces direct links, and returns skip status without executing external HTTP requests.
 * ============================================================================
 */

import { isFeatureEnabled } from "@/lib/core/feature-flags";
import type { AccountRules } from "@/lib/validations/rules.schema";
import {
  resolveDecryptedScrapingAntKey,
  resolveDecryptedHasDataKey,
} from "@/lib/ai/vault";

/**
 * Standardized result envelope returned when executing through proxy dispatcher.
 */
export type ProxyDispatchResult<T> =
  | { executed: true; data: T }
  | { executed: false; reason: "PROXIES_DISABLED" | "MISSING_KEY" | "EXECUTION_ERROR"; error?: string };

/**
 * Evaluates whether web scraping proxies are permitted under active account rules
 * and emergency system kill-switches.
 *
 * @param rules Optional account rules configuration
 * @returns Boolean indicating whether proxy dispatch is enabled
 */
export function isWebScrapingProxiesEnabled(
  rules?: Partial<AccountRules> | null
): boolean {
  return isFeatureEnabled("web_scraping_proxies", rules);
}

/**
 * Dispatches a ScrapingAnt operation, verifying feature flag enablement and BYOK key.
 * If proxies are disabled or the key is absent, returns skipped status without network egress.
 *
 * @param rules Account rules configuration
 * @param operation Callback that executes the ScrapingAnt call with decrypted API key
 * @returns Standardized ProxyDispatchResult
 */
export async function dispatchScrapingAnt<T>(
  rules: Partial<AccountRules> | null | undefined,
  operation: (apiKey: string) => Promise<T>
): Promise<ProxyDispatchResult<T>> {
  if (!isWebScrapingProxiesEnabled(rules)) {
    return { executed: false, reason: "PROXIES_DISABLED" };
  }

  const apiKey = resolveDecryptedScrapingAntKey(rules);
  if (!apiKey) {
    return { executed: false, reason: "MISSING_KEY" };
  }

  try {
    const data = await operation(apiKey);
    return { executed: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { executed: false, reason: "EXECUTION_ERROR", error: message };
  }
}

/**
 * Dispatches a HasData operation, verifying feature flag enablement and BYOK key.
 * If proxies are disabled or the key is absent, returns skipped status without network egress.
 *
 * @param rules Account rules configuration
 * @param operation Callback that executes the HasData call with decrypted API key
 * @returns Standardized ProxyDispatchResult
 */
export async function dispatchHasData<T>(
  rules: Partial<AccountRules> | null | undefined,
  operation: (apiKey: string) => Promise<T>
): Promise<ProxyDispatchResult<T>> {
  if (!isWebScrapingProxiesEnabled(rules)) {
    return { executed: false, reason: "PROXIES_DISABLED" };
  }

  const apiKey = resolveDecryptedHasDataKey(rules);
  if (!apiKey) {
    return { executed: false, reason: "MISSING_KEY" };
  }

  try {
    const data = await operation(apiKey);
    return { executed: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { executed: false, reason: "EXECUTION_ERROR", error: message };
  }
}
