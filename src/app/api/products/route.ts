import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, warehouses, stock } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";

async function releaseExpiredReservations() {
  await db.execute(sql`
    WITH expired AS (
      UPDATE reservations
      SET    status     = 'released',
             updated_at = now()
      WHERE  status     = 'pending'
        AND  expires_at < now()
      RETURNING product_id, warehouse_id, quantity
    ),
    aggregated AS (
      SELECT product_id,
             warehouse_id,
             SUM(quantity) AS total_quantity
      FROM   expired
      GROUP  BY product_id, warehouse_id
    )
    UPDATE stock s
    SET    reserved   = GREATEST(0, s.reserved - a.total_quantity),
           updated_at = now()
    FROM   aggregated a
    WHERE  s.product_id   = a.product_id
      AND  s.warehouse_id = a.warehouse_id
  `);
}

export async function GET() {
  await releaseExpiredReservations();

  const rows = await db
    .select({
      productId:          products.id,
      productName:        products.name,
      productSku:         products.sku,
      productDescription: products.description,
      productCreatedAt:   products.createdAt,
      productUpdatedAt:   products.updatedAt,
      warehouseId:        warehouses.id,
      warehouseName:      warehouses.name,
      stockTotal:         stock.total,
      stockReserved:      stock.reserved,
    })
    .from(products)
    .leftJoin(stock,      eq(stock.productId,    products.id))
    .leftJoin(warehouses, eq(warehouses.id,       stock.warehouseId))
    .orderBy(asc(products.name), asc(warehouses.name));

  type ProductRow = {
    id:          string;
    name:        string;
    sku:         string;
    description: string | null;
    createdAt:   Date;
    updatedAt:   Date;
    stock: {
      warehouseId:   string;
      warehouseName: string;
      total:         number;
      reserved:      number;
      available:     number;
    }[];
  };

  const productMap = new Map<string, ProductRow>();

  for (const row of rows) {
    if (!productMap.has(row.productId)) {
      productMap.set(row.productId, {
        id:          row.productId,
        name:        row.productName,
        sku:         row.productSku,
        description: row.productDescription,
        createdAt:   row.productCreatedAt,
        updatedAt:   row.productUpdatedAt,
        stock:       [],
      });
    }

    if (
      row.warehouseId   !== null &&
      row.stockTotal    !== null &&
      row.stockReserved !== null
    ) {
      productMap.get(row.productId)!.stock.push({
        warehouseId:   row.warehouseId,
        warehouseName: row.warehouseName!,
        total:         row.stockTotal,
        reserved:      row.stockReserved,
        available:     row.stockTotal - row.stockReserved,
      });
    }
  }

  return NextResponse.json([...productMap.values()]);
}
