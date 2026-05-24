"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  total: number;
  reserved: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  stock: StockEntry[];
};

type ReservationPayload = {
  productId: string;
  warehouseId: string;
  quantity: number;
  ttlSeconds: number;
};

type ReservationResponse = { id: string };

// ── Error class ───────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products");
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

async function postReservation(
  payload: ReservationPayload
): Promise<ReservationResponse> {
  const res = await fetch("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body.error ?? "reservation_failed");
  return body;
}

// ── ProductCard ───────────────────────────────────────────────────────────────

type ActiveForm = { warehouseId: string; quantity: number };

function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: postReservation,
    onSuccess(data) {
      router.push(`/reservations/${data.id}`);
    },
    onError(err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError("Not enough stock");
      }
    },
  });

  function openForm(warehouseId: string) {
    setActiveForm({ warehouseId, quantity: 1 });
    setFormError(null);
    mutation.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeForm) return;
    setFormError(null);
    mutation.mutate({
      productId: product.id,
      warehouseId: activeForm.warehouseId,
      quantity: activeForm.quantity,
      ttlSeconds: 600,
    });
  }

  const activeEntry = activeForm
    ? product.stock.find((s) => s.warehouseId === activeForm.warehouseId)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{product.name}</CardTitle>
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            {product.sku}
          </Badge>
        </div>
        {product.description && (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pb-2 text-left font-medium">Warehouse</th>
              <th className="pb-2 text-right font-medium">Available</th>
              <th className="pb-2 text-right font-medium">Total</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {product.stock.map((entry) => (
              <tr key={entry.warehouseId} className="border-b last:border-0">
                <td className="py-2">{entry.warehouseName}</td>
                <td className="py-2 text-right tabular-nums">
                  {entry.available}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {entry.total}
                </td>
                <td className="py-2 pl-4 text-right">
                  {entry.available === 0 ? (
                    <Badge
                      variant="secondary"
                      className="opacity-50 text-xs"
                    >
                      Out of stock
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openForm(entry.warehouseId)}
                    >
                      Reserve
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {activeForm && activeEntry && (
          <div className="mt-4 rounded-md border p-4">
            <p className="mb-3 text-sm font-medium">
              Reserve from {activeEntry.warehouseName}
            </p>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={activeEntry.available}
                value={activeForm.quantity}
                onChange={(e) => {
                  setActiveForm({
                    ...activeForm,
                    quantity: Number(e.target.value),
                  });
                  setFormError(null);
                }}
                className="w-24"
                disabled={mutation.isPending}
              />
              <Button
                type="submit"
                size="sm"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Reserving…" : "Confirm"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => {
                  setActiveForm(null);
                  setFormError(null);
                  mutation.reset();
                }}
              >
                Cancel
              </Button>
            </form>
            {formError && (
              <p className="mt-2 text-sm text-destructive">{formError}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ProductList ───────────────────────────────────────────────────────────────

export function ProductList() {
  const { data: products, isPending, isError } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    refetchInterval: 30_000,
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError)   return <p className="text-sm text-destructive">Failed to load products.</p>;
  if (!products.length) return <p className="text-sm text-muted-foreground">No products found.</p>;

  return (
    <div className="grid gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
