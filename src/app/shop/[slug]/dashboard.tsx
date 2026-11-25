"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { inr, qtyLabel, useRecorder } from "@/components/client-utils";

type Line = { itemId: string; name: string; qty: number; unit: string; price: number; lineTotal: number };
type Order = {
  id: string;
  token: string;
  customerName: string;
  customerLang: string;
  channel: "voice" | "tap";
  transcript: string;
  englishSummary: string;
  ownerSummary: string;
  lines: Line[];
  total: number;
  slot: string;
  slotLabel: string;
  notes: string;
  status: "new" | "preparing" | "ready" | "picked";
  createdAt: number;
  upsellVariant: string;
  upsellAccepted: boolean;
  readyText?: string;
};
type Data = {
  shop: { slug: string; name: string; area: string; city: string; ownerName: string; ownerLang: string; plan: string };
  catalog: { id: string; name: string; emoji: string; price: number; unit: string; fast: boolean; soldOut: boolean }[];
  orders: Order[];
  flags: {
    theme: { festival: string; emoji: string; accent: string; accent2: string };
    rush: { enabled: boolean; config: { slot_capacity: number } };
    voiceOrdering: boolean;
    voiceReplies: boolean;
    ownerVoiceCommands: boolean;
    chaos: boolean;
    source: string;
  };
  stats: {
    ordersToday: number;
    revenueToday: number;
    voiceShare: number;
    pending: number;
    topItems: { name: string; qty: number; unit: string; revenue: number }[];
    languages: { lang: string; n: number }[];
    variants: Record<string, { orders: number; revenue: number }>;
  };
};

const LANG: Record<string, string> = {
  "hi-IN": "Hindi",
  "kn-IN": "Kannada",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "ml-IN": "Malayalam",
  "bn-IN": "Bengali",
  "mr-IN": "Marathi",
  "gu-IN": "Gujarati",
  "pa-IN": "Punjabi",
  "od-IN": "Odia",
  "en-IN": "English",
};

const COLUMNS: { key: Order["status"]; title: string; next?: Order["status"]; cta?: string }[] = [
  { key: "new", title: "New", next: "preparing", cta: "Start packing" },
  { key: "preparing", title: "Packing", next: "ready", cta: "Mark ready · notify" },
  { key: "ready", title: "Ready for pickup", next: "picked", cta: "Picked up" },
];

export default function Dashboard() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [qr, setQr] = useState("");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/shop/${slug}/orders`, { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as Data;
    if (seen.current) {
      const newOnes = d.orders.filter((o) => !seen.current!.has(o.id)).map((o) => o.id);
      if (newOnes.length) {
        setFresh(new Set(newOnes));
        ding();
        setTimeout(() => setFresh(new Set()), 4000);
      }
    }
    seen.current = new Set(d.orders.map((o) => o.id));
    setData(d);
  }, [slug]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    QRCode.toDataURL(`${location.origin}/s/${slug}`, { margin: 1, width: 240, color: { dark: "#1d1712", light: "#fffdf8" } }).then(setQr);
  }, [slug]);

  async function move(o: Order, status: Order["status"]) {
    setBusy(o.id);
    await fetch(`/api/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
    setBusy("");
  }

  async function control(body: unknown) {
    setBusy("control");
    await fetch(`/api/shop/${slug}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
    setBusy("");
  }

  if (!data)
    return (
      <div className="flex-1 grid place-items-center">
        <div className="eq text-accent">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    );

  const { shop, flags, stats } = data;
  const active = data.orders.filter((o) => o.status !== "picked");
  const ownerLang = LANG[shop.ownerLang] ?? shop.ownerLang;

  return (
    <main className="flex-1" style={{ "--accent": flags.theme.accent, "--accent-2": flags.theme.accent2 } as React.CSSProperties}>
      <header className="border-b border-line bg-[#fffdf8]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-5 py-3 flex items-center gap-4">
          <Link href="/" className="font-display text-2xl font-bold">
            bolo
          </Link>
          <span className="text-line">/</span>
          <div>
            <div className="font-bold leading-tight">{shop.name}</div>
            <div className="text-xs text-ink-2">
              {shop.area}, {shop.city} · owner reads in {ownerLang}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="chip">
              <span className="h-2 w-2 rounded-full bg-ok animate-pulse" /> Live
            </span>
            <span className="chip">
              {flags.theme.emoji} {flags.theme.festival}
            </span>
            <Link href={`/s/${slug}`} target="_blank" className="btn btn-ghost !py-2 text-sm">
              Open storefront ↗
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-5 py-5 grid lg:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Orders today" value={String(stats.ordersToday)} />
            <Stat label="Revenue today" value={inr(stats.revenueToday)} />
            <Stat label="To pack" value={String(stats.pending)} accent={stats.pending > 0} />
            <Stat label="Ordered by voice" value={`${Math.round(stats.voiceShare * 100)}%`} />
          </div>

          {!flags.voiceOrdering && (
            <div className="card px-4 py-3 border-amber-300 bg-amber-50 text-sm flex gap-3 items-center">
              <span className="text-xl">🛟</span>
              <div>
                <b>Voice ordering is paused.</b> Customers see the tap-to-order menu. This is the <code>voice_ordering</code> kill switch in Flagsmith, flipped by the NudgeBee runbook after a human approved it.
              </div>
            </div>
          )}

          {/* Board */}
          <div className="grid md:grid-cols-3 gap-4">
            {COLUMNS.map((col) => {
              const list = active.filter((o) => o.status === col.key).sort((a, b) => a.slot.localeCompare(b.slot) || a.createdAt - b.createdAt);
              return (
                <section key={col.key} className="rounded-3xl bg-paper-2/70 border border-line p-3 min-h-[300px]">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <h2 className="font-display text-lg font-bold">{col.title}</h2>
                    <span className="chip">{list.length}</span>
                  </div>
                  <div className="space-y-3">
                    {list.map((o) => (
                      <OrderCard key={o.id} o={o} ownerLang={ownerLang} fresh={fresh.has(o.id)} busy={busy === o.id} cta={col.cta} onNext={col.next ? () => move(o, col.next!) : undefined} />
                    ))}
                    {!list.length && <div className="text-sm text-ink-2 text-center py-10">{col.key === "new" ? "New orders appear here instantly." : "—"}</div>}
                  </div>
                </section>
              );
            })}
          </div>

          {stats.topItems.length > 0 && (
            <section className="card p-4">
              <h3 className="font-display text-lg font-bold mb-2">Today’s prep list</h3>
              <div className="flex flex-wrap gap-2">
                {stats.topItems.map((t) => (
                  <span key={t.name} className="chip !text-sm !py-1.5">
                    {t.name} · <b className="text-ink">{qtyLabel(t.qty, t.unit)}</b> · {inr(t.revenue)}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Control room */}
        <aside className="space-y-4">
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Control room</h3>
              <span className="chip !text-[10px]">⚑ Flagsmith {flags.source === "flagsmith" ? "live" : "offline"}</span>
            </div>
            <div className="mt-3 rounded-2xl border border-line p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-bold">⚡ Rush mode</div>
                <div className="text-xs text-ink-2">Pickup only, {flags.rush.config.slot_capacity} orders per slot, fast movers only.</div>
              </div>
              <Toggle on={flags.rush.enabled} disabled={busy === "control"} onClick={() => control({ action: flags.rush.enabled ? "rush_off" : "rush_on" })} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <FlagPill name="voice_ordering" on={flags.voiceOrdering} />
              <FlagPill name="voice_replies" on={flags.voiceReplies} />
              <FlagPill name="owner_voice_commands" on={flags.ownerVoiceCommands} />
              <FlagPill name="chaos_sarvam_outage" on={flags.chaos} danger />
            </div>
          </section>

          {flags.ownerVoiceCommands && <OwnerVoice slug={slug} ownerLang={ownerLang} onApplied={load} />}

          <section className="card p-4">
            <h3 className="font-display text-lg font-bold">Stock</h3>
            <p className="text-xs text-ink-2 mb-2">Tap to mark sold out. Customers stop seeing it at once.</p>
            <div className="flex flex-wrap gap-1.5">
              {data.catalog.map((c) => (
                <button
                  key={c.id}
                  onClick={() => control({ action: c.soldOut ? "restock" : "sold_out", items: [c.id] })}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${c.soldOut ? "bg-rose-50 border-rose-200 text-rose-700 line-through" : "bg-white border-line"}`}
                >
                  {c.emoji} {c.name.replace(/ \(.*\)/, "")}
                </button>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h3 className="font-display text-lg font-bold">Upsell experiment</h3>
            <p className="text-xs text-ink-2">
              Flagsmith Experimentation · flag <code>upsell_prompt</code> · metric <code>order_placed</code>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {["none", "gift_box"].map((v) => {
                const s = stats.variants[v] ?? { orders: 0, revenue: 0 };
                return (
                  <div key={v} className="rounded-xl border border-line p-2.5">
                    <div className="text-[11px] font-bold uppercase text-ink-2">{v === "none" ? "Control" : "Gift box offer"}</div>
                    <div className="font-display text-xl font-bold">{s.orders ? inr(s.revenue / s.orders) : "—"}</div>
                    <div className="text-[11px] text-ink-2">avg order · {s.orders} orders</div>
                  </div>
                );
              })}
            </div>
          </section>

          {stats.languages.length > 0 && (
            <section className="card p-4">
              <h3 className="font-display text-lg font-bold">Languages today</h3>
              <div className="mt-2 space-y-1.5">
                {stats.languages.map((l) => (
                  <div key={l.lang} className="flex items-center gap-2 text-sm">
                    <span className="w-20">{LANG[l.lang] ?? l.lang}</span>
                    <div className="flex-1 h-2 rounded-full bg-paper-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(l.n / stats.ordersToday) * 100}%`, background: "var(--accent)" }} />
                    </div>
                    <span className="w-6 text-right font-bold">{l.n}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card p-4 flex gap-3 items-center">
            {qr && <img src={qr} alt="QR code for the storefront" className="w-24 h-24 rounded-lg" />}
            <div className="text-sm">
              <div className="font-bold">Print this at the counter</div>
              <div className="text-ink-2 text-xs mt-1">Customers scan, speak their order, and skip the queue. Share the same link on WhatsApp.</div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function OrderCard({ o, ownerLang, fresh, busy, cta, onNext }: { o: Order; ownerLang: string; fresh: boolean; busy: boolean; cta?: string; onNext?: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const age = Math.max(0, Math.round((Date.now() - o.createdAt) / 60000));
  return (
    <article className={`card p-3.5 ${fresh ? "ring-2 ring-[var(--accent)] rise" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl px-2.5 py-1.5 text-white font-display font-extrabold text-xl leading-none" style={{ background: "var(--accent)" }}>
          {o.token}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{o.customerName || "Walk-in"}</div>
          <div className="text-xs text-ink-2">
            {o.channel === "voice" ? "🎙 voice" : "👆 tap"} · {LANG[o.customerLang] ?? o.customerLang} · {age}m ago
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-2">pickup</div>
          <div className="font-bold">{o.slotLabel}</div>
        </div>
      </div>
      <ul className="mt-2.5 text-sm space-y-0.5">
        {o.lines.map((l) => (
          <li key={l.itemId} className="flex justify-between">
            <span>
              <b>{qtyLabel(l.qty, l.unit)}</b> {l.name}
            </span>
            <span className="text-ink-2">{inr(l.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between mt-1.5 pt-1.5 border-t border-line text-sm font-bold">
        <span>
          Total {o.upsellAccepted && <span className="chip !text-[10px] !py-0 ml-1">🎁 upsell</span>}
        </span>
        <span>{inr(o.total)}</span>
      </div>
      {o.ownerSummary && (
        <div className="mt-2 rounded-lg bg-paper-2/70 px-2.5 py-1.5 text-sm">
          <span className="text-[10px] font-bold uppercase text-ink-2 mr-1">{ownerLang}</span>
          {o.ownerSummary}
        </div>
      )}
      {o.notes && <div className="mt-1.5 text-xs text-amber-800">📝 {o.notes}</div>}
      {o.transcript && (
        <button className="mt-1.5 text-xs text-ink-2 underline" onClick={() => setShowRaw((s) => !s)}>
          {showRaw ? "hide" : "hear what they said"}
        </button>
      )}
      {showRaw && <div className="mt-1 text-sm italic text-ink-2">“{o.transcript}”</div>}
      {o.status === "ready" && o.readyText && <div className="mt-2 text-xs rounded-lg bg-green-50 text-green-800 px-2.5 py-1.5">✓ Told the customer: “{o.readyText}”</div>}
      {onNext && (
        <button className="btn btn-primary w-full mt-3 !py-2 text-sm" disabled={busy} onClick={onNext}>
          {busy ? "…" : cta}
        </button>
      )}
    </article>
  );
}

function OwnerVoice({ slug, ownerLang, onApplied }: { slug: string; ownerLang: string; onApplied: () => void }) {
  const rec = useRecorder();
  const [state, setState] = useState<"idle" | "rec" | "thinking" | "proposal" | "done">("idle");
  const [heard, setHeard] = useState("");
  const [intent, setIntent] = useState<{ action: string; items: string[]; english: string; confirm_text: string } | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  async function send(audio: Blob | null, t?: string) {
    setState("thinking");
    setErr("");
    const fd = new FormData();
    fd.append("shop", slug);
    if (audio) fd.append("audio", audio, "cmd.webm");
    if (t) fd.append("text", t);
    const r = await fetch("/api/owner/command", { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.message || "Could not understand.");
      setState("idle");
      return;
    }
    setHeard(d.heard);
    setIntent(d.intent);
    setState("proposal");
  }

  async function approve() {
    if (!intent) return;
    await fetch(`/api/shop/${slug}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: intent.action, items: intent.items }) });
    setState("done");
    onApplied();
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Tell Bolo</h3>
        <span className="chip !text-[10px]">beta · pilot shops</span>
      </div>
      <p className="text-xs text-ink-2 mt-0.5">Speak in {ownerLang}: “kaju katli khatam aaytu”, “rush mode on maadi”.</p>
      <div className="mt-3 flex gap-2">
        <button
          className={`btn ${rec.recording ? "btn-accent" : "btn-primary"} !py-2 text-sm`}
          onClick={async () => {
            if (rec.recording) {
              const b = await rec.stop();
              if (b) send(b);
              else setState("idle");
            } else {
              try {
                await rec.start();
                setState("rec");
              } catch {
                setErr("Mic blocked");
              }
            }
          }}
          disabled={state === "thinking"}
        >
          {rec.recording ? `■ Stop ${rec.seconds}s` : "🎙 Speak"}
        </button>
        <form
          className="flex-1 flex"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send(null, text.trim());
            setText("");
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="or type…" className="w-full rounded-xl border border-line bg-white px-3 text-sm outline-none" />
        </form>
      </div>
      {state === "thinking" && <div className="mt-2 text-sm text-ink-2">Understanding…</div>}
      {state === "proposal" && intent && (
        <div className="mt-3 rounded-xl border border-line p-3 text-sm rise">
          <div className="text-xs text-ink-2 italic">“{heard}”</div>
          {intent.action === "unknown" ? (
            <div className="mt-1">Didn’t catch an action. Try “mysore pak sold out”.</div>
          ) : (
            <>
              <div className="mt-1.5 font-bold">{intent.confirm_text}</div>
              <div className="text-ink-2">{intent.english}</div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-accent !py-1.5 text-sm" onClick={approve}>
                  Approve
                </button>
                <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => setState("idle")}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {state === "done" && <div className="mt-2 text-sm text-ok font-bold">✓ Done</div>}
      {err && <div className="mt-2 text-sm text-rose-700">{err}</div>}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-semibold text-ink-2">{label}</div>
      <div className="font-display text-3xl font-bold mt-0.5" style={accent ? { color: "var(--accent)" } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={onClick} className={`relative h-7 w-12 rounded-full transition ${on ? "bg-[var(--accent)]" : "bg-line"} disabled:opacity-50`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function FlagPill({ name, on, danger }: { name: string; on: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 font-mono text-[10.5px] flex items-center gap-1.5 ${on ? (danger ? "border-rose-300 bg-rose-50" : "border-green-200 bg-green-50") : "border-line bg-white text-ink-2"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? (danger ? "bg-rose-500" : "bg-green-600") : "bg-stone-300"}`} />
      {name}
    </div>
  );
}

function ding() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {}
}
