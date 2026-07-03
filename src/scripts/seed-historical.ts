// ============================================================
// Veri Zenginleştirme: 1 Yıllık Geçmiş Veri Çek
//
// Mevcut 30 günlük veri backtest için yetersiz (EMA 20 periyot
// hesaplanınca sadece ~10 mum üzerinde sinyal aramak kalıyor).
// Bu script 1 yıllık günlük veriyi çeker ve Supabase'e yazar.
//
// Kullanım:
//   npx tsx src/scripts/seed-historical.ts
// ============================================================

import { fetchCandles } from "../services/yahoo-finance.service.js";
import {
  getActiveAssets,
  upsertCandles,
} from "../services/stock-candle.service.js";

async function main(): Promise<void> {
  console.log("📦 1 yıllık geçmiş veri çekiliyor...\n");

  const assets = await getActiveAssets();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);

  for (const asset of assets) {
    console.log(`📈 ${asset.ticker} — son 1 yıl...`);
    try {
      const candles = await fetchCandles(asset.ticker, {
        period1: period1.toISOString(),
        interval: "1d",
      });
      const count = await upsertCandles(asset.id, candles);
      console.log(`   ✅ ${count} mum yazıldı.\n`);
    } catch (err) {
      console.error(`   ❌ Hata: ${err}\n`);
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("🎉 Tamamlandı!");
}

main().catch(console.error);
