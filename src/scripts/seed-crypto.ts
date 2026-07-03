// Top 25 kripto varlıkları Supabase'e ekler
import { supabase } from "../config/supabase.js";

const CRYPTO_ASSETS: { ticker: string; name: string }[] = [
  // ── Major ──────────────────────────────────
  { ticker: "BTCUSDT", name: "Bitcoin" },
  { ticker: "ETHUSDT", name: "Ethereum" },
  { ticker: "BNBUSDT", name: "BNB" },
  { ticker: "SOLUSDT", name: "Solana" },
  { ticker: "XRPUSDT", name: "Ripple" },
  // ── Large Cap ──────────────────────────────
  { ticker: "ADAUSDT", name: "Cardano" },
  { ticker: "DOGEUSDT", name: "Dogecoin" },
  { ticker: "AVAXUSDT", name: "Avalanche" },
  { ticker: "DOTUSDT", name: "Polkadot" },
  { ticker: "LINKUSDT", name: "Chainlink" },
  { ticker: "MATICUSDT", name: "Polygon" },
  { ticker: "SHIBUSDT", name: "Shiba Inu" },
  { ticker: "LTCUSDT", name: "Litecoin" },
  { ticker: "ATOMUSDT", name: "Cosmos" },
  { ticker: "UNIUSDT", name: "Uniswap" },
  // ── Mid Cap ────────────────────────────────
  { ticker: "NEARUSDT", name: "NEAR Protocol" },
  { ticker: "AAVEUSDT", name: "Aave" },
  { ticker: "FILUSDT", name: "Filecoin" },
  { ticker: "ARBUSDT", name: "Arbitrum" },
  { ticker: "OPUSDT", name: "Optimism" },
  { ticker: "SUIUSDT", name: "Sui" },
  { ticker: "APTUSDT", name: "Aptos" },
  { ticker: "INJUSDT", name: "Injective" },
  { ticker: "RENDERUSDT", name: "Render" },
  { ticker: "FETUSDT", name: "Fetch.ai" },
];

async function main() {
  console.log(`📥 Kripto — ${CRYPTO_ASSETS.length} varlık ekleniyor...`);
  console.log("   Mevcut varlıklar korunacak, yeniler eklenecek.\n");

  let added = 0, skipped = 0, failed = 0;

  for (const crypto of CRYPTO_ASSETS) {
    const { data: existing } = await supabase
      .from("assets")
      .select("id")
      .eq("ticker", crypto.ticker)
      .single();

    if (existing) { skipped++; continue; }

    const { error } = await supabase.from("assets").insert({
      ticker: crypto.ticker,
      name: crypto.name,
      is_active: true,
    });

    if (error) {
      console.log(`  ❌ ${crypto.ticker}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✅ ${crypto.ticker} (${crypto.name})`);
      added++;
    }
  }

  const { count } = await supabase.from("assets").select("*", { count: "exact", head: true }).eq("is_active", true);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Yeni eklenen : ${added}`);
  console.log(`  Zaten vardı  : ${skipped}`);
  console.log(`  Hata         : ${failed}`);
  console.log(`  Aktif toplam : ${count}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(console.error);
