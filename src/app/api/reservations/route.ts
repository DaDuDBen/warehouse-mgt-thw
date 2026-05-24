import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Reservation } from "@/db/schema";
import { redis } from "@/lib/redis";
import { createReservationRequestSchema } from "@/lib/schemas";
import { err, parseBody, IDEMPOTENCY_TTL } from "@/lib/api";

type CachedResponse = { status: number; body: unknown };

export async function POST(req: Request) {
  const idempotencyKey = req.headers.get("Idempotency-Key");

  // ── Idempotency check ──────────────────────────────────────────────────────
  if (idempotencyKey) {
    const cached = await redis.get<CachedResponse>(`idempotency:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.status });
    }
  }

  // ── Validate body ──────────────────────────────────────────────────────────
  const parsed = await parseBody(req, createReservationRequestSchema);
  if (parsed.error) return parsed.error;

  const { productId, warehouseId, quantity, ttlSeconds, idempotencyKey: bodyKey } = parsed.data;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
  const idempKey = bodyKey ?? null;

  // ── Atomic stock check + decrement + reservation insert ────────────────────
  // A single CTE guarantees atomicity without a transaction: if the stock
  // UPDATE matches 0 rows the SELECT returns nothing and INSERT inserts nothing.
  const result = await db.execute<Reservation>(sql`
    WITH stock_update AS (
      UPDATE stock
      SET    reserved   = reserved + ${quantity},
             updated_at = now()
      WHERE  product_id   = ${productId}::uuid
        AND  warehouse_id = ${warehouseId}::uuid
        AND  (total - reserved) >= ${quantity}
      RETURNING product_id, warehouse_id
    )
    INSERT INTO reservations
           (product_id, warehouse_id, quantity, status, expires_at, idempotency_key)
    SELECT su.product_id,
           su.warehouse_id,
           ${quantity},
           'pending'::reservation_status,
           ${expiresAt.toISOString()}::timestamptz,
           ${idempKey}
    FROM   stock_update su
    RETURNING *
  `);

  if (result.rows.length === 0) {
    return err("insufficient_stock", 409);
  }

  const reservation = result.rows[0];

  // ── Cache response ─────────────────────────────────────────────────────────
  if (idempotencyKey) {
    await redis.set(
      `idempotency:${idempotencyKey}`,
      { status: 201, body: reservation } satisfies CachedResponse,
      { nx: true, ex: IDEMPOTENCY_TTL }
    );
  }

  return NextResponse.json(reservation, { status: 201 });
}
