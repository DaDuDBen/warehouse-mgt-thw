import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { err } from "@/lib/api";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ── Fetch reservation ──────────────────────────────────────────────────────
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));

  if (!reservation) {
    return err("reservation_not_found", 404);
  }

  // ── Already released (idempotent) ──────────────────────────────────────────
  if (reservation.status === "released") {
    return NextResponse.json(reservation);
  }

  // ── Atomically release reservation and restore stock ───────────────────────
  // CTE drives both mutations in one round-trip: if the reservation UPDATE
  // finds the row, the stock UPDATE fires off the same result set.
  await db.execute(sql`
    WITH res_update AS (
      UPDATE reservations
      SET    status     = 'released',
             updated_at = now()
      WHERE  id = ${id}::uuid
      RETURNING product_id, warehouse_id, quantity
    )
    UPDATE stock s
    SET    reserved   = GREATEST(0, s.reserved - ru.quantity),
           updated_at = now()
    FROM   res_update ru
    WHERE  s.product_id   = ru.product_id
      AND  s.warehouse_id = ru.warehouse_id
  `);

  // Fetch the final state for the response body
  const [updated] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));

  return NextResponse.json(updated);
}
