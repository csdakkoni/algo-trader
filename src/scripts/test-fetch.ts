// ============================================================
// Test Script: BIST Hisseleri Veri Çekme Testi
//
// Bu script:
// 1. THYAO.IS ve EREGL.IS hisselerini assets tablosuna ekler
// 2. Son 30 günlük günlük (daily) verileri Yahoo Finance'ten çeker
// 3. Verileri stock_candles tablosuna upsert eder
// 4. Sonuçları doğrulayarak konsola yazdırır
//
// Kullanım:
//   npm run test:fetch
// ============================================================

import { seedAssets } from "../services/stock-candle.service.js";
import {
  getRecentCandles,
  getCandleCount,
} from "../services/stock-candle.service.js";
import { collectCandles } from "../collectors/candle-collector.js";
import type { AssetInsert } from "../types/database.js";

// ------------------------------------------------------------
// Test Konfigürasyonu
// ------------------------------------------------------------

/** Test edilecek BIST hisseleri */
const TEST_ASSETS: AssetInsert[] = [
  { ticker: "THYAO.IS", name: "Türk Hava Yolları", is_active: true },
  { ticker: "EREGL.IS", name: "Ereğli Demir ve Çelik", is_active: true },
];

/** Veri çekme zaman aralığı: son 30 gün */
const DAYS_BACK = 30;

// ------------------------------------------------------------
// Ana Test Fonksiyonu
// ------------------------------------------------------------

async function main(): Promise<void> {
  console.log("🚀 Algoritmik Trading — Modül 1 Test Script'i");
  console.log("━".repeat(60));
  console.log(`📅 Tarih: ${new Date().toISOString()}`);
  console.log(`📊 Test hisseleri: ${TEST_ASSETS.map((a) => a.ticker).join(", ")}`);
  console.log(`📆 Zaman aralığı: Son ${DAYS_BACK} gün (günlük mumlar)`);
  console.log("━".repeat(60));

  try {
    // --------------------------------------------------------
    // Adım 1: Hisseleri seed et
    // --------------------------------------------------------
    console.log("\n📌 Adım 1: Hisseler seed ediliyor...");
    const seededAssets = await seedAssets(TEST_ASSETS);
    console.log("   Seed edilen hisseler:");
    for (const asset of seededAssets) {
      console.log(`   • ${asset.ticker} (${asset.name}) — ID: ${asset.id}`);
    }

    // --------------------------------------------------------
    // Adım 2: Son 30 günlük veri topla
    // --------------------------------------------------------
    console.log("\n📌 Adım 2: Yahoo Finance'ten veri toplanıyor...");
    const period1 = new Date();
    period1.setDate(period1.getDate() - DAYS_BACK);

    const summary = await collectCandles({
      period1: period1.toISOString(),
      interval: "1d",
    });

    // --------------------------------------------------------
    // Adım 3: Sonuçları doğrula
    // --------------------------------------------------------
    console.log("\n📌 Adım 3: Doğrulama — Veritabanından okuma...");
    console.log("━".repeat(60));

    for (const asset of seededAssets) {
      const count = await getCandleCount(asset.id);
      const recentCandles = await getRecentCandles(asset.id, 3);

      console.log(`\n📈 ${asset.ticker} (${asset.name})`);
      console.log(`   Toplam mum sayısı: ${count}`);
      console.log("   Son 3 mum:");

      for (const candle of recentCandles) {
        const date = new Date(candle.timestamp).toLocaleDateString("tr-TR");
        console.log(
          `   • ${date} — Kapanış: ₺${candle.close.toFixed(2)}, Hacim: ${candle.volume.toLocaleString("tr-TR")}`
        );
      }
    }

    // --------------------------------------------------------
    // Adım 4: Özet rapor
    // --------------------------------------------------------
    console.log("\n" + "━".repeat(60));
    console.log("✅ Test başarıyla tamamlandı!");
    console.log("━".repeat(60));
    console.log(`   Toplam hisse     : ${summary.totalAssets}`);
    console.log(`   Başarılı         : ${summary.successCount}`);
    console.log(`   Başarısız        : ${summary.failureCount}`);
    console.log(`   Toplam mum verisi: ${summary.totalCandles}`);

    if (summary.failureCount > 0) {
      console.log("\n⚠️  Başarısız hisseler:");
      for (const result of summary.results.filter((r) => !r.success)) {
        console.log(`   • ${result.ticker}: ${result.error}`);
      }
    }

    // --------------------------------------------------------
    // Adım 5: Upsert doğrulaması (idempotency testi)
    // --------------------------------------------------------
    console.log("\n📌 Adım 5: Upsert doğrulaması (aynı veriyi tekrar yazma)...");
    const summarySecondRun = await collectCandles({
      period1: period1.toISOString(),
      interval: "1d",
    });

    // İlk ve ikinci çalışma sonuçlarını karşılaştır
    for (const asset of seededAssets) {
      const countAfter = await getCandleCount(asset.id);
      const firstRun = summary.results.find((r) => r.assetId === asset.id);
      const secondRun = summarySecondRun.results.find(
        (r) => r.assetId === asset.id
      );

      console.log(`\n   ${asset.ticker}:`);
      console.log(`   1. çalışma: ${firstRun?.candlesCount ?? 0} mum yazıldı`);
      console.log(`   2. çalışma: ${secondRun?.candlesCount ?? 0} mum yazıldı (upsert)`);
      console.log(`   Toplam mum sayısı: ${countAfter} (mükerrer yok ✓)`);
    }

    console.log("\n" + "━".repeat(60));
    console.log("🎉 Tüm testler başarıyla tamamlandı!");
    console.log("━".repeat(60) + "\n");
  } catch (error) {
    console.error("\n❌ Test hatası:", error);
    process.exit(1);
  }
}

// Script'i çalıştır
main();
