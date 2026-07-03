// ============================================================
// Yahoo Finance Servisi
// Yahoo Finance Chart API'sine doğrudan HTTP istekleri ile
// hisse senedi mum verilerini çeker.
// Rate limiting ve hata yönetimi dahildir.
// ============================================================

import type {
  YahooFinanceCandle,
  FetchCandlesOptions,
  CandleInterval,
} from "../types/database.js";

// ------------------------------------------------------------
// Yahoo Finance API Tipleri (Dahili)
// ------------------------------------------------------------

/** Yahoo Finance chart API'sinden dönen ham JSON yapısı */
interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        currency: string;
        symbol: string;
        regularMarketPrice: number;
        gmtoffset: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: {
      code: string;
      description: string;
    } | null;
  };
}

// ------------------------------------------------------------
// Yardımcı Fonksiyonlar
// ------------------------------------------------------------

/** Belirtilen milisaniye kadar bekler (rate limiting için) */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Tarih nesnesini Unix timestamp'e (saniye) çevirir */
function toUnixTimestamp(date: string | Date): number {
  const d = date instanceof Date ? date : new Date(date);
  return Math.floor(d.getTime() / 1000);
}

// ------------------------------------------------------------
// Yahoo Finance API Yapılandırması
// ------------------------------------------------------------

const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

/** İstekler arası bekleme süresi (ms) — rate limiting */
const REQUEST_DELAY_MS = 1_000;

/** Fetch için varsayılan User-Agent header'ı */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ------------------------------------------------------------
// Yahoo Finance Servisi
// ------------------------------------------------------------

/**
 * Yahoo Finance Chart API'si üzerinden belirtilen hisse senedinin
 * OHLCV mum verilerini çeker.
 *
 * @param ticker - Hisse kodu (Örn: "THYAO.IS")
 * @param options - Zaman aralığı ve interval parametreleri
 * @returns Formatlı mum verisi dizisi
 *
 * @example
 * ```ts
 * const candles = await fetchCandles("THYAO.IS", {
 *   period1: "2024-06-01",
 *   period2: "2024-07-01",
 *   interval: "1d",
 * });
 * ```
 */
export async function fetchCandles(
  ticker: string,
  options: FetchCandlesOptions
): Promise<YahooFinanceCandle[]> {
  const interval: CandleInterval = options.interval ?? "1d";
  const period1 = toUnixTimestamp(options.period1);
  const period2 = options.period2
    ? toUnixTimestamp(options.period2)
    : Math.floor(Date.now() / 1000);

  const logPeriod1 = new Date(period1 * 1000).toISOString().split("T")[0];
  const logPeriod2 = new Date(period2 * 1000).toISOString().split("T")[0];

  console.log(
    `[YahooFinance] ${ticker} için veri çekiliyor... ` +
      `(${logPeriod1} → ${logPeriod2}, interval: ${interval})`
  );

  // URL oluştur
  const params = new URLSearchParams({
    period1: period1.toString(),
    period2: period2.toString(),
    interval,
    includePrePost: "false",
    events: "",
  });

  const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(ticker)}?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as YahooChartResponse;

    // API hata kontrolü
    if (data.chart.error) {
      throw new Error(
        `Yahoo API Hatası: ${data.chart.error.code} — ${data.chart.error.description}`
      );
    }

    const result = data.chart.result?.[0];
    if (!result || !result.timestamp || !result.indicators.quote[0]) {
      console.warn(`[YahooFinance] ${ticker}: Veri bulunamadı.`);
      return [];
    }

    const { timestamp: timestamps } = result;
    const quote = result.indicators.quote[0];

    // Ham veriyi YahooFinanceCandle dizisine dönüştür
    // null değerleri filtrele (piyasa kapalı günler vb.)
    const candles: YahooFinanceCandle[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open[i];
      const high = quote.high[i];
      const low = quote.low[i];
      const close = quote.close[i];
      const volume = quote.volume[i];

      // Eksik verisi olan mumları atla
      if (
        open == null ||
        high == null ||
        low == null ||
        close == null ||
        volume == null
      ) {
        continue;
      }

      candles.push({
        date: new Date(timestamps[i]! * 1000),
        open,
        high,
        low,
        close,
        volume,
      });
    }

    console.log(`[YahooFinance] ${ticker}: ${candles.length} mum verisi alındı.`);
    return candles;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[YahooFinance] ${ticker} veri çekme hatası: ${message}`);
    throw new Error(`Yahoo Finance veri çekme başarısız (${ticker}): ${message}`);
  }
}

/**
 * Birden fazla hisse için sırayla veri çeker.
 * Her istek arasında rate limiting gecikmesi uygular.
 *
 * @param tickers - Hisse kodları listesi
 * @param options - Zaman aralığı ve interval parametreleri
 * @returns Her hisse için çekilen mum verileri (Map)
 */
export async function fetchCandlesBatch(
  tickers: string[],
  options: FetchCandlesOptions
): Promise<Map<string, YahooFinanceCandle[]>> {
  const results = new Map<string, YahooFinanceCandle[]>();

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;

    // İlk istekten sonra her istek arasında gecikme uygula
    if (i > 0) {
      await delay(REQUEST_DELAY_MS);
    }

    try {
      const candles = await fetchCandles(ticker, options);
      results.set(ticker, candles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[YahooFinance] Batch hatası (${ticker}): ${message}`);
      results.set(ticker, []);
    }
  }

  return results;
}
