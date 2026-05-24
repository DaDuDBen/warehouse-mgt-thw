"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── useInterval ───────────────────────────────────────────────────────────────

function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ReservationStatus = "pending" | "confirmed" | "released";

type ReservationRow = {
  id: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  productName: string;
  productSku: string;
  warehouseName: string;
  warehouseLocation: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function secondsUntil(iso: string) {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatCountdown(total: number) {
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

async function fetchReservation(id: string): Promise<ReservationRow> {
  const res = await fetch(`/api/reservations/${id}`);
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body.error ?? "fetch_failed");
  return body;
}

async function postAction(url: string): Promise<ReservationRow> {
  const res = await fetch(url, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body.error ?? "action_failed");
  return body;
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending:   "Pending",
  confirmed: "Confirmed",
  released:  "Cancelled",
};

const STATUS_CLASS: Record<ReservationStatus, string> = {
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-green-100 text-green-700 border-green-200",
  released:  "bg-gray-100 text-gray-500 border-gray-200",
};

// ── Back link (reused in multiple render states) ───────────────────────────────

function BackLink() {
  return (
    <Link
      href="/"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Inventory
    </Link>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReservationDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: reservation,
    isPending: isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["reservation", id],
    queryFn:  () => fetchReservation(id),
  });

  // Sync countdown whenever expiresAt is first received or changes
  useEffect(() => {
    if (!reservation) return;
    setSecondsLeft(secondsUntil(reservation.expiresAt));
  }, [reservation?.expiresAt]);

  // Tick only while the reservation is still pending
  useInterval(() => {
    if (!reservation?.expiresAt) return;
    setSecondsLeft(secondsUntil(reservation.expiresAt));
  }, reservation?.status === "pending" ? 1000 : null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reservation", id] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => postAction(`/api/reservations/${id}/confirm`),
    onSuccess:  () => { invalidate(); setActionError(null); },
    onError(err) {
      if (err instanceof ApiError && err.status === 410) {
        setActionError("Reservation expired");
      }
    },
  });

  const releaseMutation = useMutation({
    mutationFn: () => postAction(`/api/reservations/${id}/release`),
    onSuccess:  () => { invalidate(); setActionError(null); },
  });

  // ── Render states ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <BackLink />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (isError) {
    const message =
      error instanceof ApiError && error.status === 404
        ? "Reservation not found."
        : "Failed to load reservation.";
    return (
      <div>
        <BackLink />
        <p className="text-sm text-destructive">{message}</p>
      </div>
    );
  }

  const isExpired   = secondsLeft !== null && secondsLeft === 0;
  const isMutating  = confirmMutation.isPending || releaseMutation.isPending;

  // Optimistic status — updates the badge instantly on mutation success
  // without waiting for the background refetch to complete.
  const displayStatus: ReservationStatus =
    confirmMutation.isSuccess ? "confirmed"
    : releaseMutation.isSuccess ? "released"
    : reservation.status;

  const isSettled   = displayStatus === "confirmed" || displayStatus === "released";
  const showButtons = reservation.status === "pending" && !isSettled;

  return (
    <div>
      <BackLink />

      <h1 className="mb-6 text-2xl font-semibold">Reservation Details</h1>

      <Card className="max-w-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">{reservation.productName}</CardTitle>
            <Badge variant="outline" className={STATUS_CLASS[displayStatus]}>
              {STATUS_LABEL[displayStatus]}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {reservation.productSku}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Details grid */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Warehouse</dt>
            <dd>{reservation.warehouseName}</dd>

            <dt className="text-muted-foreground">Location</dt>
            <dd>{reservation.warehouseLocation}</dd>

            <dt className="text-muted-foreground">Quantity</dt>
            <dd>{reservation.quantity}</dd>

            <dt className="text-muted-foreground">Reserved at</dt>
            <dd>{new Date(reservation.createdAt).toLocaleString()}</dd>
          </dl>

          {/* Countdown — visible while pending */}
          {reservation.status === "pending" && secondsLeft !== null && (
            <div className="rounded-md border px-4 py-3">
              {isExpired ? (
                <p className="text-sm font-medium text-red-500">Expired</p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Expires in</span>
                  <span
                    className={`font-mono text-3xl font-bold tabular-nums ${
                      secondsLeft < 60
                        ? "animate-pulse text-red-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatCountdown(secondsLeft)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Settled state messages */}
          {displayStatus === "confirmed" && (
            <p className="text-sm font-medium text-green-600">
              Purchase confirmed. Stock has been committed.
            </p>
          )}
          {displayStatus === "released" && (
            <p className="text-sm text-muted-foreground">
              Reservation cancelled. Stock has been returned.
            </p>
          )}

          {/* Action error (e.g. 410 from confirm) */}
          {actionError && (
            <p className="text-sm text-red-500">{actionError}</p>
          )}

          {/* Action buttons */}
          {showButtons && (
            <div className="flex gap-2">
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={isMutating || isExpired}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {confirmMutation.isPending ? "Confirming…" : "Confirm purchase"}
              </Button>
              <Button
                variant="outline"
                onClick={() => releaseMutation.mutate()}
                disabled={isMutating || isExpired}
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                {releaseMutation.isPending ? "Cancelling…" : "Cancel reservation"}
              </Button>
            </div>
          )}

          {/* Primary CTA after settlement */}
          {isSettled && (
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Inventory
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
