import { and, eq } from "drizzle-orm";
import { db, dealsTable, stateTransitionsTable } from "@workspace/db";

export async function recordTransition(
  dealId: string,
  fromState: string | null,
  toState: string,
  triggeredBy: string,
  note?: string,
): Promise<void> {
  await db.insert(stateTransitionsTable).values({ dealId, fromState, toState, triggeredBy, note });
}

/**
 * Optimistic concurrency helper.
 * Updates with a version check — throws "Concurrent modification detected" if the version
 * changed underneath us so callers can retry.
 */
export async function transitionDeal(
  dealId: string,
  expectedVersion: number,
  fromState: string,
  newState: typeof dealsTable.$inferSelect["state"],
  patch: Partial<typeof dealsTable.$inferInsert>,
  triggeredBy: string,
  note?: string,
): Promise<typeof dealsTable.$inferSelect> {
  const result = await db
    .update(dealsTable)
    .set({ state: newState, version: expectedVersion + 1, ...patch })
    .where(and(eq(dealsTable.id, dealId), eq(dealsTable.version, expectedVersion)))
    .returning();

  if (result.length === 0) {
    throw new Error("Concurrent modification detected — please retry");
  }

  const updated = result[0];
  await recordTransition(dealId, fromState, newState, triggeredBy, note);
  return updated;
}
