import { ProductList } from "@/components/product-list";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Inventory</h1>
      <ProductList />
    </main>
  );
}
