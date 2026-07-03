import { supabase } from "../config/supabase.js";

async function main() {
  // 1. Hesaplar
  const { data: accounts } = await supabase.from("paper_accounts").select("*").order("name");
  console.log("=== HESAPLAR ===");
  for (const a of accounts ?? []) {
    console.log(`  ${a.name} — ₺${Number(a.balance).toLocaleString("tr-TR")} (oluşturulma: ${a.created_at})`);
  }

  // 2. Son pozisyonlar
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("*, assets:asset_id(ticker)")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("\n=== SON 10 POZİSYON ===");
  if (!positions || positions.length === 0) {
    console.log("  Henüz pozisyon yok — bot sinyal üretmemiş olabilir.");
  } else {
    for (const p of positions) {
      const t = (p.assets as unknown as { ticker: string })?.ticker ?? "?";
      console.log(`  ${t} | ${p.status} | Giriş: ₺${p.entry_price} | ${p.created_at}`);
    }
  }

  // 3. Mum verisi son güncelleme
  const { data: lastCandle } = await supabase
    .from("stock_candles")
    .select("timestamp, asset_id")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log("\n=== SON MUM VERİSİ ===");
  if (lastCandle) {
    console.log(`  Son mum tarihi: ${lastCandle.timestamp}`);
  } else {
    console.log("  Mum verisi yok!");
  }
}

main().catch(console.error);
