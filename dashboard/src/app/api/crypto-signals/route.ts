import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── Kripto Mod Profilleri ───────────────────────────────────
const CRYPTO_PROFILES: Record<string, { interval: string; sl: number; tp: number; volMul: number; lookback: number; icon: string; name: string }> = {
  CRYPTO_TREND:   { interval: "4h",  sl: 0.03,  tp: 0.08,  volMul: 1.5, lookback: 50,  icon: "🐢", name: "Kripto Trend" },
  CRYPTO_AVCI:    { interval: "1h",  sl: 0.015, tp: 0.04,  volMul: 1.3, lookback: 60,  icon: "🦅", name: "Kripto Avcı" },
  CRYPTO_SCALPER: { interval: "15m", sl: 0.005, tp: 0.015, volMul: 1.0, lookback: 80,  icon: "⚡", name: "Kripto Scalper" },
};

type BinanceInterval = "1m" | "3m" | "5m" | "15m" | "1h" | "4h" | "1d";

// ─── In-Memory Cache (2 dk) ──────────────────────────────────
const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { data: unknown; ts: number }>();

// ─── Binance Mum Çekme ──────────────────────────────────────
async function fetchBinanceCandles(
  symbol: string, interval: BinanceInterval, limit: number
): Promise<{ date: string; close: number; volume: number; high: number; low: number; open: number }[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API: ${res.status} — ${symbol}`);
  const data = await res.json();

  return (data as unknown[][]).map((k) => ({
    date: new Date(k[0] as number).toISOString(),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

// ─── EMA & SMA ──────────────────────────────────────────────
function ema(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const r: number[] = [];
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += data[i]!;
  let e = s / period; r.push(e);
  for (let i = period; i < data.length; i++) {
    e = data[i]! * k + e * (1 - k); r.push(e);
  }
  return r;
}

function sma(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const r: number[] = [];
  let s = 0;
  for (let i = 0; i < period; i++) s += data[i]!;
  r.push(s / period);
  for (let i = period; i < data.length; i++) {
    s += data[i]! - data[i - period]!; r.push(s / period);
  }
  return r;
}

function rsi(data: number[], period: number = 14): number[] {
  if (data.length < period + 1) return [];
  const result: number[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const c = data[i]! - data[i - 1]!;
    if (c > 0) avgGain += c; else avgLoss += Math.abs(c);
  }
  avgGain /= period; avgLoss /= period;
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs0));
  for (let i = period + 1; i < data.length; i++) {
    const c = data[i]! - data[i - 1]!;
    avgGain = (avgGain * (period - 1) + (c > 0 ? c : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (c < 0 ? Math.abs(c) : 0)) / period;
    const rsI = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rsI));
  }
  return result;
}

// ─── API Handler ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const modeParam = url.searchParams.get("mode") ?? "CRYPTO_SCALPER";
    const profile = CRYPTO_PROFILES[modeParam] ?? CRYPTO_PROFILES["CRYPTO_SCALPER"]!;

    // Cache kontrolü
    const cacheKey = `crypto_signals_${modeParam}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    // Kripto varlıkları çek
    const { data: assets } = await supabase
      .from("assets").select("id, ticker, name")
      .eq("is_active", true).like("ticker", "%USDT").order("ticker");

    if (!assets || assets.length === 0) {
      return NextResponse.json({ signals: [], activeMode: modeParam, profile });
    }

    const signals = [];

    for (const asset of assets) {
      try {
        const candles = await fetchBinanceCandles(asset.ticker, profile.interval as BinanceInterval, profile.lookback);

        if (candles.length < 20) {
          signals.push({ ticker: asset.ticker, name: asset.name, signal: "NO_DATA" as const, error: "Yetersiz veri" });
          continue;
        }

        const closes = candles.map((c) => c.close);
        const volumes = candles.map((c) => c.volume);
        const emaValues = ema(closes, 20);
        const smaVolValues = sma(volumes, 20);
        const rsiValues = rsi(closes, 14);

        const lastClose = closes[closes.length - 1]!;
        const lastVolume = volumes[volumes.length - 1]!;
        const prevClose = closes.length >= 2 ? closes[closes.length - 2]! : lastClose;
        const lastEMA = emaValues[emaValues.length - 1]!;
        const lastVolSMA = smaVolValues[smaVolValues.length - 1]!;
        const lastRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1]! : 50;
        const lastCandle = candles[candles.length - 1]!;

        const priceAboveEMA = lastClose > lastEMA;
        const volumeAboveSMA = lastVolume > profile.volMul * lastVolSMA;
        const rsiOverbought = lastRSI > 70;
        const dailyChange = ((lastClose - prevClose) / prevClose) * 100;

        let signal: "BUY" | "WATCH" | "NEUTRAL";
        let signalText: string;

        if (priceAboveEMA && volumeAboveSMA && !rsiOverbought) {
          signal = "BUY";
          signalText = `🟢 AL — EMA üstü, hacim OK, RSI: ${lastRSI.toFixed(0)}`;
        } else if (rsiOverbought) {
          signal = "NEUTRAL";
          signalText = `⚠️ AŞIRI ALIM — RSI: ${lastRSI.toFixed(0)}`;
        } else if (priceAboveEMA && !volumeAboveSMA) {
          signal = "WATCH";
          signalText = `🟡 İZLE — EMA üstü, hacim bekleniyor`;
        } else {
          signal = "NEUTRAL";
          signalText = "⏸️ BEKLİYOR — EMA altında";
        }

        signals.push({
          ticker: asset.ticker,
          name: asset.name,
          signal, signalText,
          currentPrice: lastClose,
          dailyChange: parseFloat(dailyChange.toFixed(2)),
          ema20: parseFloat(lastEMA.toFixed(4)),
          priceAboveEMA,
          volume: lastVolume,
          volumeRatio: parseFloat((lastVolume / lastVolSMA).toFixed(2)),
          volumeThreshold: profile.volMul,
          volumeAboveSMA,
          rsi: parseFloat(lastRSI.toFixed(1)),
          ...(signal === "BUY" ? {
            suggestedEntry: lastClose,
            suggestedSL: parseFloat((lastClose * (1 - profile.sl)).toFixed(4)),
            suggestedTP: parseFloat((lastClose * (1 + profile.tp)).toFixed(4)),
          } : {}),
        });
      } catch (err) {
        signals.push({
          ticker: asset.ticker, name: asset.name,
          signal: "ERROR" as const, error: err instanceof Error ? err.message : "Hata",
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    const result = {
      signals, activeMode: modeParam,
      profile: { icon: profile.icon, name: profile.name, interval: profile.interval, sl: profile.sl, tp: profile.tp, volMul: profile.volMul },
      scannedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 });
  }
}
