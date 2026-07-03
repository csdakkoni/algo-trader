import { createClient } from "@supabase/supabase-js";

// Supabase Database tipi (sadece dashboard'un kullandığı tablolar)
interface Database {
  public: {
    Tables: {
      assets: {
        Row: { id: string; ticker: string; name: string; is_active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; ticker: string; name: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; ticker?: string; name?: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Relationships: [{ foreignKeyName: ""; columns: []; isOneToOne: false; referencedRelation: ""; referencedColumns: [] }];
      };
      stock_candles: {
        Row: { id: string; asset_id: string; timestamp: string; open: number; high: number; low: number; close: number; volume: number; created_at: string };
        Insert: { id?: string; asset_id: string; timestamp: string; open: number; high: number; low: number; close: number; volume: number; created_at?: string };
        Update: { id?: string; asset_id?: string; timestamp?: string; open?: number; high?: number; low?: number; close?: number; volume?: number; created_at?: string };
        Relationships: [{ foreignKeyName: "stock_candles_asset_id_fkey"; columns: ["asset_id"]; isOneToOne: false; referencedRelation: "assets"; referencedColumns: ["id"] }];
      };
      paper_accounts: {
        Row: { id: string; name: string; balance: number; currency: string; created_at: string };
        Insert: { id?: string; name: string; balance?: number; currency?: string; created_at?: string };
        Update: { id?: string; name?: string; balance?: number; currency?: string };
        Relationships: [{ foreignKeyName: ""; columns: []; isOneToOne: false; referencedRelation: ""; referencedColumns: [] }];
      };
      paper_positions: {
        Row: { id: string; account_id: string; asset_id: string; type: string; entry_price: number; stop_loss_price: number; take_profit_price: number; quantity: number; status: string; exit_price: number | null; exit_timestamp: string | null; profit_loss: number | null; created_at: string };
        Insert: { id?: string; account_id: string; asset_id: string; type?: string; entry_price: number; stop_loss_price: number; take_profit_price: number; quantity: number; status?: string; exit_price?: number | null; exit_timestamp?: string | null; profit_loss?: number | null; created_at?: string };
        Update: { id?: string; account_id?: string; asset_id?: string; type?: string; entry_price?: number; stop_loss_price?: number; take_profit_price?: number; quantity?: number; status?: string; exit_price?: number | null; exit_timestamp?: string | null; profit_loss?: number | null };
        Relationships: [
          { foreignKeyName: "paper_positions_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "paper_accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "paper_positions_asset_id_fkey"; columns: ["asset_id"]; isOneToOne: false; referencedRelation: "assets"; referencedColumns: ["id"] },
        ];
      };
      system_config: {
        Row: { key: string; value: unknown; updated_at: string };
        Insert: { key: string; value: unknown; updated_at?: string };
        Update: { key?: string; value?: unknown };
        Relationships: [{ foreignKeyName: ""; columns: []; isOneToOne: false; referencedRelation: ""; referencedColumns: [] }];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
