import { config } from "dotenv";

// Must run before any db module is imported so DATABASE_URL is in scope
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./client");
  const { products, warehouses, stock } = await import("./schema");

  // ── Warehouses ─────────────────────────────────────────────────────────────

  console.log("→ Inserting warehouses…");

  const [mumbai, delhi, bangalore] = await db
    .insert(warehouses)
    .values([
      { name: "Mumbai Hub",    location: "Bhiwandi, Thane, Maharashtra" },
      { name: "Delhi Hub",     location: "Kundli, Sonipat, Haryana" },
      { name: "Bangalore Hub", location: "Whitefield, Bengaluru, Karnataka" },
    ])
    .returning();

  console.log(`  ✔ ${mumbai.name} (${mumbai.id})`);
  console.log(`  ✔ ${delhi.name} (${delhi.id})`);
  console.log(`  ✔ ${bangalore.name} (${bangalore.id})`);

  // ── Products ───────────────────────────────────────────────────────────────

  console.log("→ Inserting products…");

  const insertedProducts = await db
    .insert(products)
    .values([
      {
        name: "Apple iPhone 15 Pro",
        sku: "APL-IP15P-128",
        description:
          "6.1-inch Super Retina XDR display, A17 Pro chip, 48 MP main camera, titanium design, 128 GB storage.",
      },
      {
        name: "Sony WH-1000XM5",
        sku: "SNY-WH1000XM5-BK",
        description:
          "Industry-leading noise cancelling over-ear headphones with 30-hour battery life and multipoint Bluetooth pairing.",
      },
      {
        name: "Samsung Galaxy S24 Ultra",
        sku: "SAM-GS24U-256-BK",
        description:
          "6.8-inch Dynamic AMOLED 2X display, Snapdragon 8 Gen 3, 200 MP quad-camera system, built-in S Pen, 256 GB storage.",
      },
      {
        name: "Apple AirPods Pro (2nd Gen)",
        sku: "APL-APP2-WH",
        description:
          "Active Noise Cancellation, Transparency mode, Personalised Spatial Audio, MagSafe USB-C charging case.",
      },
      {
        name: "Logitech MX Master 3S",
        sku: "LGT-MXM3S-GR",
        description:
          "High-precision 8K DPI sensor, near-silent clicks, MagSpeed electromagnetic scroll wheel, USB-C, multi-device.",
      },
    ])
    .returning();

  for (const p of insertedProducts) {
    console.log(`  ✔ ${p.name} [${p.sku}] (${p.id})`);
  }

  // ── Stock (product × warehouse) ────────────────────────────────────────────

  console.log("→ Inserting stock rows…");

  const warehouseList = [mumbai, delhi, bangalore];

  // total values per [product][warehouse] — deterministic, varied between 5–50
  const totals: Record<string, number[]> = {
    [insertedProducts[0].id]: [42, 30, 15], // iPhone 15 Pro
    [insertedProducts[1].id]: [18, 25, 40], // WH-1000XM5
    [insertedProducts[2].id]: [35, 20, 10], // Galaxy S24 Ultra
    [insertedProducts[3].id]: [27, 12, 50], // AirPods Pro 2
    [insertedProducts[4].id]: [15,  8, 22], // MX Master 3S
  };

  const stockRows = insertedProducts.flatMap((product, _pi) =>
    warehouseList.map((warehouse, wi) => ({
      productId: product.id,
      warehouseId: warehouse.id,
      total: totals[product.id][wi],
      reserved: 0,
    }))
  );

  const insertedStock = await db.insert(stock).values(stockRows).returning();

  for (const row of insertedStock) {
    const product = insertedProducts.find((p) => p.id === row.productId)!;
    const warehouse = warehouseList.find((w) => w.id === row.warehouseId)!;
    console.log(
      `  ✔ ${product.sku} @ ${warehouse.name}: total=${row.total} reserved=${row.reserved}`
    );
  }

  console.log(
    `\nDone. Seeded ${warehouseList.length} warehouses, ${insertedProducts.length} products, ${insertedStock.length} stock rows.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
