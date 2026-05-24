import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // neon-http has no transaction API, but a data-modifying CTE executes
  // atomically in Postgres — the same isolation guarantee as a transaction.
  //
  // Execution order:
  //   1. expired      — marks pending+expired reservations as released
  //   2. aggregated   — sums released quantity per (product, warehouse)
  //   3. stock_update — restores stock.reserved in one pass (always runs
  //                     because it is a data-modifying CTE)
  //   4. final SELECT — returns the count of released reservations
  const result = await db.execute<{ released: number }>(sql`
    WITH expired AS (
      UPDATE reservations
      SET    status     = 'released',
             updated_at = now()
      WHERE  status     = 'pending'
        AND  expires_at < now()
      RETURNING id, product_id, warehouse_id, quantity
    ),
    aggregated AS (
      SELECT product_id,
             warehouse_id,
             SUM(quantity) AS total_quantity
      FROM   expired
      GROUP  BY product_id, warehouse_id
    ),
    stock_update AS (
      UPDATE stock s
      SET    reserved   = GREATEST(0, s.reserved - a.total_quantity),
             updated_at = now()
      FROM   aggregated a
      WHERE  s.product_id   = a.product_id
        AND  s.warehouse_id = a.warehouse_id
    )
    SELECT COUNT(*)::int AS released
    FROM   expired
  `);

  return NextResponse.json({ released: result.rows[0]?.released ?? 0 });
}
