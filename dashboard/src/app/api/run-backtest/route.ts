import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runBacktest } from "@/lib/backtest";
import type { StockCandle } from "@/lib/backtest";

// ─── Yahoo Finance Fetch ─────────────────────────────────────
async function fetchYahooCandles(
  ticker: string, period1: number, period2: number, interval: string
): Promise<{ date: string; close: number; volume: number; high: number; low: number; open: number }[]> {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ticker,
      stopLoss = 0.02,
      takeProfit = 0.06,
    } = body as {
      ticker: string;
      stopLoss?: number;
      takeProfit?: number;
    };

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker parametresi gerekli" },
        { status: 400 }
      );
    }

    // 1. Asset'i bul
    const { data: asset, error: assetErr } = await supabase
      .from("assets")
      .select("id, ticker, name")
      .eq("ticker", ticker)
      .single();

    if (assetErr || !asset) {
      return NextResponse.json(
        { error: `Hisse bulunamadı: ${ticker}` },
        { status: 404 }
      );
    }

    // 2. Otomatik Güncelleme (Auto-sync) Kontrolü
    const { data: lastCandle } = await supabase
      .from("stock_candles")
      .select("timestamp")
      .eq("asset_id", asset.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    let needSync = false;
    let syncFromDate = new Date();

    if (!lastCandle) {
      needSync = true;
      syncFromDate.setFullYear(now.getFullYear() - 1); // 1 yıl geriye git
    } else {
      const lastDate = new Date(lastCandle.timestamp);
      const diffMs = now.getTime() - lastDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      // Hafta sonlarını tolere etmek için 2.5 günden eskiyse güncelle
      if (diffDays > 2.5) {
        needSync = true;
        syncFromDate = lastDate;
      }
    }

    if (needSync) {
      try {
        const period1 = Math.floor(syncFromDate.getTime() / 1000);
        const period2 = Math.floor(now.getTime() / 1000);
        const fetched = await fetchYahooCandles(ticker, period1, period2, "1d");

        if (fetched.length > 0) {
          const insertData = fetched.map((c) => ({
            asset_id: asset.id,
            timestamp: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));

          await supabase
            .from("stock_candles")
            .upsert(insertData, { onConflict: "asset_id,timestamp" });
        }
      } catch (syncErr) {
        console.error("Backtest auto-sync hatası:", syncErr);
        // Sync hatasını yut, mevcut verilerle devam etmeye çalış
      }
    }

    // 3. Tüm mumları çek (sayfalama)
    const allCandles: StockCandle[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("stock_candles")
        .select("*")
        .eq("asset_id", asset.id)
        .order("timestamp", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json(
          { error: `Veri çekilemedi: ${error.message}` },
          { status: 500 }
        );
      }

      allCandles.push(...data);
      hasMore = data.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    if (allCandles.length < 20) {
      return NextResponse.json(
        { error: `Yetersiz veri: ${allCandles.length} mum (min 20 gerekli)` },
        { status: 400 }
      );
    }

    // 4. Backtest çalıştır
    const result = runBacktest(ticker, allCandles, {
      stopLossRatio: stopLoss,
      takeProfitRatio: takeProfit,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

