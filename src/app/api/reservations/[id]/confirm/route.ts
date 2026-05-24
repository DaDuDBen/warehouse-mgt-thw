import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reservations, stock } from "@/db/schema";
import { redis } from "@/lib/redis";
import { err, IDEMPOTENCY_TTL } from "@/lib/api";

type CachedResponse = { status: number; body: unknown };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idempotencyKey = req.headers.get("Idempotency-Key");

  // ── Idempotency check ──────────────────────────────────────────────────────
  if (idempotencyKey) {
    const cached = await redis.get<CachedResponse>(`idempotency:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.status });
    }
  }

  // ── Fetch reservation ──────────────────────────────────────────────────────
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));

  if (!reservation) {
    return err("reservation_not_found", 404);
  }

  // ── Expired: atomically release and restore stock ──────────────────────────
  // Single CTE: reservation UPDATE drives the stock UPDATE so both are atomic.
  if (reservation.status === "pending" && reservation.expiresAt < new Date()) {
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

    return err("reservation_expired", 410);
  }

  // ── Already released ───────────────────────────────────────────────────────
  if (reservation.status === "released") {
    return err("reservation_released", 409);
  }

  // ── Already confirmed (idempotent) ─────────────────────────────────────────
  if (reservation.status === "confirmed") {
    return NextResponse.json(reservation);
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  const [updated] = await db
    .update(reservations)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(reservations.id, id))
    .returning();

  if (idempotencyKey) {
    await redis.set(
      `idempotency:${idempotencyKey}`,
      { status: 200, body: updated } satisfies CachedResponse,
      { nx: true, ex: IDEMPOTENCY_TTL }
    );
  }

  return NextResponse.json(updated);
}
