import { supabase } from "../config/supabase.js";

// Fiyatı çok düşük coinleri devre dışı bırak (SHIB gibi)
const LOW_PRICE_COINS = ["SHIBUSDT"];

async function main() {
  for (const ticker of LOW_PRICE_COINS) {
    const { error } = await supabase.from("assets").update({ is_active: false }).eq("ticker", ticker);
    console.log(error ? `❌ ${ticker}: ${error.message}` : `✅ ${ticker} devre dışı bırakıldı`);
  }
}
main();
