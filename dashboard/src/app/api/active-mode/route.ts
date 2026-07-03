import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const VALID_MODES = ["TREND", "AVCI", "SCALPER"] as const;

// Profil bilgileri (dashboard için)
const PROFILES = {
  TREND: { name: "Trend Takipçisi", icon: "🐢", interval: "1d", sl: 2.0, tp: 6.0, volMul: 2.0, desc: "Günlük mumlar, geniş SL/TP" },
  AVCI: { name: "Avcı", icon: "🦅", interval: "1h", sl: 0.8, tp: 2.5, volMul: 1.5, desc: "Saatlik mumlar, orta SL/TP" },
  SCALPER: { name: "Keskin Nişancı", icon: "⚡", interval: "15m", sl: 0.4, tp: 1.2, volMul: 1.2, desc: "15dk mumlar, dar SL/TP" },
} as const;

/** GET: Aktif modu oku */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("system_config")
      .select("value, updated_at")
      .eq("key", "active_mode")
      .single();

    if (error || !data) {
      return NextResponse.json({ mode: "TREND", profiles: PROFILES });
    }

    const raw = typeof data.value === "string" ? data.value : JSON.stringify(data.value);
    const mode = raw.replace(/"/g, "");

    return NextResponse.json({
      mode: VALID_MODES.includes(mode as typeof VALID_MODES[number]) ? mode : "TREND",
      updatedAt: data.updated_at,
      profiles: PROFILES,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** PUT: Aktif modu güncelle */
export async function PUT(request: NextRequest) {
  try {
    const { mode } = (await request.json()) as { mode: string };

    if (!VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
      return NextResponse.json(
        { error: `Geçersiz mod: ${mode}. Geçerli: ${VALID_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("system_config")
      .upsert({ key: "active_mode", value: JSON.stringify(mode) });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const profile = PROFILES[mode as keyof typeof PROFILES];
    return NextResponse.json({
      mode,
      profile,
      message: `Aktif mod "${profile.icon} ${profile.name}" olarak değiştirildi.`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
