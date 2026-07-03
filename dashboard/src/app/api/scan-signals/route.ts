import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── Mod Profilleri ──────────────────────────────────────────
const MODE_PROFILES: Record<string, { interval: string; sl: number; tp: number; volMul: number; lookback: number; icon: string; name: string }> = {
  TREND:   { interval: "1d",  sl: 0.02,  tp: 0.06,  volMul: 2.0, lookback: 40,  icon: "🐢", name: "Trend Takipçisi" },
  AVCI:    { interval: "1h",  sl: 0.008, tp: 0.025, volMul: 1.5, lookback: 60,  icon: "🦅", name: "Avcı" },
  SCALPER: { interval: "15m", sl: 0.004, tp: 0.012, volMul: 1.2, lookback: 80,  icon: "⚡", name: "Keskin Nişancı" },
};

// ─── Yahoo Finance Fetch ─────────────────────────────────────
async function fetchYahooCandles(
  ticker: string, daysBack: number, interval: string
): Promise<{ date: string; close: number; volume: number; high: number; low: number; open: number }[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - daysBack * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=${interval}`;

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo API hatası: ${res.status}`);

  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Veri bulunamadı: ${ticker}`);

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) return [];

  const candles: { date: string; close: number; volume: number; high: number; low: number; open: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = quote.close?.[i], v = quote.volume?.[i], h = quote.high?.[i], l = quote.low?.[i], o = quote.open?.[i];
    if (c != null && v != null) {
      candles.push({ date: new Date(timestamps[i]! * 1000).toISOString(), close: c, volume: v, high: h ?? c, low: l ?? c, open: o ?? c });
    }
  }
  return candles;
}

// ─── İndikatörler ────────────────────────────────────────────
function sma(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const r: number[] = []; let s = 0;
  for (let i = 0; i < period; i++) s += data[i]!;
  r.push(s / period);
  for (let i = period; i < data.length; i++) { s += data[i]! - data[i - period]!; r.push(s / period); }
  return r;
}

function ema(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const r: number[] = [], k = 2 / (period + 1); let s = 0;
  for (let i = 0; i < period; i++) s += data[i]!;
  let v = s / period; r.push(v);
  for (let i = period; i < data.length; i++) { v = data[i]! * k + v * (1 - k); r.push(v); }
  return r;
}

// ─── Aktif Mod Oku ───────────────────────────────────────────
async function getActiveMode(): Promise<string> {
  const { data } = await supabase.from("system_config").select("value").eq("key", "active_mode").single();
  if (!data) return "TREND";
  const raw = typeof data.value === "string" ? data.value : JSON.stringify(data.value);
  return raw.replace(/"/g, "");
}

// ─── API Handler ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    // URL'den mod parametresi alınabilir, yoksa Supabase'den oku
    const url = new URL(request.url);
    const modeParam = url.searchParams.get("mode");
    const activeMode = modeParam && MODE_PROFILES[modeParam] ? modeParam : await getActiveMode();
    const profile = MODE_PROFILES[activeMode] ?? MODE_PROFILES["TREND"]!;

    // Geriye bakış süresi: interval'a göre gün hesapla
    let daysBack: number;
    if (profile.interval === "1d") daysBack = profile.lookback;
    else if (profile.interval === "1h") daysBack = Math.ceil(profile.lookback / 24) + 2;
    else daysBack = Math.ceil(profile.lookback / 96) + 2;

    // Aktif hisseleri çek
    const { data: assets } = await supabase
      .from("assets").select("id, ticker, name").eq("is_active", true).order("ticker");

    if (!assets || assets.length === 0) {
      return NextResponse.json({ signals: [], activeMode, profile });
    }

    const signals = [];

    for (const asset of assets) {
      try {
        const candles = await fetchYahooCandles(asset.ticker, daysBack, profile.interval);

        if (candles.length < 20) {
          signals.push({ ticker: asset.ticker, name: asset.name, signal: "NO_DATA" as const, error: "Yetersiz veri" });
          continue;
        }

        const closes = candles.map((c) => c.close);
        const volumes = candles.map((c) => c.volume);
        const emaValues = ema(closes, 20);
        const smaVolValues = sma(volumes, 20);

        const lastClose = closes[closes.length - 1]!;
        const lastVolume = volumes[volumes.length - 1]!;
        const prevClose = closes.length >= 2 ? closes[closes.length - 2]! : lastClose;
        const lastEMA = emaValues[emaValues.length - 1]!;
        const lastVolSMA = smaVolValues[smaVolValues.length - 1]!;
        const lastCandle = candles[candles.length - 1]!;

        const priceAboveEMA = lastClose > lastEMA;
        const volumeAboveSMA = lastVolume > profile.volMul * lastVolSMA;
        const dailyChange = ((lastClose - prevClose) / prevClose) * 100;

        let signal: "BUY" | "WATCH" | "NEUTRAL";
        let signalText: string;

        if (priceAboveEMA && volumeAboveSMA) {
          signal = "BUY";
          signalText = `🟢 AL SİNYALİ — Fiyat EMA üzerinde ve hacim ×${profile.volMul} aştı (${profile.icon} ${profile.name})`;
        } else if (priceAboveEMA && !volumeAboveSMA) {
          signal = "WATCH";
          signalText = `🟡 İZLE — Fiyat EMA üzerinde, hacim ×${profile.volMul} eşiği bekleniyor`;
        } else {
          signal = "NEUTRAL";
          signalText = "⏸️ BEKLİYOR — Fiyat EMA altında";
        }

        signals.push({
          ticker: asset.ticker,
          name: asset.name,
          signal, signalText,
          lastDate: lastCandle.date,
          currentPrice: lastClose,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          dailyChange: parseFloat(dailyChange.toFixed(2)),
          ema20: parseFloat(lastEMA.toFixed(2)),
          priceVsEMA: parseFloat(((lastClose / lastEMA - 1) * 100).toFixed(2)),
          priceAboveEMA,
          volume: lastVolume,
          volumeSMA20: parseFloat(lastVolSMA.toFixed(0)),
          volumeRatio: parseFloat((lastVolume / lastVolSMA).toFixed(2)),
          volumeThreshold: profile.volMul,
          volumeAboveSMA,
          ...(priceAboveEMA && volumeAboveSMA ? {
            suggestedEntry: lastClose,
            suggestedSL: parseFloat((lastClose * (1 - profile.sl)).toFixed(2)),
            suggestedTP: parseFloat((lastClose * (1 + profile.tp)).toFixed(2)),
          } : {}),
        });
      } catch (err) {
        signals.push({
          ticker: asset.ticker, name: asset.name,
          signal: "ERROR" as const, error: err instanceof Error ? err.message : "Bilinmeyen hata",
        });
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return NextResponse.json({
      signals, activeMode,
      profile: { icon: profile.icon, name: profile.name, interval: profile.interval, sl: profile.sl, tp: profile.tp, volMul: profile.volMul },
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 });
  }
}
