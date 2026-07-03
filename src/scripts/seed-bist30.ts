// BIST 30 hisselerini assets tablosuna ekler
import { supabase } from "../config/supabase.js";

const BIST30: { ticker: string; name: string }[] = [
  { ticker: "AKBNK.IS", name: "Akbank" },
  { ticker: "ARCLK.IS", name: "Arçelik" },
  { ticker: "ASELS.IS", name: "Aselsan" },
  { ticker: "ASTOR.IS", name: "Astor Enerji" },
  { ticker: "BIMAS.IS", name: "BİM Mağazalar" },
  { ticker: "BRSAN.IS", name: "Borusan Mannesmann" },
  { ticker: "DOHOL.IS", name: "Doğan Holding" },
  { ticker: "EKGYO.IS", name: "Emlak Konut GYO" },
  { ticker: "ENKAI.IS", name: "Enka İnşaat" },
  { ticker: "EREGL.IS", name: "Ereğli Demir Çelik" },
  { ticker: "FROTO.IS", name: "Ford Otosan" },
  { ticker: "GARAN.IS", name: "Garanti BBVA" },
  { ticker: "HEKTS.IS", name: "Hektaş" },
  { ticker: "ISCTR.IS", name: "İş Bankası" },
  { ticker: "KCHOL.IS", name: "Koç Holding" },
  { ticker: "KONTR.IS", name: "Kontrolmatik" },
  { ticker: "KOZAL.IS", name: "Koza Altın" },
  { ticker: "KRDMD.IS", name: "Kardemir" },
  { ticker: "MGROS.IS", name: "Migros" },
  { ticker: "ODAS.IS",  name: "Odaş Elektrik" },
  { ticker: "OYAKC.IS", name: "Oyak Çimento" },
  { ticker: "PETKM.IS", name: "Petkim" },
  { ticker: "PGSUS.IS", name: "Pegasus" },
  { ticker: "SAHOL.IS", name: "Sabancı Holding" },
  { ticker: "SASA.IS",  name: "SASA Polyester" },
  { ticker: "SISE.IS",  name: "Şişecam" },
  { ticker: "TCELL.IS", name: "Turkcell" },
  { ticker: "THYAO.IS", name: "Türk Hava Yolları" },
  { ticker: "TOASO.IS", name: "Tofaş" },
  { ticker: "TUPRS.IS", name: "Tüpraş" },
  { ticker: "YKBNK.IS", name: "Yapı Kredi" },
];

async function main() {
  console.log("🗑️  Mevcut assets tablosu temizleniyor...");
  const { error: delErr } = await supabase.from("assets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) { console.error("Silme hatası:", delErr.message); return; }

  console.log(`📥 ${BIST30.length} BIST 30 hissesi ekleniyor...`);
  const { error: insErr } = await supabase.from("assets").insert(
    BIST30.map((a) => ({ ticker: a.ticker, name: a.name, is_active: true }))
  );
  if (insErr) { console.error("Ekleme hatası:", insErr.message); return; }

  const { count } = await supabase.from("assets").select("*", { count: "exact", head: true });
  console.log(`✅ Tamamlandı! Tabloda ${count} hisse var.`);
}

main();
