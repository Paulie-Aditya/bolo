"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { inr, qtyLabel, speakVia } from "@/components/client-utils";

type Order = {
  id: string;
  token: string;
  shop: string;
  customerName: string;
  customerLang: string;
  lines: { itemId: string; name: string; qty: number; unit: string; lineTotal: number }[];
  total: number;
  slotLabel: string;
  status: "new" | "preparing" | "ready" | "picked";
  readyText?: string;
};

const STEPS = [
  { key: "new", label: "Received", emoji: "📝" },
  { key: "preparing", label: "Packing", emoji: "📦" },
  { key: "ready", label: "Ready", emoji: "✅" },
  { key: "picked", label: "Picked up", emoji: "🎉" },
];

export default function Tracker() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<Order | null>(null);
  const [shop, setShop] = useState<{ name: string; area: string; city: string; slug: string } | null>(null);
  const announced = useRef(false);
  const [needsTap, setNeedsTap] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/orders/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setO(d.order);
    setShop(d.shop);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (o?.status === "ready" && o.readyText && !announced.current) {
      announced.current = true;
      speakVia(o.shop, o.readyText, o.customerLang).then((ok) => !ok && setNeedsTap(true));
      if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    }
  }, [o]);

  if (!o || !shop)
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
  const idx = STEPS.findIndex((s) => s.key === o.status);

  return (
    <main className="flex-1 max-w-md mx-auto w-full px-4 py-8">
      <Link href={`/s/${shop.slug}`} className="text-sm text-ink-2">
        ← {shop.name}
      </Link>
      <div className="card p-6 mt-3 text-center">
        <div className="text-xs uppercase tracking-widest text-ink-2">Token</div>
        <div className="font-display text-7xl font-extrabold" style={{ color: "var(--accent)" }}>
          {o.token}
        </div>
        <div className="text-ink-2 mt-1">
          {o.customerName ? `${o.customerName} · ` : ""}pickup {o.slotLabel}
        </div>
        <div className="mt-6 flex justify-between relative">
          <div className="absolute left-6 right-6 top-5 h-0.5 bg-line" />
          <div className="absolute left-6 top-5 h-0.5 transition-all duration-700" style={{ width: `calc(${(idx / 3) * 100}% - ${(idx / 3) * 48}px)`, background: "var(--accent)" }} />
          {STEPS.map((s, i) => (
            <div key={s.key} className="relative flex flex-col items-center w-14">
              <div className={`h-10 w-10 rounded-full grid place-items-center text-lg border-2 transition ${i <= idx ? "bg-white border-[var(--accent)]" : "bg-paper border-line grayscale opacity-50"}`}>{s.emoji}</div>
              <div className={`text-[11px] mt-1 font-semibold ${i <= idx ? "" : "text-ink-2"}`}>{s.label}</div>
            </div>
          ))}
        </div>
        {o.status === "ready" && o.readyText && (
          <div className="mt-6 rounded-2xl bg-green-50 border border-green-200 p-4 text-left rise">
            <div className="text-[11px] font-bold uppercase text-green-800">Message from the shop</div>
            <div className="mt-1 text-[15px]">{o.readyText}</div>
            <button className="mt-2 text-sm font-bold text-green-800 underline" onClick={() => speakVia(o.shop, o.readyText!, o.customerLang)}>
              ▶ {needsTap ? "Tap to listen" : "Listen again"}
            </button>
          </div>
        )}
      </div>
      <div className="card p-5 mt-4">
        <ul className="text-sm space-y-1">
          {o.lines.map((l) => (
            <li key={l.itemId} className="flex justify-between">
              <span>
                {qtyLabel(l.qty, l.unit)} {l.name}
              </span>
              <span>{inr(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between font-bold border-t border-line mt-2 pt-2">
          <span>Pay at counter</span>
          <span>{inr(o.total)}</span>
        </div>
      </div>
      <p className="text-center text-xs text-ink-2 mt-4">Keep this page open. It speaks up in your language when your order is packed.</p>
    </main>
  );
}
