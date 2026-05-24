# Warehouse Inventory Reservation System

A multi-warehouse inventory reservation system built for multi-location retail. It solves the classic checkout race condition — two customers hitting "reserve" simultaneously for the last unit — by pushing the concurrency guarantee into Postgres rather than application code. Reservations are time-bounded, stock is adjusted atomically, and expired holds are swept lazily on read and proactively by a cron job.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Database | [Neon](https://neon.tech) — serverless Postgres |
| Cache / Idempotency | [Upstash Redis](https://upstash.com) (REST) |
| Validation | [Zod](https://zod.dev) + [drizzle-zod](https://orm.drizzle.team/docs/zod) |
| Data fetching | [TanStack Query v5](https://tanstack.com/query) |
| UI components | [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS v4 |
| Hosting | [Vercel](https://vercel.com) |

---

## Local Development

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) project (free tier is sufficient)
- An [Upstash](https://upstash.com) Redis database (free tier is sufficient)

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```
DATABASE_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=
```

`CRON_SECRET` can be any random string — it authenticates the Vercel cron job. Set the same value in your Vercel project environment variables.

### Setup

```bash
npm install
npm run db:push      # push schema to Neon
npm run db:seed      # seed warehouses, products, and stock
npm run dev          # start dev server at http://localhost:3000
```

### Other Useful Commands

```bash
npm run build          # production build
npm run lint           # eslint
npx tsc --noEmit       # type-check without emit

npm run db:generate    # generate SQL migration files
npm run db:migrate     # apply migrations to Neon
npm run db:studio      # open Drizzle Studio GUI
```

---

## Architecture

### The Concurrency Problem

In a naïve stock-reservation flow, you read available stock, check it's sufficient, then write the decrement. Under concurrent load, two requests can both pass the read check before either has written — the classic time-of-check/time-of-use (TOCTOU) race. Both succeed, stock goes negative.

The fix is to push the availability check and the decrement into a single atomic `UPDATE`:

```sql
UPDATE stock
SET    reserved   = reserved + {qty},
       updated_at = now()
WHERE  product_id  = {pid}
  AND  warehouse_id = {wid}
  AND  (total - reserved) >= {qty}
RETURNING *
```

If `rowCount === 0`, the condition wasn't met — another request got there first, or stock was always insufficient. Return 409. No lock is held, no separate `SELECT` is issued, and correctness holds under any concurrency level. This is what Postgres was built for.

The reservation insert is chained to this update as a data-modifying CTE, making the stock decrement and reservation creation a single round-trip to the database:

```sql
WITH stock_update AS (
  UPDATE stock
  SET    reserved = reserved + {qty}, updated_at = now()
  WHERE  product_id = {pid} AND warehouse_id = {wid}
    AND  (total - reserved) >= {qty}
  RETURNING product_id, warehouse_id
)
INSERT INTO reservations (product_id, warehouse_id, quantity, status, expires_at, idempotency_key)
SELECT su.product_id, su.warehouse_id, {qty}, 'pending', {expires_at}, {key}
FROM   stock_update su
RETURNING *
```

If the CTE produces no rows (stock check failed), the `INSERT` is a no-op and the response is 409.

### Reservation Expiry

Reservations expire after a configurable TTL (default 15 minutes). Expired holds must be released back to available stock. This is handled in two layers:

**1. Lazy cleanup** — `GET /api/products` runs a cleanup CTE before computing available stock. Every product page load releases any reservations that expired since the last request. No additional infrastructure required; the read path is always consistent.

**2. Vercel Cron** — `/api/cron/cleanup` runs every 5 minutes as a proactive sweep. This catches expired reservations even when there is no read traffic, ensuring stock is returned promptly.

The cron handler uses a four-stage data-modifying CTE rather than a transaction because the Neon HTTP driver does not support `BEGIN`/`COMMIT` — it issues stateless HTTP requests to Neon's serverless endpoint. Postgres guarantees that data-modifying CTEs execute atomically and to completion regardless of whether their output is referenced downstream, making them a correct and idiomatic substitute.

### Idempotency

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support an optional `Idempotency-Key` header. This prevents duplicate reservations or double-charges when a client retries after a network timeout.

Flow:

1. **Request arrives** with `Idempotency-Key: <key>`.
2. **Cache hit** — Upstash Redis has a stored response for this key. Return it immediately; no DB work is done.
3. **Cache miss** — Execute the operation. On success, store `{ statusCode, body }` in Redis with `SET NX EX 86400`.
4. `SET NX` is atomic — two concurrent retries with the same key cannot both write; one wins and the other returns the winner's stored response.

The 24-hour TTL matches the standard idempotency window used in payment flows.

---

## Trade-offs and What I'd Change

**`available` is computed, not stored.** `available = total - reserved` is calculated at query time rather than maintained as a column. This avoids the risk of the two values drifting out of sync (e.g. a failed partial update) at the cost of a marginally more complex query. Worth it for correctness.

**No authentication.** Reservations are not scoped to a user. In production, a `userId` column on the `reservations` table and middleware-level auth (e.g. NextAuth or Clerk) would be the first addition — without it, any client can confirm or release any reservation by ID.

**Cron interval is 5 minutes.** In the worst case, stock can be held for up to 5 minutes after a reservation expires. Lazy cleanup on `GET /api/products` mitigates this for active traffic patterns, but a shorter interval, a Redis keyspace notification on TTL expiry, or a Postgres `pg_cron` job would close the gap entirely.

**Idempotency is not implemented for release.** Release is already naturally idempotent — releasing a released or confirmed reservation returns the current state without modifying it. Adding an idempotency key would be redundant.

**Hot row contention at scale.** The atomic `UPDATE` on `stock` serialises concurrent writes to the same `(product_id, warehouse_id)` row. This is correct and fast at moderate throughput, but the stock row becomes a hot spot for popular SKUs. At high volume, options include partitioning by `warehouse_id`, sharding reservations into a queue, or accepting approximate availability reads with a reconciliation pass.
