import { NextResponse } from "next/server";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(warehouses).orderBy(asc(warehouses.name));
  return NextResponse.json(rows);
}
