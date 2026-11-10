/**
 * NLP Verb Harmonization & Inflection Engine.
 * Converts passive / robotic phrasings into active past-tense systems engineering verbs.
 */

export const ADJECTIVE_PAST_PARTICIPLES = new Set([
  "distributed",
  "structured",
  "unstructured",
  "shared",
  "isolated",
  "federated",
  "automated",
  "customized",
  "centralized",
  "decoupled",
  "authenticated",
  "encrypted",
  "normalized",
  "indexed",
  "bounded",
  "sharded",
]);

const IRREGULAR_PARTICIPLE_TO_PAST: Record<string, string> = {
  binding: "Bound",
  building: "Built",
  holding: "Held",
  making: "Made",
  running: "Ran",
  writing: "Wrote",
};

export function convertParticipleToPastTense(participle: string): string | null {
  if (IRREGULAR_PARTICIPLE_TO_PAST[participle]) {
    return IRREGULAR_PARTICIPLE_TO_PAST[participle];
  }

  if (!participle.endsWith("ing")) return null;
  const stem = participle.slice(0, -3);

  if (
    stem.endsWith("er") ||
    stem.endsWith("ur") ||
    stem.endsWith("or") ||
    stem.endsWith("ar")
  ) {
    return stem.charAt(0).toUpperCase() + stem.slice(1) + "ed";
  }
  if (stem.endsWith("e")) {
    return stem.charAt(0).toUpperCase() + stem.slice(1) + "d";
  }
  if (/[^aeiou][bcdfgklmnprstvz]$/i.test(stem)) {
    return stem.charAt(0).toUpperCase() + stem.slice(1) + "ed";
  }
  return stem.charAt(0).toUpperCase() + stem.slice(1) + "ed";
}

const IRREGULAR_PAST_TO_PARTICIPLE: Record<string, string> = {
  built: "building",
  held: "holding",
  made: "making",
  ran: "running",
  wrote: "writing",
  led: "leading",
  kept: "keeping",
  found: "finding",
  bound: "binding",
  sent: "sending",
};

export function convertPastTenseToParticiple(verb: string): string | null {
  const lower = verb.toLowerCase();
  const clean = lower === "identifyed" ? "identified" : lower;

  if (IRREGULAR_PAST_TO_PARTICIPLE[clean]) {
    return IRREGULAR_PAST_TO_PARTICIPLE[clean];
  }

  let stem = clean;
  if (stem.endsWith("ed")) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith("d")) {
    stem = stem.slice(0, -1);
  } else {
    return null;
  }

  if (stem.endsWith("i")) {
    return stem.slice(0, -1) + "ying";
  }
  if (stem.endsWith("e")) {
    return stem.slice(0, -1) + "ing";
  }

  if (
    stem.endsWith("prov") ||
    stem.endsWith("clos") ||
    stem.endsWith("at") ||
    stem.endsWith("duc") ||
    stem.endsWith("cut") ||
    stem.endsWith("lut") ||
    stem.endsWith("bl") ||
    stem.endsWith("dl") ||
    stem.endsWith("tl") ||
    stem.endsWith("lin") ||
    stem.endsWith("min") ||
    stem.endsWith("vin") ||
    stem.endsWith("sin")
  ) {
    return stem + "ing";
  }

  if (/^[a-z]*[^aeiou][aeiou][bcdfgklmnprstvz]$/i.test(stem) && stem.length <= 4) {
    return stem + stem.slice(-1) + "ing";
  }

  return stem + "ing";
}

/**
 * Unrolls permissive/spectator phrasing ("Allowed users to...") into Systems-Engine actions.
 */
export function unrollPermissivePhrasing(bullet: string): string {
  const match = bullet.match(
    /^(?:Allowed|Enabled|Permitted|Allowing|Enabling|Permitting)\s+users\s+(?:to\s+)?([a-z]+)\s+(.+)$/i
  );
  if (!match) return bullet;

  const verb = match[1].toLowerCase();
  const rest = match[2].trim();

  if (verb === "create" || verb === "build" || verb === "generate") {
    const customMatch = rest.match(
      /^(?:a\s+)?custom\s+([a-zA-Z0-9_\-]+)(?:\s+(?:packs?|creator|pipeline|system|engine|workflow))?\s*(.*)$/i
    );
    if (customMatch) {
      const noun = customMatch[1].replace(/s$/, "");
      const remainder = customMatch[2] ? ` ${customMatch[2]}` : "";
      return `Engineered custom ${noun} creation${remainder}`;
    }
    return `Engineered ${rest}`;
  }

  const verbTemplates: Record<string, string> = {
    upload: `Implemented ingestion pipelines for ${rest}`,
    import: `Implemented ingestion pipelines for ${rest}`,
    ingest: `Implemented ingestion pipelines for ${rest}`,
    download: `Automated export workflows for ${rest}`,
    export: `Automated export workflows for ${rest}`,
    configure: `Architected customization options for ${rest}`,
    customize: `Architected customization options for ${rest}`,
    manage: `Engineered management capabilities for ${rest}`,
    organize: `Engineered management capabilities for ${rest}`,
    view: `Instrumented monitoring and visualization for ${rest}`,
    monitor: `Instrumented monitoring and visualization for ${rest}`,
    track: `Instrumented monitoring and visualization for ${rest}`,
    search: `Engineered query and discovery mechanisms for ${rest}`,
    query: `Engineered query and discovery mechanisms for ${rest}`,
    filter: `Engineered query and discovery mechanisms for ${rest}`,
  };

  return verbTemplates[verb] ?? `Engineered ${rest}`;
}

/**
 * Unrolls robotic heading-prefix templates.
 */
export function unrollRoboticHeadingPrefix(bullet: string): string {
  const prefixRegex =
    /^(?:Designed|Implemented|Developed|Engineered|Architected)\s+(?:an?|the)\s+([A-Z][a-zA-Z0-9_\- &()/]+?)\s+(?:system|mechanism|engine|pipeline|module|infrastructure|cover|mode)\s*,\s*([a-z]+ing)\s+/i;

  const match = bullet.match(prefixRegex);
  if (!match) return bullet;

  const participle = match[2].toLowerCase();
  const pastTense = convertParticipleToPastTense(participle);
  if (!pastTense) return bullet;

  return bullet.replace(prefixRegex, `${pastTense} `);
}

/**
 * Harmonizes compound predicate coordination across both directions.
 */
export function harmonizeCoordinatedVerbs(bullet: string): string {
  let result = bullet;

  result = result.replace(
    /^([A-Z][a-z]+(?:ed|t|ilt|ound|ung|ept|aught|ought|rew|rote|ade|ted|sed|ded|ked|red|med|ned))\b(.+?\band\s+)([a-z]+ing)\b/g,
    (_match, leadVerb, middle, participle) => {
      if (
        /^(?:learning|caching|training|matching|parsing|routing|testing|rendering|typing|styling|profiling)$/i.test(
          participle
        )
      ) {
        return _match;
      }
      const converted = convertParticipleToPastTense(participle);
      if (converted) {
        return `${leadVerb}${middle}${converted.toLowerCase()}`;
      }
      return _match;
    }
  );

  result = result.replace(
    /(^|,\s*|\b(?:including|by|for|while|through|without|after|before)\s+)([a-zA-Z]+ing)\b([^,;]*?\band\s+)([a-zA-Z]+(?:ed|d|t|yed))\b/gi,
    (match, intro, gerund, middle, pastVerb) => {
      if (ADJECTIVE_PAST_PARTICIPLES.has(pastVerb.toLowerCase())) {
        return match;
      }
      const converted = convertPastTenseToParticiple(pastVerb);
      if (converted) {
        return `${intro}${gerund}${middle}${converted}`;
      }
      return match;
    }
  );

  result = result.replace(
    /((?:^|,\s*|\b(?:including|by|for|while|through|without|after|before)\s+)(?:[a-zA-Z]+ing\b[^,;]+,\s*)+and\s+)([a-zA-Z]+(?:ed|d|t|yed))\b/gi,
    (match, prefix, pastVerb) => {
      if (ADJECTIVE_PAST_PARTICIPLES.has(pastVerb.toLowerCase())) {
        return match;
      }
      const converted = convertPastTenseToParticiple(pastVerb);
      if (converted) {
        return `${prefix}${converted}`;
      }
      return match;
    }
  );

  return result;
}

export const VERB_ALTERNATIVES: Record<string, string[]> = {
  Configured: ["Architected", "Engineered", "Orchestrated", "Implemented", "Established"],
  Designed: ["Engineered", "Architected", "Developed", "Formulated", "Constructed"],
  Developed: ["Engineered", "Constructed", "Built", "Architected", "Implemented"],
  Implemented: ["Engineered", "Executed", "Constructed", "Built", "Architected"],
  Engineered: ["Architected", "Constructed", "Developed", "Built", "Implemented"],
  Automated: ["Streamlined", "Orchestrated", "Programmed", "Engineered"],
  Built: ["Constructed", "Engineered", "Developed", "Architected"],
  Serialized: ["Structured", "Stored", "Encoded", "Persisted", "Formatted"],
  Materialized: ["Implemented", "Constructed", "Generated", "Rendered", "Developed"],
  Dispatched: ["Orchestrated", "Executed", "Routed", "Triggered", "Coordinated"],
  Synchronized: ["Aligned", "Integrated", "Coordinated", "Reconciled"],
};

/**
 * Diversifies leading action verbs across bullets on the same project card.
 */
export function diversifyLeadingVerbs(bullets: string[]): string[] {
  const activeVerbs = new Set<string>();
  for (const bullet of bullets) {
    const match = bullet.match(/^([A-Z][a-z]+)\b/);
    if (match) activeVerbs.add(match[1]!);
  }

  const seenVerbs = new Map<string, number>();

  return bullets.map((bullet) => {
    const match = bullet.match(/^([A-Z][a-z]+)\b/);
    if (!match) return bullet;

    const leadVerb = match[1]!;
    const count = seenVerbs.get(leadVerb) ?? 0;
    seenVerbs.set(leadVerb, count + 1);

    if (count > 0 && VERB_ALTERNATIVES[leadVerb]) {
      const alternatives = VERB_ALTERNATIVES[leadVerb]!;
      let chosen = alternatives.find((alt) => !activeVerbs.has(alt));
      if (!chosen) {
        chosen = alternatives[(count - 1) % alternatives.length]!;
      }
      activeVerbs.add(chosen);
      return bullet.replace(new RegExp(`^${leadVerb}\\b`), chosen);
    }

    return bullet;
  });
}
