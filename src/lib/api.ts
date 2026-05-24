import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export function err(error: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json(
    { error, ...(details !== undefined && { details }) },
    { status }
  );
}

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: err("invalid_json", 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: err("validation_error", 400, result.error.flatten()) };
  }
  return { data: result.data };
}

export const IDEMPOTENCY_TTL = 86_400; // 24 hours
