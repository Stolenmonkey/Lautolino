import { describe, it, expect } from "vitest";
import { wortCase } from "@silbenflug/core";

describe("wortCase", () => {
  it("Substantive und Namen immer groß, andere Wörter immer klein", () => {
    for (const r of [0, 0.49, 0.5, 0.99]) {
      expect(wortCase("lama", () => r)).toBe("Lama");
      expect(wortCase("mama", () => r)).toBe("Mama");
      expect(wortCase("tom", () => r)).toBe("Tom");
      expect(wortCase("malen", () => r)).toBe("malen");
      expect(wortCase("der", () => r)).toBe("der");
    }
  });
  it("Pseudowörter und mehrdeutige Wörter bleiben zufällig, rng wird immer einmal verbraucht", () => {
    expect(wortCase("essen", () => 0.1)).toBe("Essen");
    expect(wortCase("essen", () => 0.9)).toBe("essen");
    expect(wortCase("elo", () => 0.1)).toBe("Elo");
    let n = 0; wortCase("lama", () => { n++; return 0; }); expect(n).toBe(1);
  });
});
