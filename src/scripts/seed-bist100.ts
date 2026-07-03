// BIST 100 hisselerini assets tablosuna ekler (Temmuz 2026 güncel)
// Mevcut BIST 30 hisselerini korur, yeni olanları ekler
import { supabase } from "../config/supabase.js";

const BIST100: { ticker: string; name: string }[] = [
  // ── BIST 30 (mevcut) ──────────────────────────
  { ticker: "AKBNK.IS", name: "Akbank" },
  { ticker: "ARCLK.IS", name: "Arçelik" },
  { ticker: "ASELS.IS", name: "Aselsan" },
  { ticker: "ASTOR.IS", name: "Astor Enerji" },
  { ticker: "BIMAS.IS", name: "BİM Mağazalar" },
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
  { ticker: "BRSAN.IS", name: "Borusan Mannesmann" },
  // ── BIST 100 ek hisseler ──────────────────────
  { ticker: "AEFES.IS", name: "Anadolu Efes" },
  { ticker: "AGESA.IS", name: "AgeSA Hayat ve Emeklilik" },
  { ticker: "AKFGY.IS", name: "Akfen GYO" },
  { ticker: "AKSA.IS",  name: "Aksa Akrilik" },
  { ticker: "AKSEN.IS", name: "Aksa Enerji" },
  { ticker: "ALARK.IS", name: "Alarko Holding" },
  { ticker: "ALFAS.IS", name: "Alfa Solar Enerji" },
  { ticker: "ANACM.IS", name: "Anadolu Cam" },
  { ticker: "AYGAZ.IS", name: "Aygaz" },
  { ticker: "BERA.IS",  name: "Bera Holding" },
  { ticker: "BIOEN.IS", name: "Biotrend Enerji" },
  { ticker: "BRYAT.IS", name: "Borusan Yatırım" },
  { ticker: "BUCIM.IS", name: "Bursa Çimento" },
  { ticker: "CCOLA.IS", name: "Coca-Cola İçecek" },
  { ticker: "CIMSA.IS", name: "Çimsa" },
  { ticker: "CWENE.IS", name: "CW Enerji" },
  { ticker: "DOAS.IS",  name: "Doğuş Otomotiv" },
  { ticker: "ECILC.IS", name: "Eczacıbaşı İlaç" },
  { ticker: "EGEEN.IS", name: "Ege Endüstri" },
  { ticker: "ENJSA.IS", name: "Enerjisa" },
  { ticker: "ESEN.IS",  name: "Esenboğa Elektrik" },
  { ticker: "EUPWR.IS", name: "Europower Enerji" },
  { ticker: "GESAN.IS", name: "Giresun Ticaret" },
  { ticker: "GUBRF.IS", name: "Gübre Fabrikaları" },
  { ticker: "HALKB.IS", name: "Halk Bankası" },
  { ticker: "IEYHO.IS", name: "Işıklar Enerji Yapı" },
  { ticker: "ISGYO.IS", name: "İş GYO" },
  { ticker: "KERVT.IS", name: "Kerevitaş" },
  { ticker: "KORDS.IS", name: "Kordsa" },
  { ticker: "KOZAA.IS", name: "Koza Anadolu Metal" },
  { ticker: "KOZAL.IS", name: "Koza Altın" },
  { ticker: "MAVI.IS",  name: "Mavi Giyim" },
  { ticker: "MPARK.IS", name: "MLP Sağlık" },
  { ticker: "ODINE.IS", name: "Odine Teknoloji" },
  { ticker: "OTKAR.IS", name: "Otokar" },
  { ticker: "PAPIL.IS", name: "Papilon Savunma" },
  { ticker: "QUAGR.IS", name: "QUA Granite" },
  { ticker: "SKBNK.IS", name: "Şekerbank" },
  { ticker: "SMRTG.IS", name: "Smart Güneş Enerji" },
  { ticker: "SOKM.IS",  name: "Şok Marketler" },
  { ticker: "TATGD.IS", name: "Tat Gıda" },
  { ticker: "TAVHL.IS", name: "TAV Havalimanları" },
  { ticker: "TKFEN.IS", name: "Tekfen Holding" },
  { ticker: "TMSN.IS",  name: "Tümosan" },
  { ticker: "TRGYO.IS", name: "Torunlar GYO" },
  { ticker: "TSKB.IS",  name: "TSKB" },
  { ticker: "TTKOM.IS", name: "Türk Telekom" },
  { ticker: "TTRAK.IS", name: "Türk Traktör" },
  { ticker: "TUKAS.IS", name: "Tukaş" },
  { ticker: "TURSG.IS", name: "Türkiye Sigorta" },
  { ticker: "ULKER.IS", name: "Ülker" },
  { ticker: "VAKBN.IS", name: "Vakıfbank" },
  { ticker: "VESBE.IS", name: "Vestel Beyaz Eşya" },
  { ticker: "VESTL.IS", name: "Vestel" },
  { ticker: "YEOTK.IS", name: "Yeo Teknoloji" },
  { ticker: "ZOREN.IS", name: "Zorlu Enerji" },
  { ticker: "SRVGY.IS", name: "Servet GYO" },
  { ticker: "KLSER.IS", name: "Kiler Alışveriş" },
  { ticker: "KZBGY.IS", name: "Kuzey Boru GYO" },
  { ticker: "ISMEN.IS", name: "İş Yatırım Menkul" },
];

async function main() {
  console.log(`📥 BIST 100 — ${BIST100.length} hisse ekleniyor...`);
  console.log("   Mevcut hisseler korunacak, yeniler eklenecek.\n");

  let added = 0, skipped = 0, failed = 0;

  for (const stock of BIST100) {
    // Zaten var mı kontrol et
    const { data: existing } = await supabase
      .from("assets")
      .select("id")
      .eq("ticker", stock.ticker)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    // Yeni hisse ekle
    const { error } = await supabase.from("assets").insert({
      ticker: stock.ticker,
      name: stock.name,
      is_active: true,
    });

    if (error) {
      console.log(`  ❌ ${stock.ticker}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✅ ${stock.ticker} (${stock.name})`);
      added++;
    }
  }

  // KOZAL.IS'i devre dışı bırak (Yahoo'da 404 veriyor)
  await supabase.from("assets").update({ is_active: false }).eq("ticker", "KOZAL.IS");
  console.log(`  ⏭️ KOZAL.IS devre dışı bırakıldı (Yahoo 404)\n`);

  const { count } = await supabase.from("assets").select("*", { count: "exact", head: true }).eq("is_active", true);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Yeni eklenen : ${added}`);
  console.log(`  Zaten vardı  : ${skipped}`);
  console.log(`  Hata         : ${failed}`);
  console.log(`  Aktif toplam : ${count}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(console.error);
