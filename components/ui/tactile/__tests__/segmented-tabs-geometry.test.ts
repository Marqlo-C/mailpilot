import { describe, it, expect } from "vitest";
import {
  commandDeckClassName,
  commandDeckColumnClassName,
  commandDeckBodyClassName,
  commandDeckWideBodyClassName,
} from "../segmented-tabs";

describe("Segmented Tabs Command Deck Geometry", () => {
  it("enforces negative horizontal margins and padding calibrated for 744px tablet breakpoint", () => {
    expect(commandDeckClassName).toContain("min-[744px]:-mx-6");
    expect(commandDeckClassName).toContain("min-[744px]:px-6");
  });

  it("enforces deck column is wider than listing body across all viewport tiers", () => {
    // Column widths: base 100%-16px, sm 100%-24px, md 100%-32px
    // Listing body widths: base 100%-36px, sm 100%-48px, md 100%-56px
    expect(commandDeckColumnClassName).toContain("w-[calc(100%-16px)]");
    expect(commandDeckColumnClassName).toContain("sm:w-[calc(100%-24px)]");
    expect(commandDeckColumnClassName).toContain("md:w-[calc(100%-32px)]");

    expect(commandDeckBodyClassName).toContain("w-[calc(100%-36px)]");
    expect(commandDeckBodyClassName).toContain("sm:w-[calc(100%-48px)]");
    expect(commandDeckBodyClassName).toContain("md:w-[calc(100%-56px)]");
    expect(commandDeckBodyClassName).toContain("max-w-6xl");
  });

  it("ensures wide body (Settings) matches commandDeckColumnClassName", () => {
    expect(commandDeckWideBodyClassName).toContain(commandDeckColumnClassName);
  });

  it("mathematically guarantees toolbar overhangs cards on sub-desktop screens", () => {
    // Parse the subtraction amounts for base, sm, md
    const parseInset = (cls: string, prefix = "") => {
      const regex = new RegExp(
        prefix
          ? `${prefix}:w-\\[calc\\(100%-([0-9]+)px\\)\\]`
          : `(?:^|\\s)w-\\[calc\\(100%-([0-9]+)px\\)\\]`
      );
      const match = cls.match(regex);
      return match ? parseInt(match[1], 10) : 0;
    };

    const tiers = [
      { name: "mobile/base", prefix: "" },
      { name: "tablet portrait (sm)", prefix: "sm" },
      { name: "tablet landscape / small desktop (md)", prefix: "md" },
    ];

    for (const tier of tiers) {
      const deckSub = parseInset(commandDeckColumnClassName, tier.prefix);
      const bodySub = parseInset(commandDeckBodyClassName, tier.prefix);

      // Deck subtracts fewer pixels from 100% than cards body does,
      // which means Width_deck > Width_body
      expect(deckSub).toBeGreaterThan(0);
      expect(bodySub).toBeGreaterThan(0);
      expect(bodySub - deckSub).toBeGreaterThanOrEqual(20);
    }
  });
});
