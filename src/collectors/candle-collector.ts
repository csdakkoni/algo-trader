// ============================================================
// Candle Collector — Orchestrator
// Aktif hisseleri çeker, Yahoo Finance'ten veri toplar
// ve veritabanına kaydeder.
// ============================================================

import { fetchCandles } from "../services/yahoo-finance.service.js";
import {
  getActiveAssets,
  upsertCandles,
} from "../services/stock-candle.service.js";
import type {
  FetchCandlesOptions,
  CollectionResult,
  CollectionSummary,
} from "../types/database.js";

/** İstekler arası bekleme süresi (ms) — rate limiting */
const INTER_TICKER_DELAY_MS = 1_500;

/** Belirtilen milisaniye kadar bekler */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tüm aktif hisseler için Yahoo Finance'ten veri toplar ve
 * veritabanına kaydeder.
 *
 * İşlem akışı:
 * 1. `assets` tablosundan is_active=true olanları çek
 * 2. Her hisse için Yahoo Finance'ten mum verisi çek
 * 3. Çekilen verileri stock_candles tablosuna upsert et
 * 4. Sonuç özetini döndür
 *
 * @param options - Zaman aralığı ve interval parametreleri
 * @returns Toplama işlemi özet raporu
 *
 * @example
 * ```ts
 * const summary = await collectCandles({
 *   period1: "2024-06-01",
 *   interval: "1d",
 * });
 * console.log(`Toplam ${summary.totalCandles} mum verisi toplandı.`);
 * ```
 */
export async function collectCandles(
  options: FetchCandlesOptions
): Promise<CollectionSummary> {
  const startedAt = new Date();
  console.log("\n" + "=".repeat(60));
  console.log("[Collector] Veri toplama başlatılıyor...");
  console.log("=".repeat(60));

  // 1. Aktif hisseleri çek
  const assets = await getActiveAssets();

  if (assets.length === 0) {
    console.warn("[Collector] Aktif hisse bulunamadı. İşlem sonlandırılıyor.");
    return {
      totalAssets: 0,
      successCount: 0,
      failureCount: 0,
      totalCandles: 0,
      results: [],
      startedAt,
      completedAt: new Date(),
    };
  }

  console.log(
    `[Collector] ${assets.length} aktif hisse bulundu: ` +
      assets.map((a) => a.ticker).join(", ")
  );

  // 2-3. Her hisse için veri çek ve kaydet
  const results: CollectionResult[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]!;
    console.log(
      `\n[Collector] (${i + 1}/${assets.length}) ${asset.ticker} işleniyor...`
    );

    try {
      // Yahoo Finance'ten mum verilerini çek
      const candles = await fetchCandles(asset.ticker, options);

      // Veritabanına upsert et
      const upsertedCount = await upsertCandles(asset.id, candles);

      results.push({
        ticker: asset.ticker,
        assetId: asset.id,
        candlesCount: upsertedCount,
        success: true,
      });

      console.log(
        `[Collector] ✅ ${asset.ticker}: ${upsertedCount} mum kaydedildi.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      results.push({
        ticker: asset.ticker,
        assetId: asset.id,
        candlesCount: 0,
        success: false,
        error: message,
      });

      console.error(
        `[Collector] ❌ ${asset.ticker}: Hata — ${message}`
      );
    }

    // Son hisse değilse rate limiting gecikmesi uygula
    if (i < assets.length - 1) {
      await delay(INTER_TICKER_DELAY_MS);
    }
  }

  // 4. Sonuç özeti oluştur
  const completedAt = new Date();
  const summary: CollectionSummary = {
    totalAssets: assets.length,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
    totalCandles: results.reduce((sum, r) => sum + r.candlesCount, 0),
    results,
    startedAt,
    completedAt,
  };

  // Özet raporu yazdır
  const durationMs = completedAt.getTime() - startedAt.getTime();
  console.log("\n" + "=".repeat(60));
  console.log("[Collector] Veri toplama tamamlandı!");
  console.log("=".repeat(60));
  console.log(`  Toplam hisse  : ${summary.totalAssets}`);
  console.log(`  Başarılı      : ${summary.successCount}`);
  console.log(`  Başarısız     : ${summary.failureCount}`);
  console.log(`  Toplam mum    : ${summary.totalCandles}`);
  console.log(`  Süre          : ${(durationMs / 1000).toFixed(1)}s`);
  console.log("=".repeat(60) + "\n");

  return summary;
}
