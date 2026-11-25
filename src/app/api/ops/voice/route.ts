import { connection } from "next/server";
import { json } from "@/lib/api";
import { recentMetrics } from "@/lib/sarvam";
import { lpush, lrange } from "@/lib/store";

/**
 * Voice failover action, called by the NudgeBee runbook after a human approves.
 *
 * It holds no secret on the NudgeBee side: Bolo re-checks its own Sarvam health before acting,
 * so it will only switch voice OFF while the pipeline is degraded and only back ON once it is healthy.
 * The Flagsmith Admin API key lives in Bolo's server environment.
 *
 *   POST /api/ops/voice  {"action":"disable"|"enable","approved_by":"...","source":"nudgebee","incident":"..."}
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; approved_by?: string; source?: string; incident?: string };
  const action = body.action === "enable" ? "enable" : body.action === "disable" ? "disable" : null;
  if (!action) return json({ error: "bad_action", message: 'action must be "disable" or "enable"' }, 400);

  const m = await recentMetrics(5 * 60_000);
  const errors = m.filter((x) => !x.ok).length;
  const errorRate = m.length ? errors / m.length : 0;
  const degraded = errors >= 3 && errorRate >= 0.3;
  const recentOk = m.slice(0, 3).length > 0 && m.slice(0, 3).every((x) => x.ok);

  if (action === "disable" && !degraded)
    return json({ applied: false, reason: "voice pipeline is healthy; refusing to disable voice ordering", errors, error_rate: +errorRate.toFixed(3) }, 409);
  if (action === "enable" && degraded && !recentOk)
    return json({ applied: false, reason: "voice pipeline is still degraded; refusing to re-enable", errors, error_rate: +errorRate.toFixed(3) }, 409);

  const key = process.env.FLAGSMITH_ADMIN_KEY;
  const envId = process.env.FLAGSMITH_ENV_ID;
  const featureId = process.env.FLAGSMITH_VOICE_FEATURE_ID;
  if (!key || !envId || !featureId) return json({ error: "not_configured" }, 500);

  const res = await fetch(`https://api.flagsmith.com/api/v1/environments/${envId}/features/${featureId}/versions/`, {
    method: "POST",
    headers: { Authorization: `Api-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      publish_immediately: true,
      feature_states_to_update: [{ feature_segment: null, enabled: action === "enable", feature_state_value: { type: "unicode", string_value: "" } }],
    }),
  });
  const entry = {
    at: new Date().toISOString(),
    action,
    flag: "voice_ordering",
    flagsmith_status: res.status,
    approved_by: (body.approved_by || "").slice(0, 80),
    source: (body.source || "unknown").slice(0, 40),
    incident: (body.incident || "").slice(0, 120),
    errors,
    error_rate: +errorRate.toFixed(3),
  };
  await lpush("ops:audit", entry, 100);
  return json({ applied: res.ok, ...entry }, res.ok ? 200 : 502);
}

/** Audit trail of failover actions (shown on /ops). */
export async function GET() {
  await connection();
  return json({ actions: await lrange("ops:audit", 0, 19) }, { headers: { "Cache-Control": "no-store" } });
}
