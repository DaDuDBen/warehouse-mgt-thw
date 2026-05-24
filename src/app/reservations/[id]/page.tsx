import { ReservationDetail } from "@/components/reservation-detail";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <ReservationDetail id={id} />
    </main>
  );
}
