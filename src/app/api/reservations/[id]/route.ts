import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reservations, products, warehouses } from "@/db/schema";
import { err } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [row] = await db
    .select({
      id:                reservations.id,
      quantity:          reservations.quantity,
      status:            reservations.status,
      expiresAt:         reservations.expiresAt,
      createdAt:         reservations.createdAt,
      productName:       products.name,
      productSku:        products.sku,
      warehouseName:     warehouses.name,
      warehouseLocation: warehouses.location,
    })
    .from(reservations)
    .innerJoin(products,   eq(products.id,   reservations.productId))
    .innerJoin(warehouses, eq(warehouses.id, reservations.warehouseId))
    .where(eq(reservations.id, id));

  if (!row) return err("reservation_not_found", 404);

  return NextResponse.json(row);
}
