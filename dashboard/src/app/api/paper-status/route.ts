import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Mod → Hesap adı eşleştirmesi
const MODE_ACCOUNTS: Record<string, { name: string; icon: string; interval: string; sl: number; tp: number; volMul: number; currency?: string }> = {
  // BIST
  TREND:          { name: "Sanal Kasa - Trend Takipçisi (1d)",  icon: "🐢", interval: "1d",  sl: 2.0, tp: 6.0,  volMul: 1.5 },
  AVCI:           { name: "Sanal Kasa - Avcı (1h)",             icon: "🦅", interval: "1h",  sl: 0.8, tp: 2.5,  volMul: 1.2 },
  SCALPER:        { name: "Sanal Kasa - Keskin Nişancı (15m)",  icon: "⚡", interval: "15m", sl: 0.4, tp: 1.2,  volMul: 1.0 },
  // Kripto
  CRYPTO_TREND:   { name: "Sanal Kasa - Kripto Trend (4h)",     icon: "🐢", interval: "4h",  sl: 3.0, tp: 8.0,  volMul: 1.5, currency: "USDT" },
  CRYPTO_AVCI:    { name: "Sanal Kasa - Kripto Avcı (1h)",      icon: "🦅", interval: "1h",  sl: 1.5, tp: 4.0,  volMul: 1.3, currency: "USDT" },
  CRYPTO_SCALPER: { name: "Sanal Kasa - Kripto Scalper (15m)",  icon: "⚡", interval: "15m", sl: 0.5, tp: 1.5,  volMul: 1.0, currency: "USDT" },
};

const INITIAL_BALANCE = 100_000;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const filterMode = url.searchParams.get("mode"); // Opsiyonel: tek mod filtresi

    const leaderboard = [];

    for (const [mode, meta] of Object.entries(MODE_ACCOUNTS)) {
      if (filterMode && filterMode !== mode) continue;

      // Hesap bilgisi
      const { data: account } = await supabase
        .from("paper_accounts")
        .select("*")
        .eq("name", meta.name)
        .single();

      if (!account) {
        leaderboard.push({
          mode, ...meta, exists: false,
          balance: 0, equity: 0, totalInvested: 0,
          totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
          totalPnl: 0, totalPnlPercent: 0,
          openPositions: [], closedPositions: [],
        });
        continue;
      }

      // Açık pozisyonlar
      const { data: openPos } = await supabase
        .from("paper_positions")
        .select("*, assets:asset_id(ticker, name)")
        .eq("account_id", account.id)
        .eq("status", "OPEN")
        .order("created_at", { ascending: false });

      // Kapalı pozisyonlar
      const { data: closedPos } = await supabase
        .from("paper_positions")
        .select("*, assets:asset_id(ticker, name)")
        .eq("account_id", account.id)
        .eq("status", "CLOSED")
        .order("exit_timestamp", { ascending: false })
        .limit(50);

      // İstatistikler
      let totalInvested = 0;
      if (openPos) {
        for (const p of openPos) totalInvested += p.entry_price * p.quantity;
      }

      const closed = closedPos ?? [];
      const wins = closed.filter((p) => (p.profit_loss ?? 0) > 0).length;
      const losses = closed.filter((p) => (p.profit_loss ?? 0) < 0).length;
      const totalTrades = closed.length;
      const totalPnl = closed.reduce((sum, p) => sum + (p.profit_loss ?? 0), 0);

      const balance = account.balance;
      const equity = balance + totalInvested;
      const totalPnlPercent = parseFloat(((equity - INITIAL_BALANCE) / INITIAL_BALANCE * 100).toFixed(2));

      leaderboard.push({
        mode, ...meta, exists: true,
        accountId: account.id,
        balance, equity, totalInvested,
        totalTrades, winningTrades: wins, losingTrades: losses,
        winRate: totalTrades > 0 ? parseFloat((wins / totalTrades * 100).toFixed(1)) : 0,
        totalPnl: parseFloat(totalPnl.toFixed(2)),
        totalPnlPercent,
        openPositions: (openPos ?? []).map((p) => {
          const asset = p.assets as unknown as { ticker: string; name: string } | null;
          return {
            id: p.id, ticker: asset?.ticker ?? "?", assetName: asset?.name ?? "?",
            entryPrice: p.entry_price, stopLoss: p.stop_loss_price, takeProfit: p.take_profit_price,
            quantity: p.quantity, createdAt: p.created_at,
          };
        }),
        closedPositions: closed.map((p) => {
          const asset = p.assets as unknown as { ticker: string; name: string } | null;
          return {
            id: p.id, ticker: asset?.ticker ?? "?", entryPrice: p.entry_price,
            exitPrice: p.exit_price, quantity: p.quantity, profitLoss: p.profit_loss,
            exitTimestamp: p.exit_timestamp, createdAt: p.created_at,
          };
        }),
      });
    }

    return NextResponse.json({ leaderboard });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
