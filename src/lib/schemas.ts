import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { products, warehouses, stock, reservations } from "@/db/schema";

// ── Products ────────────────────────────────────────────────────────────────

export const insertProductSchema = createInsertSchema(products, {
  name: (s) => s.min(1).max(255),
  sku: (s) => s.min(1).max(100),
  description: (s) => s.max(1000).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const selectProductSchema = createSelectSchema(products);
export const patchProductSchema = insertProductSchema.partial();

// ── Warehouses ───────────────────────────────────────────────────────────────

export const insertWarehouseSchema = createInsertSchema(warehouses, {
  name: (s) => s.min(1).max(255),
  location: (s) => s.min(1).max(255),
}).omit({ id: true, createdAt: true });

export const selectWarehouseSchema = createSelectSchema(warehouses);
export const patchWarehouseSchema = insertWarehouseSchema.partial();

// ── Stock ────────────────────────────────────────────────────────────────────

export const insertStockSchema = createInsertSchema(stock, {
  total: (s) => s.min(0),
  reserved: (s) => s.min(0),
}).omit({ id: true, updatedAt: true });

export const selectStockSchema = createSelectSchema(stock);

// ── Reservations ─────────────────────────────────────────────────────────────

export const insertReservationSchema = createInsertSchema(reservations, {
  quantity: (s) => s.min(1),
  idempotencyKey: (s) => s.max(255).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const selectReservationSchema = createSelectSchema(reservations);
export const patchReservationSchema = insertReservationSchema.partial();

// ── Route-level request schemas ───────────────────────────────────────────────
// Used for cross-table or computed fields that have no direct column counterpart.

export const createReservationRequestSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().int().min(1),
  ttlSeconds: z.number().int().min(1).max(86_400).default(900),
  idempotencyKey: z.string().max(255).optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  delta: z.number().int(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type SelectProduct = z.infer<typeof selectProductSchema>;

export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type SelectWarehouse = z.infer<typeof selectWarehouseSchema>;

export type InsertStock = z.infer<typeof insertStockSchema>;
export type SelectStock = z.infer<typeof selectStockSchema>;

export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type SelectReservation = z.infer<typeof selectReservationSchema>;

export type CreateReservationRequest = z.infer<typeof createReservationRequestSchema>;
export type AdjustStockRequest = z.infer<typeof adjustStockSchema>;
