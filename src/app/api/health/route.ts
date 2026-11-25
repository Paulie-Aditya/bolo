import { connection } from "next/server";
import { json } from "@/lib/api";
import { getShopFlags } from "@/lib/flags";
import { recentMetrics } from "@/lib/sarvam";
import { SHOPS } from "@/lib/shops";
import { storeKind } from "@/lib/store";


/**
 * Health of Bolo's Sarvam voice pipeline over the last 5 minutes.
 * NudgeBee polls this on a schedule; when status is "degraded" and voice ordering is still on,
 * its runbook opens an incident, asks a human to approve, then flips voice_ordering off in Flagsmith.
 */
export async function GET() {
  await connection();
  const m = await recentMetrics(5 * 60_000);
  const errors = m.filter((x) => !x.ok);
  const lat = m.filter((x) => x.ok).map((x) => x.ms).sort((a, b) => a - b);
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : 0;
  const errorRate = m.length ? errors.length / m.length : 0;
  const degraded = (errors.length >= 3 && errorRate >= 0.3) || p95 > 15000;
  const flags = await getShopFlags(SHOPS[0]);
  const byApi: Record<string, { calls: number; errors: number }> = {};
  m.forEach((x) => {
    const a = (byApi[x.api] ??= { calls: 0, errors: 0 });
    a.calls++;
    if (!x.ok) a.errors++;
  });
  return json(
    {
      service: "bolo",
      status: degraded ? "degraded" : "ok",
      window: "5m",
      sarvam: { calls: m.length, errors: errors.length, error_rate: +errorRate.toFixed(3), p95_ms: p95, by_api: byApi, last_error: errors[0]?.error ?? null },
      flags: { voice_ordering: flags.voiceOrdering, voice_replies: flags.voiceReplies, chaos_sarvam_outage: flags.chaos, source: flags.source },
      action_needed: degraded && flags.voiceOrdering ? "disable_voice_ordering" : "none",
      store: storeKind,
      at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
