// ============================================================
// Supabase Client Yapılandırması
// Service Role Key ile server-side erişim sağlar.
// ============================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.js";
import "dotenv/config";

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[Config] Çevre değişkeni bulunamadı: ${name}\n` +
        `.env dosyasını oluşturup gerekli değerleri girdiğinizden emin olun.\n` +
        `Örnek için .env.example dosyasına bakın.`
    );
  }
  return value;
}

const supabaseUrl = getEnvVar("SUPABASE_URL");
const supabaseKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
