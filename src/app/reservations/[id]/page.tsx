import { ReservationDetail } from "@/components/reservation-detail";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Reservation</h1>
      <ReservationDetail id={id} />
    </main>
  );
}
