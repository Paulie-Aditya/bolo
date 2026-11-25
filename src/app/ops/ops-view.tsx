"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Health = {
  status: "ok" | "degraded";
  sarvam: { calls: number; errors: number; error_rate: number; p95_ms: number; by_api: Record<string, { calls: number; errors: number }>; last_error: string | null };
  flags: { voice_ordering: boolean; voice_replies: boolean; chaos_sarvam_outage: boolean; source: string };
  action_needed: string;
  store: string;
  at: string;
};

const LOOP = [
  { who: "Bolo", what: "Every Sarvam call (STT, LLM, TTS, translate) is timed and logged. /api/health reports error rate and p95 latency for the last 5 minutes." },
  { who: "NudgeBee", what: "A scheduled automation polls /api/health every minute. When status is degraded and voice ordering is still on, it stores an event, which triggers NudgeBee's AI analysis." },
  { who: "Human", what: "The runbook pauses on an Approval step. The on-call person (or shop owner) approves or rejects in NudgeBee." },
  { who: "Flagsmith", what: "On approval NudgeBee calls Bolo\u2019s failover endpoint, which re-checks health and switches voice_ordering off through the Flagsmith Admin API. No redeploy, and no admin key in NudgeBee." },
  { who: "Customers", what: "The storefront falls back to tap-to-order within seconds. Orders keep flowing during the outage. Switch the flag back on when Sarvam recovers." },
];

export default function Ops() {
  const [h, setH] = useState<Health | null>(null);
  const [audit, setAudit] = useState<{ at: string; action: string; source: string; approved_by: string; incident: string; error_rate: number; flagsmith_status: number }[]>([]);
  useEffect(() => {
    const load = () => {
      fetch("/api/health", { cache: "no-store" }).then((r) => r.json()).then(setH).catch(() => {});
      fetch("/api/ops/voice", { cache: "no-store" }).then((r) => r.json()).then((d) => setAudit(d.actions ?? [])).catch(() => {});
    };
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-5 py-8">
      <Link href="/" className="font-display text-2xl font-bold">
        bolo
      </Link>
      <h1 className="font-display text-4xl font-bold mt-4">Festive-rush ops</h1>
      <p className="text-ink-2 mt-2 max-w-2xl">
        The busiest hour of the year is the worst time for the voice pipeline to fall over. Bolo watches Sarvam, NudgeBee decides with a human in the loop, and Flagsmith degrades gracefully.
      </p>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <div className="card p-5">
          <div className="text-xs font-bold uppercase text-ink-2">Voice pipeline</div>
          <div className={`font-display text-4xl font-bold mt-1 ${h?.status === "degraded" ? "text-rose-600" : "text-ok"}`}>{h ? (h.status === "ok" ? "Healthy" : "Degraded") : "…"}</div>
          <div className="text-sm text-ink-2 mt-1">
            {h ? `${h.sarvam.calls} Sarvam calls · ${(h.sarvam.error_rate * 100).toFixed(0)}% errors · p95 ${(h.sarvam.p95_ms / 1000).toFixed(1)}s` : ""}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-bold uppercase text-ink-2">Flagsmith switches</div>
          <div className="mt-2 space-y-1.5 font-mono text-sm">
            {h &&
              Object.entries({ voice_ordering: h.flags.voice_ordering, voice_replies: h.flags.voice_replies, chaos_sarvam_outage: h.flags.chaos_sarvam_outage }).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${v ? (k.startsWith("chaos") ? "bg-rose-500" : "bg-green-600") : "bg-stone-300"}`} />
                  {k} <span className="ml-auto text-ink-2">{v ? "on" : "off"}</span>
                </div>
              ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-bold uppercase text-ink-2">Runbook decision</div>
          <div className="font-display text-2xl font-bold mt-1">
            {h?.action_needed === "disable_voice_ordering" ? "Pause voice ordering" : h?.status === "degraded" && !h.flags.voice_ordering ? "Handled: tap-to-order" : h && !h.flags.voice_ordering ? "Voice paused" : "No action"}
          </div>
          <div className="text-sm text-ink-2 mt-1 break-words">{h?.sarvam.last_error ?? "No recent errors"}</div>
        </div>
      </div>

      <h2 className="font-display text-2xl font-bold mt-10">The self-healing loop</h2>
      <ol className="mt-4 grid md:grid-cols-5 gap-3">
        {LOOP.map((s, i) => (
          <li key={s.who} className="card p-4">
            <div className="text-xs font-bold text-ink-2">0{i + 1}</div>
            <div className="font-display text-lg font-bold">{s.who}</div>
            <p className="text-sm text-ink-2 mt-1">{s.what}</p>
          </li>
        ))}
      </ol>

      <h2 className="font-display text-2xl font-bold mt-10">Failover audit trail</h2>
      <div className="card mt-3 divide-y divide-line">
        {audit.length === 0 && <div className="p-4 text-sm text-ink-2">No failover actions yet.</div>}
        {audit.map((a) => (
          <div key={a.at} className="p-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-mono text-xs text-ink-2">{new Date(a.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
            <b>{a.action === "disable" ? "voice_ordering → OFF" : "voice_ordering → ON"}</b>
            <span>via {a.source}</span>
            {a.approved_by && <span>approved by {a.approved_by}</span>}
            {a.incident && <span className="text-ink-2 truncate max-w-xs">{a.incident}</span>}
            <span className="text-ink-2">error rate {(a.error_rate * 100).toFixed(0)}% · Flagsmith {a.flagsmith_status}</span>
          </div>
        ))}
      </div>

      <h2 className="font-display text-2xl font-bold mt-10">Raw health (what NudgeBee reads)</h2>
      <pre className="card p-4 mt-3 text-xs overflow-auto">{h ? JSON.stringify(h, null, 2) : "…"}</pre>
      <p className="text-sm text-ink-2 mt-3">
        Game day: switch on <code>chaos_sarvam_outage</code> in Flagsmith, place a few voice orders, and watch the runbook fire.
      </p>
    </main>
  );
}
