/**
 * Canonical legal state transitions.
 * Every state mutation in the system must go through isValidTransition().
 */

type DealState =
  | "pending_seller_acceptance"
  | "pending_buyer_confirmation"
  | "created"
  | "funded"
  | "shipped"
  | "delivered"
  | "complete"
  | "disputed"
  | "cancelled"
  | "refunded";

const LEGAL_TRANSITIONS: Record<DealState, DealState[]> = {
  pending_seller_acceptance: ["created", "cancelled"],
  pending_buyer_confirmation: ["created", "cancelled"],
  created: ["funded", "cancelled"],
  funded: ["shipped", "disputed", "cancelled", "refunded"],
  shipped: ["delivered", "disputed", "cancelled"],
  delivered: ["complete", "disputed"],
  complete: [],
  disputed: ["complete", "refunded"],
  cancelled: [],
  refunded: [],
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = LEGAL_TRANSITIONS[from as DealState];
  if (!allowed) return false;
  return allowed.includes(to as DealState);
}

export function assertValidTransition(from: string, to: string): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Illegal state transition: ${from} → ${to}`);
  }
}
