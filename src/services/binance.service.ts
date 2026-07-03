// ============================================================
// Binance Servis — Kripto mum verileri çekme
// Binance Public API (API key gerektirmez)
// ============================================================

interface BinanceCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Binance mum aralık tipleri */
export type BinanceInterval = "1m" | "3m" | "5m" | "15m" | "1h" | "4h" | "1d";

/**
 * Binance'ten mum verisi çeker
 * @param symbol - Örn: "BTCUSDT", "ETHUSDT"
 * @param interval - Mum aralığı
 * @param limit - Kaç mum (max 1000)
 */
export async function fetchBinanceCandles(
  symbol: string,
  interval: BinanceInterval,
  limit: number = 100
): Promise<BinanceCandle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance API hatası: ${res.status} ${res.statusText} — ${symbol}`);
  }

  const data = await res.json();

  return (data as unknown[][]).map((k) => ({
    timestamp: new Date(k[0] as number).toISOString(),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

/**
 * Anlık fiyat bilgisi
 */
export async function fetchBinancePrice(symbol: string): Promise<number> {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance fiyat hatası: ${symbol}`);
  const data = await res.json();
  return parseFloat(data.price);
}
