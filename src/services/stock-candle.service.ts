// ============================================================
// Stock Candle Veritabanı Servisi
// Supabase üzerinden assets ve stock_candles tablolarına
// CRUD ve upsert işlemleri yapar.
// ============================================================

import { supabase } from "../config/supabase.js";
import type {
  Asset,
  AssetInsert,
  StockCandleInsert,
  YahooFinanceCandle,
} from "../types/database.js";

// ------------------------------------------------------------
// Asset İşlemleri
// ------------------------------------------------------------

/**
 * Veritabanındaki aktif (is_active = true) tüm hisseleri getirir.
 * @returns Aktif hisse listesi
 */
export async function getActiveAssets(): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("is_active", true)
    .order("ticker", { ascending: true });

  if (error) {
    throw new Error(`[DB] Aktif hisseler alınamadı: ${error.message}`);
  }

  console.log(`[DB] ${data.length} aktif hisse bulundu.`);
  return data;
}

/**
 * Hisse senedi kayıtlarını ekler veya günceller (ticker bazında upsert).
 * Zaten var olan ticker'lar güncellenir, yeni olanlar eklenir.
 *
 * @param assets - Eklenecek/güncellenecek hisse listesi
 * @returns Eklenen/güncellenen hisse kayıtları
 */
export async function seedAssets(assets: AssetInsert[]): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets")
    .upsert(assets, { onConflict: "ticker" })
    .select();

  if (error) {
    throw new Error(`[DB] Hisse seed işlemi başarısız: ${error.message}`);
  }

  console.log(`[DB] ${data.length} hisse seed edildi/güncellendi.`);
  return data;
}

/**
 * Belirtilen ticker'a ait hisseyi getirir.
 * @param ticker - Hisse kodu (Örn: "THYAO.IS")
 * @returns Hisse kaydı veya null
 */
export async function getAssetByTicker(
  ticker: string
): Promise<Asset | null> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("ticker", ticker)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Kayıt bulunamadı
      return null;
    }
    throw new Error(`[DB] Hisse bulunamadı (${ticker}): ${error.message}`);
  }

  return data;
}

// ------------------------------------------------------------
// Stock Candle İşlemleri
// ------------------------------------------------------------

/** Tek seferde upsert edilecek maksimum satır sayısı */
const UPSERT_BATCH_SIZE = 500;

/**
 * Yahoo Finance'ten alınan mum verilerini veritabanına yazar.
 * asset_id + timestamp bileşik unique constraint'i sayesinde
 * mükerrer (çift) kayıt oluşmaz — mevcut kayıtlar güncellenir.
 *
 * @param assetId - İlişkili hissenin UUID'si
 * @param candles - Yahoo Finance'ten çekilen ham mum verileri
 * @returns Yazılan toplam kayıt sayısı
 */
export async function upsertCandles(
  assetId: string,
  candles: YahooFinanceCandle[]
): Promise<number> {
  if (candles.length === 0) {
    console.log(`[DB] Yazılacak mum verisi yok (asset: ${assetId}).`);
    return 0;
  }

  // Yahoo Finance verilerini veritabanı formatına dönüştür
  const rows: StockCandleInsert[] = candles.map((candle) => ({
    asset_id: assetId,
    timestamp: candle.date.toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));

  let totalUpserted = 0;

  // Büyük veri setlerini batch'ler halinde upsert et
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);

    const { data, error } = await supabase
      .from("stock_candles")
      .upsert(batch, {
        onConflict: "asset_id,timestamp",
      })
      .select("id");

    if (error) {
      throw new Error(
        `[DB] Mum verisi upsert hatası (asset: ${assetId}, batch: ${i}): ${error.message}`
      );
    }

    totalUpserted += data.length;
  }

  console.log(
    `[DB] ${totalUpserted} mum verisi yazıldı/güncellendi (asset: ${assetId}).`
  );
  return totalUpserted;
}

/**
 * Belirtilen hissenin son N mum verisini getirir.
 * Doğrulama ve debug için kullanılır.
 *
 * @param assetId - Hisse UUID'si
 * @param limit - Getirilecek maksimum kayıt sayısı (default: 5)
 */
export async function getRecentCandles(
  assetId: string,
  limit: number = 5
): Promise<{ timestamp: string; close: number; volume: number }[]> {
  const { data, error } = await supabase
    .from("stock_candles")
    .select("timestamp, close, volume")
    .eq("asset_id", assetId)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `[DB] Son mumlar alınamadı (asset: ${assetId}): ${error.message}`
    );
  }

  return data;
}

/**
 * Belirtilen hissenin toplam mum sayısını döndürür.
 * @param assetId - Hisse UUID'si
 */
export async function getCandleCount(assetId: string): Promise<number> {
  const { count, error } = await supabase
    .from("stock_candles")
    .select("*", { count: "exact", head: true })
    .eq("asset_id", assetId);

  if (error) {
    throw new Error(
      `[DB] Mum sayısı alınamadı (asset: ${assetId}): ${error.message}`
    );
  }

  return count ?? 0;
}
