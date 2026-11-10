import { cookies } from "next/headers";
import {
  outboundAccordionCookieKey,
  automationAccordionCookieKey,
  ollamaAccordionCookieKey,
  parseOutboundAccordion,
  parseAutomationAccordion,
  parseOllamaAccordion,
  type StoredOutboundAccordionState,
  type StoredAutomationAccordionState,
  type StoredOllamaAccordionState,
  DEFAULT_OUTBOUND_ACCORDION,
  DEFAULT_AUTOMATION_ACCORDION,
  DEFAULT_OLLAMA_ACCORDION,
} from "./settings-accordion";

export type SettingsServerAccordions = {
  outbound: StoredOutboundAccordionState;
  automation: StoredAutomationAccordionState;
  ollama: StoredOllamaAccordionState;
};

/**
 * Server-side helper to read persistent accordion and collapse states directly from request cookies.
 * Enables Next.js Server Components to render the exact target card collapse state on SSR,
 * eliminating client layout shift, double-rendering, and delayed paint flash on Settings droppable cards.
 */
export async function readServerSettingsAccordions(
  accountId?: string | null
): Promise<SettingsServerAccordions> {
  try {
    const cookieStore = await cookies();

    // 1. Outbound Accordion
    let outbound = DEFAULT_OUTBOUND_ACCORDION;
    const outboundKey = outboundAccordionCookieKey(accountId ?? null);
    const outboundRaw = cookieStore.get(outboundKey)?.value;
    const parsedOutbound = parseOutboundAccordion(outboundRaw ?? null);
    if (parsedOutbound) {
      outbound = parsedOutbound;
    } else if (accountId) {
      const globalOutboundRaw = cookieStore.get(
        outboundAccordionCookieKey(null)
      )?.value;
      const parsedGlobalOutbound = parseOutboundAccordion(
        globalOutboundRaw ?? null
      );
      if (parsedGlobalOutbound) {
        outbound = parsedGlobalOutbound;
      }
    }

    // 2. Automation Accordion
    let automation = DEFAULT_AUTOMATION_ACCORDION;
    const automationKey = automationAccordionCookieKey(accountId ?? null);
    const automationRaw = cookieStore.get(automationKey)?.value;
    const parsedAutomation = parseAutomationAccordion(automationRaw ?? null);
    if (parsedAutomation) {
      automation = parsedAutomation;
    } else if (accountId) {
      const globalAutomationRaw = cookieStore.get(
        automationAccordionCookieKey(null)
      )?.value;
      const parsedGlobalAutomation = parseAutomationAccordion(
        globalAutomationRaw ?? null
      );
      if (parsedGlobalAutomation) {
        automation = parsedGlobalAutomation;
      }
    }

    // 3. Ollama Accordion
    let ollama = DEFAULT_OLLAMA_ACCORDION;
    const ollamaKey = ollamaAccordionCookieKey(accountId ?? null);
    const ollamaRaw = cookieStore.get(ollamaKey)?.value;
    const parsedOllama = parseOllamaAccordion(ollamaRaw ?? null);
    if (parsedOllama) {
      ollama = parsedOllama;
    } else if (accountId) {
      const globalOllamaRaw = cookieStore.get(
        ollamaAccordionCookieKey(null)
      )?.value;
      const parsedGlobalOllama = parseOllamaAccordion(
        globalOllamaRaw ?? null
      );
      if (parsedGlobalOllama) {
        ollama = parsedGlobalOllama;
      }
    }

    return { outbound, automation, ollama };
  } catch {
    return {
      outbound: DEFAULT_OUTBOUND_ACCORDION,
      automation: DEFAULT_AUTOMATION_ACCORDION,
      ollama: DEFAULT_OLLAMA_ACCORDION,
    };
  }
}
