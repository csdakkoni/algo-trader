"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ─── Tipler ──────────────────────────────────────────────────
interface OpenPosition {
  id: string; ticker: string; assetName: string;
  entryPrice: number; stopLoss: number; takeProfit: number;
  quantity: number; createdAt: string;
}
interface ClosedPosition {
  id: string; ticker: string; entryPrice: number; exitPrice: number | null;
  quantity: number; profitLoss: number | null;
  exitTimestamp: string | null; createdAt: string;
}
interface StrategyEntry {
  mode: string; name: string; icon: string; interval: string;
  sl: number; tp: number; volMul: number; exists: boolean;
  accountId?: string; balance: number; equity: number; totalInvested: number;
  totalTrades: number; winningTrades: number; losingTrades: number; winRate: number;
  totalPnl: number; totalPnlPercent: number;
  openPositions: OpenPosition[]; closedPositions: ClosedPosition[];
}
interface SignalData {
  ticker: string; name: string;
  signal: "BUY" | "WATCH" | "NEUTRAL" | "NO_DATA" | "ERROR";
  signalText?: string; currentPrice?: number;
  dailyChange?: number; ema20?: number; priceAboveEMA?: boolean;
  volume?: number; volumeRatio?: number; volumeThreshold?: number; volumeAboveSMA?: boolean;
  suggestedEntry?: number; suggestedSL?: number; suggestedTP?: number;
  error?: string;
}
interface BacktestTrade {
  tradeNo: number; entryDate: string; entryPrice: number;
  exitDate: string; exitPrice: number; quantity: number;
  pnl: number; pnlPercent: number; exitReason: string;
}
interface BacktestResult {
  ticker: string; totalCandles: number; totalTrades: number;
  winningTrades: number; losingTrades: number; winRate: number;
  initialCapital: number; finalCapital: number;
  netPnl: number; netPnlPercent: number; maxDrawdownPercent: number;
  trades: BacktestTrade[];
}

type StrategyMode = "TREND" | "AVCI" | "SCALPER" | "CRYPTO_TREND" | "CRYPTO_AVCI" | "CRYPTO_SCALPER";
type MarketTab = "BIST" | "CRYPTO";

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Ana Dashboard ───────────────────────────────────────────
export default function Dashboard() {
  const [leaderboard, setLeaderboard] = useState<StrategyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<StrategyMode>("TREND");
  const [marketTab, setMarketTab] = useState<MarketTab>("BIST");

  // Sinyal state
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [signalLoading, setSignalLoading] = useState(false);
  const signalRequestId = useRef(0); // Yarış durumu önleyici

  // Backtest state
  const [btTicker, setBtTicker] = useState("THYAO.IS");
  const [btSL, setBtSL] = useState(2);
  const [btTP, setBtTP] = useState(6);
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch("/api/paper-status");
      const data = await res.json();
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchSignals = useCallback(async (mode: StrategyMode) => {
    const requestId = ++signalRequestId.current;
    setSignalLoading(true);
    setSignals([]); // Önceki verileri temizle
    try {
      const isCryptoMode = mode.startsWith("CRYPTO_");
      const apiUrl = isCryptoMode
        ? `/api/crypto-signals?mode=${mode}`
        : `/api/scan-signals?mode=${mode}`;
      const res = await fetch(apiUrl);
      const data = await res.json();
      // Sadece en son isteğin sonucunu uygula
      if (requestId === signalRequestId.current) {
        setSignals(data.signals ?? []);
      }
    } catch { /* ignore */ }
    if (requestId === signalRequestId.current) {
      setSignalLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaderboard(); fetchSignals(selectedMode); }, [fetchLeaderboard, fetchSignals, selectedMode]);

  const selectMode = (mode: StrategyMode) => {
    setSelectedMode(mode);
    fetchSignals(mode);
  };

  const runBacktest = async () => {
    setBtLoading(true); setBtResult(null);
    try {
      const res = await fetch("/api/run-backtest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: btTicker, stopLoss: btSL / 100, takeProfit: btTP / 100 }),
      });
      const data = await res.json();
      if (!data.error) setBtResult(data);
    } catch { /* ignore */ }
    setBtLoading(false);
  };

  const selected = leaderboard.find((s) => s.mode === selectedMode);

  // Piyasaya göre filtrele
  const isCrypto = (mode: string) => mode.startsWith("CRYPTO_");
  const filteredLeaderboard = leaderboard.filter((s) => 
    marketTab === "CRYPTO" ? isCrypto(s.mode) : !isCrypto(s.mode)
  );
  const sorted = [...filteredLeaderboard].sort((a, b) => b.equity - a.equity);
  const currencySymbol = marketTab === "CRYPTO" ? "$" : "₺";

  const switchMarket = (tab: MarketTab) => {
    setMarketTab(tab);
    const defaultMode = tab === "CRYPTO" ? "CRYPTO_SCALPER" : "TREND";
    setSelectedMode(defaultMode as StrategyMode);
    fetchSignals(defaultMode as StrategyMode);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            📊 Algo Trader <span className="text-[var(--color-accent)]">Dashboard</span>
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">BIST + Kripto — 6’lı Paralel Strateji</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse-glow" />
          Sistem Aktif
        </div>
      </header>

      {/* ═══ PİYASA SEKMESİ ═══ */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => switchMarket("BIST")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            marketTab === "BIST"
              ? "bg-[var(--color-accent)] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]"
              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
          }`}
        >
          🇹🇷 BIST 100
        </button>
        <button
          onClick={() => switchMarket("CRYPTO")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            marketTab === "CRYPTO"
              ? "bg-[var(--color-warning)] text-black shadow-[0_0_20px_rgba(245,158,11,0.3)]"
              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
          }`}
        >
          🪙 Kripto
        </button>
      </div>

      {/* ═══ LİDERLİK TABLOSU ═══ */}
      <section className="mb-8 animate-fade-in">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">
          🏆 Strateji Liderlik Tablosu
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-44 rounded-xl animate-shimmer" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sorted.map((s, idx) => {
              const isSelected = s.mode === selectedMode;
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
              const pnlColor = s.totalPnlPercent >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]";

              return (
                <button
                  key={s.mode}
                  onClick={() => selectMode(s.mode as StrategyMode)}
                  className={`relative rounded-xl p-5 text-left transition-all duration-200 border-2 cursor-pointer ${
                    isSelected
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-light)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {/* Sıralama madalyası */}
                  <span className="absolute top-3 right-3 text-lg">{medal}</span>
                  {isSelected && <span className="absolute top-3 right-10 w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse-glow" />}

                  {/* Başlık */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-2xl">{s.icon}</span>
                    <div>
                      <p className={`text-sm font-bold ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"}`}>
                        {s.name}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] uppercase">{s.interval} interval</p>
                    </div>
                  </div>

                  {/* Özkaynak & K/Z */}
                  <div className="mb-3">
                    <p className="text-xl font-bold text-[var(--color-text-primary)]">{currencySymbol}{fmt(s.equity)}</p>
                    <p className={`text-sm font-semibold ${pnlColor}`}>
                      {s.totalPnlPercent >= 0 ? "+" : ""}{s.totalPnlPercent.toFixed(2)}%
                      <span className="text-xs font-normal text-[var(--color-text-muted)] ml-1.5">
                        ({s.totalPnl >= 0 ? "+" : ""}{currencySymbol}{fmt(s.totalPnl)})
                      </span>
                    </p>
                  </div>

                  {/* İstatistikler */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-[var(--color-background)] py-1.5 px-1">
                      <p className="text-[var(--color-text-muted)]">İşlem</p>
                      <p className="font-bold text-[var(--color-text-primary)]">{s.totalTrades}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-background)] py-1.5 px-1">
                      <p className="text-[var(--color-text-muted)]">Win</p>
                      <p className="font-bold text-[var(--color-success)]">{s.winRate}%</p>
                    </div>
                    <div className="rounded-lg bg-[var(--color-background)] py-1.5 px-1">
                      <p className="text-[var(--color-text-muted)]">Açık</p>
                      <p className="font-bold text-[var(--color-accent)]">{s.openPositions.length}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ SEÇİLİ STRATEJİ DETAYLARI ═══ */}
      {selected && (
        <>
          {/* Açık Pozisyonlar */}
          {selected.openPositions.length > 0 && (
            <section className="mb-8 animate-fade-in">
              <h2 className="text-lg font-semibold mb-4 text-[var(--color-text-secondary)]">
                {selected.icon} {selected.name} — Açık Pozisyonlar
              </h2>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--color-text-muted)] text-left border-b border-[var(--color-border)]">
                      <th className="pb-2 font-medium">{marketTab === "CRYPTO" ? "Coin" : "Hisse"}</th>
                      <th className="pb-2 font-medium">Giriş {currencySymbol}</th>
                      <th className="pb-2 font-medium">Adet</th>
                      <th className="pb-2 font-medium">Stop Loss</th>
                      <th className="pb-2 font-medium">Take Profit</th>
                      <th className="pb-2 font-medium">Alım Saati</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.openPositions.map((p) => (
                      <tr key={p.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="py-2.5 font-semibold text-[var(--color-accent)]">{p.ticker}</td>
                        <td className="py-2.5">{currencySymbol}{fmt(p.entryPrice)}</td>
                        <td className="py-2.5">{p.quantity}</td>
                        <td className="py-2.5 text-[var(--color-danger)]">{currencySymbol}{fmt(p.stopLoss)}</td>
                        <td className="py-2.5 text-[var(--color-success)]">{currencySymbol}{fmt(p.takeProfit)}</td>
                        <td className="py-2.5 text-[var(--color-text-muted)] text-xs">{fmtDate(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ═══ SİNYAL TARAYICI ═══ */}
           <section className="mb-8 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-text-secondary)]">
                📡 {selected.icon} {selected.name} — Sinyal Tarayıcı
                <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">({selected.interval})</span>
              </h2>
              <button
                onClick={() => fetchSignals(selectedMode)}
                disabled={signalLoading}
                className="px-4 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-all disabled:opacity-50"
              >
                {signalLoading ? "Taranıyor..." : "🔄 Yenile"}
              </button>
            </div>

            {signalLoading && signals.length === 0 ? (
              <div className="h-32 rounded-xl animate-shimmer" />
            ) : signals.length > 0 ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--color-text-muted)] text-left border-b border-[var(--color-border)] text-xs uppercase">
                      <th className="px-4 py-3 font-medium">Sinyal</th>
                      <th className="px-4 py-3 font-medium">{marketTab === "CRYPTO" ? "Coin" : "Hisse"}</th>
                      <th className="px-4 py-3 font-medium text-right">Fiyat</th>
                      <th className="px-4 py-3 font-medium text-right">Değişim</th>
                      <th className="px-4 py-3 font-medium text-right">EMA(20)</th>
                      <th className="px-4 py-3 font-medium text-center">EMA</th>
                      <th className="px-4 py-3 font-medium text-right">Hacim</th>
                      <th className="px-4 py-3 font-medium text-center">Vol</th>
                      <th className="px-4 py-3 font-medium text-right">SL</th>
                      <th className="px-4 py-3 font-medium text-right">TP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...signals]
                      .sort((a, b) => {
                        const order: Record<string, number> = { BUY: 0, WATCH: 1, NEUTRAL: 2, NO_DATA: 3, ERROR: 4 };
                        return (order[a.signal] ?? 5) - (order[b.signal] ?? 5);
                      })
                      .map((s) => (
                      <tr
                        key={s.ticker}
                        className={`border-b border-[var(--color-border)]/30 transition-colors ${
                          s.signal === "BUY"
                            ? "bg-[var(--color-success)]/8 hover:bg-[var(--color-success)]/15"
                            : "hover:bg-[var(--color-surface-hover)]"
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.signal === "BUY" ? "bg-[var(--color-success)] text-white"
                              : s.signal === "WATCH" ? "bg-[var(--color-warning)] text-black"
                                : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                          }`}>
                            {s.signal === "BUY" ? "AL" : s.signal === "WATCH" ? "İZLE" : "BEKLE"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-[var(--color-text-primary)]">{s.ticker.replace(".IS", "").replace("USDT", "")}</span>
                          <span className="text-[10px] text-[var(--color-text-muted)] ml-1.5">{s.name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--color-text-primary)]">
                          {s.currentPrice != null ? `${currencySymbol}${fmt(s.currentPrice)}` : "—"}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${
                          (s.dailyChange ?? 0) >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                        }`}>
                          {s.dailyChange != null ? `${s.dailyChange >= 0 ? "+" : ""}${s.dailyChange.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">
                          {s.ema20 != null ? `${currencySymbol}${s.ema20.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs ${s.priceAboveEMA ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                            {s.priceAboveEMA ? "✓" : "✗"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">
                          ×{s.volumeRatio ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs ${s.volumeAboveSMA ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}`}>
                            {s.volumeAboveSMA ? "🔥" : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--color-danger)]">
                          {s.suggestedSL != null ? `${currencySymbol}${fmt(s.suggestedSL)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--color-success)]">
                          {s.suggestedTP != null ? `${currencySymbol}${fmt(s.suggestedTP)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
                Sinyal verisi yükleniyor...
              </div>
            )}
          </section>

          {/* ═══ İŞLEM GEÇMİŞİ ═══ */}
          <section className="mb-8 animate-fade-in">
            <h2 className="text-lg font-semibold mb-4 text-[var(--color-text-secondary)]">
              📋 {selected.icon} {selected.name} — İşlem Geçmişi
            </h2>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              {selected.closedPositions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[var(--color-text-muted)] text-left border-b border-[var(--color-border)]">
                        <th className="pb-2 font-medium">Alım</th>
                        <th className="pb-2 font-medium">Satış</th>
                        <th className="pb-2 font-medium">{marketTab === "CRYPTO" ? "Coin" : "Hisse"}</th>
                        <th className="pb-2 font-medium">Giriş {currencySymbol}</th>
                        <th className="pb-2 font-medium">Çıkış {currencySymbol}</th>
                        <th className="pb-2 font-medium">Adet</th>
                        <th className="pb-2 font-medium">K/Z {currencySymbol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.closedPositions.map((p) => (
                        <tr key={p.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface-hover)] transition-colors">
                          <td className="py-2.5 text-[var(--color-text-muted)] text-xs">{fmtDate(p.createdAt)}</td>
                          <td className="py-2.5 text-[var(--color-text-muted)] text-xs">{p.exitTimestamp ? fmtDate(p.exitTimestamp) : "—"}</td>
                          <td className="py-2.5 font-semibold text-[var(--color-accent)]">{p.ticker}</td>
                          <td className="py-2.5">{currencySymbol}{fmt(p.entryPrice)}</td>
                          <td className="py-2.5">{p.exitPrice != null ? `${currencySymbol}${fmt(p.exitPrice)}` : "—"}</td>
                          <td className="py-2.5">{p.quantity}</td>
                          <td className={`py-2.5 font-semibold ${(p.profitLoss ?? 0) >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                            {p.profitLoss != null ? `${p.profitLoss >= 0 ? "+" : ""}${currencySymbol}${fmt(p.profitLoss)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10 text-[var(--color-text-muted)]">
                  <p className="text-3xl mb-2">📭</p>
                  <p>Bu strateji henüz kapanmış işlem üretmedi.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* ═══ BACKTEST SİMÜLATÖRÜ ═══ */}
      <section className="mb-8 animate-fade-in">
        <h2 className="text-lg font-semibold mb-4 text-[var(--color-text-secondary)]">🧪 Backtest Simülatörü</h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wider">Hisse</label>
              <select value={btTicker} onChange={(e) => setBtTicker(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] cursor-pointer">
                {signals.length > 0 ? (
                  signals.map((s) => (
                    <option key={s.ticker} value={s.ticker}>{s.ticker.replace(".IS", "")} — {s.name}</option>
                  ))
                ) : (
                  <option value="THYAO.IS">THYAO — Türk Hava Yolları</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wider">
                Stop Loss: <span className="text-[var(--color-danger)] font-bold">%{btSL}</span>
              </label>
              <input type="range" min={1} max={5} step={0.5} value={btSL} onChange={(e) => setBtSL(Number(e.target.value))} className="w-full mt-1" />
              <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-1"><span>%1</span><span>%5</span></div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wider">
                Take Profit: <span className="text-[var(--color-success)] font-bold">%{btTP}</span>
              </label>
              <input type="range" min={3} max={15} step={1} value={btTP} onChange={(e) => setBtTP(Number(e.target.value))} className="w-full mt-1" />
              <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-1"><span>%3</span><span>%15</span></div>
            </div>
            <div className="flex items-end">
              <button onClick={runBacktest} disabled={btLoading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white disabled:opacity-50 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-[0.98]">
                {btLoading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>Çalışıyor...</span> : "🚀 Backtest Çalıştır"}
              </button>
            </div>
          </div>
          {btResult && (
            <div className="animate-fade-in">
              <div className="h-px bg-[var(--color-border)] mb-6" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <MiniStat label="Win Rate" value={`${btResult.winRate}%`} color={btResult.winRate >= 50 ? "success" : "danger"} />
                <MiniStat label="Net K/Z" value={`₺${fmt(btResult.netPnl)}`} color={btResult.netPnl >= 0 ? "success" : "danger"} />
                <MiniStat label="K/Z %" value={`${btResult.netPnlPercent}%`} color={btResult.netPnlPercent >= 0 ? "success" : "danger"} />
                <MiniStat label="Toplam İşlem" value={`${btResult.totalTrades}`} color="accent" />
                <MiniStat label="Max Drawdown" value={`${btResult.maxDrawdownPercent}%`} color="danger" />
              </div>
              {btResult.trades.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[var(--color-text-muted)] text-left border-b border-[var(--color-border)]">
                        <th className="pb-2 font-medium">#</th><th className="pb-2 font-medium">Giriş</th><th className="pb-2 font-medium">Giriş ₺</th>
                        <th className="pb-2 font-medium">Çıkış</th><th className="pb-2 font-medium">Çıkış ₺</th><th className="pb-2 font-medium">K/Z ₺</th><th className="pb-2 font-medium">Neden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btResult.trades.map((t) => (
                        <tr key={t.tradeNo} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface-hover)] transition-colors">
                          <td className="py-2 text-[var(--color-text-muted)]">{t.tradeNo}</td>
                          <td className="py-2">{new Date(t.entryDate).toLocaleDateString("tr-TR")}</td>
                          <td className="py-2">₺{fmt(t.entryPrice)}</td>
                          <td className="py-2">{new Date(t.exitDate).toLocaleDateString("tr-TR")}</td>
                          <td className="py-2">₺{fmt(t.exitPrice)}</td>
                          <td className={`py-2 font-semibold ${t.pnl >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                            {t.pnl >= 0 ? "+" : ""}₺{fmt(t.pnl)}
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              t.exitReason === "TAKE_PROFIT" ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                                : t.exitReason === "STOP_LOSS" ? "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
                                  : "bg-[var(--color-border)] text-[var(--color-text-muted)]"}`}>
                              {t.exitReason === "TAKE_PROFIT" ? "🎯 Kâr" : t.exitReason === "STOP_LOSS" ? "⛔ Stop" : "📅 Son"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="mt-8 pb-6 text-center text-xs text-[var(--color-text-muted)]">
        Algo Trader v2.0 — 3'lü Paralel Strateji Yarışı
      </footer>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  const c: Record<string, string> = { success: "text-[var(--color-success)]", danger: "text-[var(--color-danger)]", accent: "text-[var(--color-accent)]" };
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-center">
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className={`text-lg font-bold ${c[color] ?? ""}`}>{value}</p>
    </div>
  );
}
