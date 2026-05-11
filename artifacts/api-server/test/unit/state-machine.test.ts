import { describe, expect, it } from "vitest";
import { isValidTransition, assertValidTransition } from "../../src/lib/state-machine";

const ALL_STATES = [
  "created",
  "funded",
  "shipped",
  "delivered",
  "complete",
  "disputed",
  "cancelled",
  "refunded",
] as const;

// The CANONICAL transition table — duplicated here intentionally so
// any drift between code and intent is caught.
const LEGAL: Record<(typeof ALL_STATES)[number], string[]> = {
  created: ["funded", "cancelled"],
  funded: ["shipped", "disputed", "cancelled", "refunded"],
  shipped: ["delivered", "disputed", "cancelled"],
  delivered: ["complete", "disputed"],
  complete: [],
  disputed: ["complete", "refunded"],
  cancelled: [],
  refunded: [],
};

describe("state-machine: isValidTransition", () => {
  describe("legal transitions", () => {
    for (const from of ALL_STATES) {
      for (const to of LEGAL[from]) {
        it(`allows ${from} → ${to}`, () => {
          expect(isValidTransition(from, to)).toBe(true);
        });
      }
    }
  });

  describe("illegal transitions", () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (LEGAL[from].includes(to)) continue;
        it(`rejects ${from} → ${to}`, () => {
          expect(isValidTransition(from, to)).toBe(false);
        });
      }
    }
  });

  describe("terminal states have no outbound transitions", () => {
    for (const terminal of ["complete", "cancelled", "refunded"] as const) {
      it(`${terminal} cannot transition anywhere`, () => {
        for (const to of ALL_STATES) {
          expect(isValidTransition(terminal, to)).toBe(false);
        }
      });
    }
  });

  describe("garbage inputs", () => {
    it("rejects unknown from-state", () => {
      expect(isValidTransition("nonsense", "funded")).toBe(false);
    });
    it("rejects unknown to-state", () => {
      expect(isValidTransition("created", "nonsense")).toBe(false);
    });
    it("rejects empty strings", () => {
      expect(isValidTransition("", "")).toBe(false);
    });
    it("rejects same-state transition", () => {
      // A state should never transition to itself
      for (const s of ALL_STATES) {
        expect(isValidTransition(s, s)).toBe(false);
      }
    });
  });

  describe("the fraud-critical paths", () => {
    // These are the transitions where money moves. If any of these break,
    // money will move incorrectly. They must always be allowed.
    it("buyer can fund a created deal (charge happens)", () => {
      expect(isValidTransition("created", "funded")).toBe(true);
    });
    it("buyer can release funds from delivered (transfer happens)", () => {
      expect(isValidTransition("delivered", "complete")).toBe(true);
    });
    it("admin can refund from disputed (refund happens)", () => {
      expect(isValidTransition("disputed", "refunded")).toBe(true);
    });
    it("admin can release from disputed (transfer happens)", () => {
      expect(isValidTransition("disputed", "complete")).toBe(true);
    });
    // These transitions should NEVER be allowed — they would move money illegally
    it("BLOCKS released funds being un-released", () => {
      expect(isValidTransition("complete", "funded")).toBe(false);
      expect(isValidTransition("complete", "refunded")).toBe(false);
    });
    it("BLOCKS skipping the funded step", () => {
      expect(isValidTransition("created", "shipped")).toBe(false);
      expect(isValidTransition("created", "complete")).toBe(false);
    });
    it("BLOCKS releasing funds without delivery", () => {
      // From shipped, must go to delivered first
      expect(isValidTransition("shipped", "complete")).toBe(false);
    });
  });
});

describe("state-machine: assertValidTransition", () => {
  it("returns void on legal transition", () => {
    expect(() => assertValidTransition("created", "funded")).not.toThrow();
  });
  it("throws on illegal transition with informative message", () => {
    expect(() => assertValidTransition("complete", "funded")).toThrow(
      /Illegal state transition.*complete.*funded/,
    );
  });
});
