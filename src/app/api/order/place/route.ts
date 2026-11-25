import { after } from "next/server";
import { apiError, json } from "@/lib/api";
import { flushFlagEvents, getShopFlags, trackOrderPlaced } from "@/lib/flags";
import { createOrder, describeLines, getSlots, linesFromCart, slotLabel, soldOut } from "@/lib/orders";
import { getShop } from "@/lib/shops";


interface Body {
  shop: string;
  customerId: string;
  customerName: string;
  customerLang: string;
  channel: "voice" | "tap";
  transcript: string;
  englishSummary: string;
  cart: { itemId: string; qty: number }[];
  slot: string;
  notes: string;
  upsellVariant: string;
  upsellAccepted: boolean;
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body;
    const shop = getShop(b.shop);
    if (!shop) return json({ error: "not_found" }, 404);
    const [flags, out] = await Promise.all([getShopFlags(shop), soldOut(shop.slug)]);
    const lines = linesFromCart(shop.catalog, b.cart || []).filter((l) => !out.includes(l.itemId));
    if (!lines.length) return json({ error: "empty_cart", message: "Your order is empty." }, 422);

    const capacity = flags.rush.enabled ? flags.rush.config.slot_capacity : 8;
    const slots = await getSlots(shop, capacity);
    const slot = slots.find((s) => s.value === b.slot && !s.full) ?? slots.find((s) => !s.full);
    if (!slot) return json({ error: "slots_full", message: "All pickup slots for today are full." }, 409);

    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    const englishSummary =
      b.englishSummary && b.channel === "voice"
        ? b.englishSummary
        : `${describeLines(lines)} — pickup ${slotLabel(slot.value)}${b.customerName ? ` — for ${b.customerName}` : ""}`;

    const order = await createOrder(
      {
        shop: shop.slug,
        customerId: b.customerId || "anon",
        customerName: (b.customerName || "").slice(0, 40),
        customerLang: b.customerLang || "hi-IN",
        channel: b.channel === "voice" ? "voice" : "tap",
        transcript: (b.transcript || "").slice(0, 1000),
        englishSummary,
        lines,
        total,
        slot: slot.value,
        slotLabel: slot.label,
        notes: (b.notes || "").slice(0, 300),
        upsellVariant: b.upsellVariant || "none",
        upsellAccepted: !!b.upsellAccepted,
      },
      shop.ownerLang,
    );

    // Flagsmith Experimentation: conversion event for the upsell_prompt experiment
    trackOrderPlaced(order.customerId, total, { shop: shop.slug, channel: order.channel, upsell_accepted: order.upsellAccepted, variant: order.upsellVariant });
    after(flushFlagEvents);

    return json({ order });
  } catch (e) {
    return apiError(e);
  }
}
