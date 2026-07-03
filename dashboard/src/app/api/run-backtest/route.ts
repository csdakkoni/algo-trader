import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runBacktest } from "@/lib/backtest";
import type { StockCandle } from "@/lib/backtest";

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

    // 2. Tüm mumları çek (sayfalama)
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

    // 3. Backtest çalıştır
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
