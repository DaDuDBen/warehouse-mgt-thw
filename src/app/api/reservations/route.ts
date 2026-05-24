import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Reservation } from "@/db/schema";
import { createReservationRequestSchema } from "@/lib/schemas";
import { err, parseBody } from "@/lib/api";

export async function POST(req: Request) {
  const parsed = await parseBody(req, createReservationRequestSchema);
  if (parsed.error) return parsed.error;

  const { productId, warehouseId, quantity, ttlSeconds, idempotencyKey: bodyKey } = parsed.data;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
  const idempKey = bodyKey ?? null;

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

  return NextResponse.json(result.rows[0], { status: 201 });
}
