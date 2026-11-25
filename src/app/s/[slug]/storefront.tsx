"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { inr, qtyLabel, speakVia, stepFor, useCustomerId, useRecorder } from "@/components/client-utils";

type Item = { id: string; name: string; price: number; unit: "kg" | "pc" | "box"; fast: boolean; emoji: string; soldOut: boolean; aliases: string[] };
type Slot = { value: string; label: string; taken: number; capacity: number; full: boolean };
type Theme = { key: string; festival: string; greeting: string; tagline: string; accent: string; accent2: string; emoji: string; featured: string[] };
type Config = {
  shop: { slug: string; name: string; area: string; city: string; shopType: string };
  catalog: Item[];
  hiddenInRush: number;
  flags: {
    theme: Theme;
    rush: { enabled: boolean; config: { slot_capacity: number; pickup_only: boolean; fast_movers_only: boolean; banner: string } };
    voiceOrdering: boolean;
    voiceReplies: boolean;
    languages: string[];
    upsell: string;
    source: string;
  };
  slots: Slot[];
};
type Draft = {
  lines: { itemId: string; name: string; qty: number; unit: string; price: number; lineTotal: number }[];
  unmatched: string[];
  customerName: string;
  pickupHint: string;
  notes: string;
  replyText: string;
  englishSummary: string;
  language: string;
  transcript: string;
  total: number;
  upsell: { itemId: string; name: string; price: number; pitch: string } | null;
};
type Phase = "idle" | "recording" | "working" | "review" | "placing" | "placed";

const LANG_NATIVE: Record<string, string> = {
  "hi-IN": "हिन्दी",
  "kn-IN": "ಕನ್ನಡ",
  "ta-IN": "தமிழ்",
  "te-IN": "తెలుగు",
  "ml-IN": "മലയാളം",
  "bn-IN": "বাংলা",
  "mr-IN": "मराठी",
  "gu-IN": "ગુજરાતી",
  "pa-IN": "ਪੰਜਾਬੀ",
  "od-IN": "ଓଡ଼ିଆ",
  "en-IN": "English",
};

const EXAMPLES = [
  { lang: "hi-IN", text: "भैया, एक किलो काजू कतली और दस गुलाब जामुन चाहिए, शाम छह बजे आऊँगी" },
  { lang: "kn-IN", text: "ಅರ್ಧ ಕೆಜಿ ಮೈಸೂರ್ ಪಾಕ್ ಮತ್ತು ಒಂದು gift box ಬೇಕು" },
  { lang: "ta-IN", text: "ஒரு கிலோ மைசூர் பாக், அரை கிலோ mixture வேணும்" },
  { lang: "en-IN", text: "Two kg motichoor ladoo for a wedding, pickup at 7, name Arjun" },
];

const UI = {
  placed: { "hi-IN": "ऑर्डर हो गया!", "kn-IN": "ಆರ್ಡರ್ ಆಯಿತು!", "ta-IN": "ஆர்டர் ஆகிவிட்டது!", "en-IN": "Order placed!" } as Record<string, string>,
};

export default function Storefront() {
  const { slug } = useParams<{ slug: string }>();
  const cid = useCustomerId();
  const rec = useRecorder();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [err, setErr] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [slot, setSlot] = useState("");
  const [lang, setLang] = useState("hi-IN");
  const [typed, setTyped] = useState("");
  const [upsellAccepted, setUpsellAccepted] = useState(false);
  const [upsellDismissed, setUpsellDismissed] = useState(false);
  const [channel, setChannel] = useState<"voice" | "tap">("tap");
  const [placed, setPlaced] = useState<{ id: string; token: string; slotLabel: string; total: number } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [timing, setTiming] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!cid) return;
    const r = await fetch(`/api/shop/${slug}?cid=${cid}`);
    if (!r.ok) return setErr("Shop not found");
    const d = (await r.json()) as Config;
    setCfg(d);
    setSlot((s) => s || d.slots.find((x) => !x.full)?.value || "");
  }, [cid, slug]);

  useEffect(() => {
    load();
  }, [load]);

  const theme = cfg?.flags.theme;
  const style = useMemo(() => (theme ? ({ "--accent": theme.accent, "--accent-2": theme.accent2 } as React.CSSProperties) : undefined), [theme]);

  const items = cfg?.catalog ?? [];
  const lines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const it = items.find((i) => i.id === id);
      return it ? { ...it, qty, lineTotal: Math.round(qty * it.price) } : null;
    })
    .filter(Boolean) as (Item & { qty: number; lineTotal: number })[];
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  const gift = items.find((i) => i.id === "gift-box" && !i.soldOut);
  const showUpsell = cfg?.flags.upsell === "gift_box" && !!gift && lines.length > 0 && !cart["gift-box"] && !upsellDismissed && !upsellAccepted;

  function add(id: string, delta: number) {
    const it = items.find((i) => i.id === id);
    if (!it || it.soldOut) return;
    setCart((c) => {
      const q = Math.max(0, +((c[id] ?? 0) + delta).toFixed(3));
      return { ...c, [id]: q };
    });
    if (phase === "idle") setPhase("review");
  }

  async function submitVoice(audio: Blob | null, text?: string) {
    if (!cfg) return;
    setErr("");
    setPhase("working");
    setStep(0);
    const t1 = setTimeout(() => setStep(1), 1800);
    const fd = new FormData();
    fd.append("shop", slug);
    fd.append("upsell", cfg.flags.upsell);
    fd.append("lang", lang);
    if (audio) fd.append("audio", audio, "order.webm");
    if (text) fd.append("text", text);
    try {
      const r = await fetch("/api/order/understand", { method: "POST", body: fd });
      const d = await r.json();
      clearTimeout(t1);
      if (!r.ok) {
        if (d.error === "voice_disabled" || d.error === "voice_unavailable") {
          await load();
          setErr("Voice ordering is taking a short break during the rush. Tap items below to order — it's just as fast.");
        } else setErr(d.message || "Something went wrong. Try again.");
        setPhase(lines.length ? "review" : "idle");
        return;
      }
      const dr = d.draft as Draft;
      setTiming(d.timings?.totalMs ?? null);
      setDraft(dr);
      setChannel("voice");
      if (dr.language && LANG_NATIVE[dr.language]) setLang(dr.language);
      setCart((c) => {
        const next = { ...c };
        dr.lines.forEach((l) => (next[l.itemId] = +((next[l.itemId] ?? 0) + l.qty).toFixed(3)));
        return next;
      });
      if (dr.customerName && !name) setName(dr.customerName);
      if (dr.pickupHint) {
        const best = cfg.slots.find((s) => !s.full && s.value >= dr.pickupHint);
        if (best) setSlot(best.value);
      }
      if (d.soldOutAsked?.length) setErr(`Sorry, ${d.soldOutAsked.join(", ")} sold out for today.`);
      setPhase("review");
      setStep(2);
      if (cfg.flags.voiceReplies && dr.replyText) {
        setSpeaking(true);
        await speakVia(slug, dr.replyText, dr.language);
        setSpeaking(false);
      }
    } catch {
      clearTimeout(t1);
      setErr("Network hiccup. Try again.");
      setPhase(lines.length ? "review" : "idle");
    }
  }

  async function toggleMic() {
    if (rec.recording) {
      const blob = await rec.stop();
      if (blob) submitVoice(blob);
      else setPhase(lines.length ? "review" : "idle");
      return;
    }
    try {
      await rec.start();
      setPhase("recording");
    } catch {
      setErr("Microphone blocked. Allow mic access, or type your order below.");
    }
  }

  async function place() {
    if (!cfg || !lines.length) return;
    setPhase("placing");
    const r = await fetch("/api/order/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: slug,
        customerId: cid,
        customerName: name,
        customerLang: lang,
        channel,
        transcript: draft?.transcript ?? "",
        englishSummary: channel === "voice" && draft && JSON.stringify(draft.lines.map((l) => [l.itemId, l.qty])) === JSON.stringify(lines.map((l) => [l.id, l.qty])) ? draft.englishSummary : "",
        cart: lines.map((l) => ({ itemId: l.id, qty: l.qty })),
        slot,
        notes: draft?.notes ?? "",
        upsellVariant: cfg.flags.upsell,
        upsellAccepted,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.message || "Could not place the order.");
      setPhase("review");
      load();
      return;
    }
    setPlaced(d.order);
    setPhase("placed");
  }

  if (err && !cfg) return <div className="p-10 text-center">{err}</div>;
  if (!cfg || !theme)
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

  const voiceOn = cfg.flags.voiceOrdering;

  return (
    <main style={style} className="flex-1 pb-36">
      {/* Festive header — driven by Flagsmith remote config `festival_theme` */}
      <header className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})` }}>
        <div className="absolute inset-0 opacity-25 texture" />
        <div className="relative max-w-xl mx-auto px-5 pt-6 pb-16 text-white">
          <div className="flex items-center justify-between text-xs font-semibold opacity-90">
            <Link href="/" className="flex items-center gap-1.5">
              <span className="font-display text-lg">bolo</span>
            </Link>
            <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur">
              {theme.emoji} {theme.festival}
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold mt-6 leading-tight">{cfg.shop.name}</h1>
          <p className="text-white/85 text-sm mt-1">
            {cfg.shop.area}, {cfg.shop.city}
          </p>
          <p className="mt-4 text-[15px] font-medium leading-snug max-w-sm">{theme.greeting}</p>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 -mt-10 relative space-y-4">
        {cfg.flags.rush.enabled && (
          <div className="card px-4 py-3 flex gap-3 items-start border-amber-300 bg-amber-50 rise">
            <span className="text-xl">⚡</span>
            <div className="text-sm">
              <div className="font-bold">Festive rush mode</div>
              <div className="text-ink-2">
                {cfg.flags.rush.config.banner}
                {cfg.hiddenInRush > 0 && ` Showing our fastest-moving ${items.length} items.`}
              </div>
            </div>
          </div>
        )}

        {/* Voice ordering panel */}
        {phase !== "placed" && (
          <section className="card p-5 rise">
            {voiceOn ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-bold">Just say your order</h2>
                    <p className="text-sm text-ink-2 mt-1">Any language. Hindi, Kannada, Tamil, Telugu, Malayalam, Bengali, English or a mix.</p>
                  </div>
                </div>

                <div className="flex flex-col items-center py-6">
                  <button
                    onClick={toggleMic}
                    disabled={phase === "working"}
                    aria-label={rec.recording ? "Stop recording" : "Start speaking your order"}
                    className={`relative isolate h-28 w-28 rounded-full grid place-items-center text-white shadow-xl transition ${rec.recording ? "ring-pulse" : ""}`}
                    style={{ background: rec.recording ? "var(--accent)" : "var(--ink)" }}
                  >
                    {phase === "working" ? (
                      <span className="eq">
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : rec.recording ? (
                      <span className="h-8 w-8 rounded-md bg-white" />
                    ) : (
                      <MicIcon />
                    )}
                  </button>
                  <div className="mt-4 text-sm font-semibold h-5">
                    {phase === "recording" && <span className="text-accent">Listening… {rec.seconds}s · tap to finish</span>}
                    {phase === "working" && <span className="text-ink-2">{["Hearing you (Sarvam Saaras)…", "Understanding your order (Sarvam-105B)…", "Done"][step]}</span>}
                    {(phase === "idle" || phase === "review") && <span className="text-ink-2">{lines.length ? "Tap to add more" : "Tap and speak"}</span>}
                  </div>
                </div>

                {phase === "idle" && !lines.length && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-ink-2">Try saying</div>
                    {EXAMPLES.map((e) => (
                      <button key={e.text} onClick={() => submitVoice(null, e.text)} className="w-full text-left text-sm rounded-xl border border-line bg-paper/60 px-3 py-2 hover:bg-paper-2 transition">
                        <span className="chip mr-2 !py-0.5">{LANG_NATIVE[e.lang]}</span>“{e.text}”
                      </button>
                    ))}
                  </div>
                )}

                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (typed.trim()) submitVoice(null, typed.trim());
                    setTyped("");
                  }}
                >
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type it, in any language" className="flex-1 rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink" />
                  <button className="btn btn-ghost !py-2.5 text-sm" disabled={!typed.trim() || phase === "working"}>
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="flex gap-3 items-start">
                <span className="text-2xl">🙏</span>
                <div>
                  <h2 className="font-display text-xl font-bold">Tap to order</h2>
                  <p className="text-sm text-ink-2 mt-1">Voice ordering is resting for a few minutes while we handle the festive rush. Pick your sweets below. It takes ten seconds.</p>
                </div>
              </div>
            )}
            {err && <p className="mt-3 text-sm font-semibold text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{err}</p>}
          </section>
        )}

        {/* What Bolo heard + reply */}
        {draft && phase !== "placed" && (
          <section className="space-y-2 rise">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink text-paper px-4 py-3 text-[15px]">
                <div className="text-[11px] uppercase tracking-wide opacity-60 mb-1">You said · {LANG_NATIVE[draft.language] ?? draft.language}</div>
                {draft.transcript}
              </div>
            </div>
            <div className="flex">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white border border-line px-4 py-3 text-[15px]">
                <div className="text-[11px] uppercase tracking-wide text-ink-2 mb-1 flex items-center gap-2">
                  Bolo
                  {speaking && (
                    <span className="eq scale-50 text-accent -my-2">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                  {cfg.flags.voiceReplies && !speaking && (
                    <button className="underline" onClick={() => speakVia(slug, draft.replyText, draft.language)}>
                      ▶ play
                    </button>
                  )}
                  {timing && <span className="normal-case tracking-normal opacity-70">· understood in {(timing / 1000).toFixed(1)}s</span>}
                </div>
                {draft.replyText}
                {draft.unmatched.length > 0 && <div className="mt-2 text-sm text-amber-700">Not on today’s menu: {draft.unmatched.join(", ")}</div>}
              </div>
            </div>
          </section>
        )}

        {/* Order review */}
        {lines.length > 0 && phase !== "placed" && (
          <section className="card p-5 rise min-w-0 overflow-hidden">
            <h3 className="font-display text-xl font-bold mb-3">Your order</h3>
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.id} className="py-2.5 flex items-center gap-3">
                  <span className="text-xl w-7 text-center">{l.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{l.name}</div>
                    <div className="text-xs text-ink-2">
                      {inr(l.price)}/{l.unit} · {inr(l.lineTotal)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="h-8 w-8 rounded-full border border-line font-bold" onClick={() => add(l.id, -stepFor(l.unit))} aria-label={`Less ${l.name}`}>
                      −
                    </button>
                    <span className="w-16 text-center text-sm font-bold">{qtyLabel(l.qty, l.unit)}</span>
                    <button className="h-8 w-8 rounded-full border border-line font-bold" onClick={() => add(l.id, stepFor(l.unit))} aria-label={`More ${l.name}`}>
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Flagsmith experiment `upsell_prompt` — variant gift_box */}
            {showUpsell && gift && (
              <div className="mt-3 rounded-2xl p-3 flex items-center gap-3 border border-dashed" style={{ borderColor: theme.accent, background: `color-mix(in oklab, ${theme.accent} 7%, white)` }}>
                <span className="text-2xl">🎁</span>
                <div className="flex-1 text-sm">
                  <div className="font-bold">Gifting this {theme.festival.split(" ")[0]}?</div>
                  <div className="text-ink-2">
                    Add a {gift.name} for {inr(gift.price)}
                  </div>
                </div>
                <button
                  className="btn btn-accent !py-2 !px-3 text-sm"
                  onClick={() => {
                    setUpsellAccepted(true);
                    setCart((c) => ({ ...c, "gift-box": 1 }));
                  }}
                >
                  Add
                </button>
                <button className="text-ink-2 text-sm px-1" onClick={() => setUpsellDismissed(true)} aria-label="No thanks">
                  ✕
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
              <label className="text-sm font-semibold">
                Name for the order
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink font-normal" />
              </label>
              <div>
                <div className="text-sm font-semibold mb-1.5">
                  Pickup today {cfg.flags.rush.enabled && <span className="chip !text-[11px] ml-1">⚡ {cfg.flags.rush.config.slot_capacity} orders per slot</span>}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {cfg.slots.map((s) => (
                    <button
                      key={s.value}
                      disabled={s.full}
                      ref={slot === s.value ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined}
                      onClick={() => setSlot(s.value)}
                      className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold transition ${slot === s.value ? "bg-ink text-paper border-ink" : "bg-white border-line"} ${s.full ? "opacity-40 line-through" : ""}`}
                    >
                      {s.label}
                      <div className="text-[10px] font-medium opacity-70">{s.full ? "full" : `${s.capacity - s.taken} left`}</div>
                    </button>
                  ))}
                  {!cfg.slots.length && <span className="text-sm text-ink-2">No pickup slots left today.</span>}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Menu (tap to order) */}
        {phase !== "placed" && (
          <section className="card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-xl font-bold">Today’s menu</h3>
              <span className="text-xs text-ink-2">tap to add</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {items
                .slice()
                .sort((a, b) => Number(theme.featured.includes(b.id)) - Number(theme.featured.includes(a.id)))
                .map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      add(it.id, it.unit === "kg" ? 0.5 : 1);
                      if (!draft) setChannel("tap");
                    }}
                    disabled={it.soldOut}
                    className="text-left rounded-2xl border border-line bg-white p-3 hover:border-ink/40 transition relative"
                  >
                    {theme.featured.includes(it.id) && !it.soldOut && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold uppercase rounded-full px-1.5 py-0.5 text-white" style={{ background: theme.accent }}>
                        {theme.emoji} pick
                      </span>
                    )}
                    <div className="text-2xl">{it.emoji}</div>
                    <div className="font-semibold text-sm mt-1 leading-tight">{it.name}</div>
                    <div className="text-xs text-ink-2 mt-0.5">{it.soldOut ? <span className="text-rose-600 font-bold">Sold out today</span> : `${inr(it.price)} / ${it.unit}`}</div>
                    {cart[it.id] > 0 && <div className="absolute bottom-2 right-2 chip !bg-ink !text-paper !border-ink">{qtyLabel(cart[it.id], it.unit)}</div>}
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* Placed */}
        {phase === "placed" && placed && (
          <section className="card p-6 text-center rise">
            <div className="text-5xl">{theme.emoji}</div>
            <div className="font-display text-3xl font-bold mt-2">{UI.placed[lang] ?? UI.placed["en-IN"]}</div>
            <div className="mt-5 inline-block rounded-2xl px-6 py-4 text-white" style={{ background: theme.accent }}>
              <div className="text-xs uppercase tracking-widest opacity-80">Your token</div>
              <div className="font-display text-6xl font-extrabold">{placed.token}</div>
            </div>
            <p className="mt-4 text-ink-2">
              Pickup at <b className="text-ink">{placed.slotLabel}</b> · {inr(placed.total)} pay at counter
            </p>
            <p className="text-sm text-ink-2 mt-1">We’ll tell you in your language the moment it’s packed.</p>
            <div className="mt-5 flex gap-2 justify-center">
              <Link className="btn btn-primary" href={`/o/${placed.id}`}>
                Track my order
              </Link>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setCart({});
                  setDraft(null);
                  setPlaced(null);
                  setUpsellAccepted(false);
                  setUpsellDismissed(false);
                  setPhase("idle");
                  load();
                }}
              >
                New order
              </button>
            </div>
          </section>
        )}

        <p className="text-center text-xs text-ink-2 pt-2">
          Voice by Sarvam AI · Store controls by Flagsmith · Kept healthy by NudgeBee
        </p>
      </div>

      {/* Sticky checkout */}
      {lines.length > 0 && phase !== "placed" && (
        <div className="fixed bottom-0 inset-x-0 p-3 bg-gradient-to-t from-paper via-paper to-transparent">
          <div className="max-w-xl mx-auto">
            <button className="btn btn-primary w-full !py-4 text-base shadow-2xl" onClick={place} disabled={phase === "placing" || !slot}>
              {phase === "placing" ? "Placing…" : `Place order · ${inr(total)}`}
              {slot && <span className="opacity-60 font-medium">· pickup {cfg.slots.find((s) => s.value === slot)?.label}</span>}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function MicIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </svg>
  );
}
