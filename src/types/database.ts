// ============================================================
// Veritabanı Tip Tanımları
// Supabase generics ve uygulama genelinde kullanılan tipler.
//
// NOT: Bu tip tanımları Supabase CLI'ın ürettiği yapıya uyar.
// Her tabloda Row, Insert, Update ve Relationships olmalıdır.
// ============================================================

// ------------------------------------------------------------
// Supabase Database Interface
// supabase-js createClient<Database>() ile tip güvenliği sağlar.
// ------------------------------------------------------------
export interface Database {
  public: {
    Tables: {
      assets: {
        Row: {
          id: string;
          ticker: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ticker: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ticker?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "";
            columns: [];
            isOneToOne: false;
            referencedRelation: "";
            referencedColumns: [];
          },
        ];
      };
      stock_candles: {
        Row: {
          id: string;
          asset_id: string;
          timestamp: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          asset_id: string;
          timestamp: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          asset_id?: string;
          timestamp?: string;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          volume?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_candles_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      paper_accounts: {
        Row: {
          id: string;
          name: string;
          balance: number;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          balance?: number;
          currency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          balance?: number;
          currency?: string;
        };
        Relationships: [
          {
            foreignKeyName: "";
            columns: [];
            isOneToOne: false;
            referencedRelation: "";
            referencedColumns: [];
          },
        ];
      };
      paper_positions: {
        Row: {
          id: string;
          account_id: string;
          asset_id: string;
          type: string;
          entry_price: number;
          stop_loss_price: number;
          take_profit_price: number;
          quantity: number;
          status: string;
          exit_price: number | null;
          exit_timestamp: string | null;
          profit_loss: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          asset_id: string;
          type?: string;
          entry_price: number;
          stop_loss_price: number;
          take_profit_price: number;
          quantity: number;
          status?: string;
          exit_price?: number | null;
          exit_timestamp?: string | null;
          profit_loss?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          asset_id?: string;
          type?: string;
          entry_price?: number;
          stop_loss_price?: number;
          take_profit_price?: number;
          quantity?: number;
          status?: string;
          exit_price?: number | null;
          exit_timestamp?: string | null;
          profit_loss?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "paper_positions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "paper_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "paper_positions_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      system_config: {
        Row: {
          key: string;
          value: unknown;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: unknown;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: unknown;
        };
        Relationships: [
          {
            foreignKeyName: "";
            columns: [];
            isOneToOne: false;
            referencedRelation: "";
            referencedColumns: [];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ------------------------------------------------------------
// Uygulama Katmanı Tipleri (Convenience Aliases)
// ------------------------------------------------------------

/** Assets tablosu: okunan satır tipi */
export type Asset = Database["public"]["Tables"]["assets"]["Row"];

/** Assets tablosu: ekleme tipi */
export type AssetInsert = Database["public"]["Tables"]["assets"]["Insert"];

/** Assets tablosu: güncelleme tipi */
export type AssetUpdate = Database["public"]["Tables"]["assets"]["Update"];

/** Stock Candles tablosu: okunan satır tipi */
export type StockCandle = Database["public"]["Tables"]["stock_candles"]["Row"];

/** Stock Candles tablosu: ekleme tipi */
export type StockCandleInsert = Database["public"]["Tables"]["stock_candles"]["Insert"];

/** Stock Candles tablosu: güncelleme tipi */
export type StockCandleUpdate = Database["public"]["Tables"]["stock_candles"]["Update"];

/** Paper Accounts tablosu: okunan satır tipi */
export type PaperAccount = Database["public"]["Tables"]["paper_accounts"]["Row"];

/** Paper Accounts tablosu: ekleme tipi */
export type PaperAccountInsert = Database["public"]["Tables"]["paper_accounts"]["Insert"];

/** Paper Positions tablosu: okunan satır tipi */
export type PaperPosition = Database["public"]["Tables"]["paper_positions"]["Row"];

/** Paper Positions tablosu: ekleme tipi */
export type PaperPositionInsert = Database["public"]["Tables"]["paper_positions"]["Insert"];

// ------------------------------------------------------------
// Yahoo Finance & Uygulama Tipleri
// ------------------------------------------------------------

/** Yahoo Finance mum aralıkları */
export type CandleInterval = "1d" | "1h" | "5m" | "15m" | "1wk" | "1mo";

/** Yahoo Finance'ten çekilen ham mum verisi */
export interface YahooFinanceCandle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Yahoo Finance veri çekme parametreleri */
export interface FetchCandlesOptions {
  /** Başlangıç tarihi (ISO string veya Date) */
  period1: string | Date;
  /** Bitiş tarihi (ISO string veya Date) — opsiyonel, default: now */
  period2?: string | Date;
  /** Mum aralığı — default: '1d' */
  interval?: CandleInterval;
}

/** Veri toplama sonuç özeti */
export interface CollectionResult {
  ticker: string;
  assetId: string;
  candlesCount: number;
  success: boolean;
  error?: string;
}

/** Toplama işlemi genel özeti */
export interface CollectionSummary {
  totalAssets: number;
  successCount: number;
  failureCount: number;
  totalCandles: number;
  results: CollectionResult[];
  startedAt: Date;
  completedAt: Date;
}

// ------------------------------------------------------------
// Backtest Motoru Tipleri
// ------------------------------------------------------------

/** Backtest yapılandırma seçenekleri */
export interface BacktestOptions {
  /** Başlangıç kasası (TL) — default: 100_000 */
  initialCapital?: number;
  /** Stop-loss oranı (0-1 arası, Örn: 0.02 = %2) — default: 0.02 */
  stopLossRatio?: number;
  /** Take-profit oranı (0-1 arası, Örn: 0.06 = %6) — default: 0.06 */
  takeProfitRatio?: number;
  /** EMA/SMA periyodu — default: 20 */
  indicatorPeriod?: number;
  /** Hacim çarpanı (Hacim > multiplier * SMA ise sinyal) — default: 2 */
  volumeMultiplier?: number;
}

/** İşlem çıkış nedeni */
export type TradeExitReason = "STOP_LOSS" | "TAKE_PROFIT" | "END_OF_DATA";

/** Tek bir işlemin kaydı */
export interface TradeRecord {
  /** İşlem sıra numarası */
  tradeNo: number;
  /** Giriş tarihi */
  entryDate: string;
  /** Giriş fiyatı */
  entryPrice: number;
  /** Çıkış tarihi */
  exitDate: string;
  /** Çıkış fiyatı */
  exitPrice: number;
  /** Alınan lot sayısı */
  quantity: number;
  /** Net kâr/zarar (TL) */
  pnl: number;
  /** Kâr/Zarar oranı (%) */
  pnlPercent: number;
  /** Çıkış nedeni */
  exitReason: TradeExitReason;
}

/** Backtest sonuç raporu */
export interface BacktestResult {
  /** Hisse ticker */
  ticker: string;
  /** Toplam işlenen mum sayısı */
  totalCandles: number;
  /** Toplam açılan/kapanan işlem sayısı */
  totalTrades: number;
  /** Kârla kapanan işlem sayısı */
  winningTrades: number;
  /** Zararla kapanan işlem sayısı */
  losingTrades: number;
  /** Kazanma oranı (%) */
  winRate: number;
  /** Başlangıç kasası (TL) */
  initialCapital: number;
  /** Bitiş kasası (TL) */
  finalCapital: number;
  /** Net kâr/zarar (TL) */
  netPnl: number;
  /** Net kâr/zarar oranı (%) */
  netPnlPercent: number;
  /** Süreçteki maksimum kayıp (%) */
  maxDrawdownPercent: number;
  /** Tüm işlem kayıtları */
  trades: TradeRecord[];
}

// ------------------------------------------------------------
// Paper Trading Motoru Tipleri
// ------------------------------------------------------------

/** Pozisyon durumu */
export type PaperPositionStatus = "OPEN" | "CLOSED";

/** Pozisyon kapatma sonucu */
export interface PositionCloseResult {
  positionId: string;
  ticker: string;
  exitPrice: number;
  profitLoss: number;
  reason: "STOP_LOSS" | "TAKE_PROFIT";
}

/** Sinyal tarama sonucu */
export interface SignalScanResult {
  ticker: string;
  assetId: string;
  signal: boolean;
  currentPrice: number;
  ema20: number;
  volume: number;
  volumeSma20: number;
}

/** Paper Trading çalıştırma özeti */
export interface PaperTradingRunSummary {
  accountName: string;
  currentBalance: number;
  closedPositions: PositionCloseResult[];
  openedPosition: {
    ticker: string;
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    takeProfit: number;
  } | null;
  activePositionCount: number;
  timestamp: Date;
}
