import { chatJSON, translate } from "./sarvam";
import type { CatalogItem, Shop, Unit } from "./shops";
import { formatINR, formatQty, langLabel } from "./shops";
import { getJSON, incr, lpush, lrange, setJSON, smembers } from "./store";

export interface OrderLine {
  itemId: string;
  name: string;
  qty: number;
  unit: Unit;
  price: number;
  lineTotal: number;
}

export interface DraftOrder {
  lines: OrderLine[];
  unmatched: string[];
  customerName: string;
  pickupHint: string;
  notes: string;
  replyText: string; // in the customer's language, read back by Bulbul
  englishSummary: string;
  language: string;
  transcript: string;
  total: number;
  upsell: { itemId: string; name: string; price: number; pitch: string } | null;
}

export type OrderStatus = "new" | "preparing" | "ready" | "picked";

export interface Order {
  id: string;
  token: string;
  shop: string;
  customerId: string;
  customerName: string;
  customerLang: string;
  channel: "voice" | "tap";
  transcript: string;
  englishSummary: string;
  ownerSummary: string;
  lines: OrderLine[];
  total: number;
  slot: string; // "18:30"
  slotLabel: string;
  notes: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  upsellVariant: string;
  upsellAccepted: boolean;
  readyText?: string;
}

/* ------------------------------------------------------------------ */
/* Understanding an order with Sarvam-105B                             */
/* ------------------------------------------------------------------ */

const ORDER_SCHEMA = {
  name: "bolo_order",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item_id: { type: "string", description: "id from the catalog" },
            qty: { type: "number", description: "quantity in the item's unit (kg, pc or box)" },
          },
          required: ["item_id", "qty"],
        },
      },
      unmatched: { type: "array", items: { type: "string" }, description: "things the customer asked for that are not in the catalog" },
      customer_name: { type: "string" },
      pickup_hint: { type: "string", description: "pickup time the customer mentioned, as HH:MM 24h IST, or empty" },
      notes: { type: "string", description: "special instructions, in English" },
      english_summary: { type: "string", description: "one line in English for the shop owner" },
      reply_text: {
        type: "string",
        description: "short spoken confirmation in the customer's language and script. Must contain the literal placeholder {TOTAL} where the total goes.",
      },
    },
    required: ["items", "unmatched", "customer_name", "pickup_hint", "notes", "english_summary", "reply_text"],
  },
};

function catalogForPrompt(items: CatalogItem[]) {
  return items.map((i) => `- ${i.id}: ${i.name} (${i.aliases.join(", ")}) — ₹${i.price}/${i.unit}`).join("\n");
}

export async function understandOrder(args: {
  shop: Shop;
  catalog: CatalogItem[];
  transcript: string;
  language: string;
  upsellVariant: string;
  chaos?: boolean;
}): Promise<DraftOrder> {
  const { shop, catalog, transcript, language, upsellVariant } = args;
  const gift = catalog.find((c) => c.id === "gift-box");
  const offerUpsell = upsellVariant === "gift_box" && !!gift;

  const system = `You are Bolo, the order-taking assistant at ${shop.name}, ${shop.area}, ${shop.city}.
A customer just spoke their order out loud during the festive rush. The transcript can be in any Indian language, often code-mixed with English (Hinglish, Kanglish, Tanglish).

CATALOG (id: name (what people call it) — price/unit):
${catalogForPrompt(catalog)}

RULES
- Map every requested item to a catalog id. Only use ids from the catalog. If something is not on the catalog, put it in "unmatched".
- Convert quantities to the item's unit. kg items: "aadha kilo"/"half kg"/"ardha kilo"/"arai kilo" = 0.5, "paav"/"quarter" = 0.25, "dedh kilo" = 1.5, "dhai kilo" = 2.5, "250 gram" = 0.25, "ek kilo" = 1. pc items: count pieces. box items: count boxes. If no quantity is said, use 1 (or 0.5 for kg sweets).
- customer_name: only if they said it, else "".
- pickup_hint: if they said a time ("shaam 6 baje" = 18:00, "7 baje raat" = 19:00, "sanje aaru" = 18:00), give HH:MM, else "".
- reply_text: 1–3 short, warm sentences in the SAME language and script the customer used (language code: ${language || "detect it"}). Read back the items with quantities, say the total using the exact placeholder {TOTAL}, and ask them to confirm. Natural spoken style, like a friendly shopkeeper.${
    offerUpsell
      ? `\n- Then add ONE short sentence offering a "${gift!.name}" for ₹${gift!.price} as a festive gift, also in the customer's language (only if they did not already order it).`
      : ""
  }
- english_summary: one line in English for the shop owner, e.g. "1 kg Kaju Katli, 10 Gulab Jamun — pickup 18:00 — for Priya".`;

  type Raw = {
    items: { item_id: string; qty: number }[];
    unmatched: string[];
    customer_name: string;
    pickup_hint: string;
    notes: string;
    english_summary: string;
    reply_text: string;
  };
  const raw = await chatJSON<Raw>(system, `Customer said: """${transcript}"""`, ORDER_SCHEMA, { chaos: args.chaos });

  const lines = mergeLines(
    raw.items
      .map((it) => {
        const c = catalog.find((x) => x.id === it.item_id);
        if (!c || !(it.qty > 0)) return null;
        const qty = c.unit === "kg" ? Math.round(it.qty * 1000) / 1000 : Math.max(1, Math.round(it.qty));
        return { itemId: c.id, name: c.name, qty, unit: c.unit, price: c.price, lineTotal: Math.round(qty * c.price) };
      })
      .filter(Boolean) as OrderLine[],
  );
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const alreadyHasGift = lines.some((l) => l.itemId === "gift-box");
  let reply = (raw.reply_text || "").replaceAll("{TOTAL}", formatINR(total));
  if (!reply.includes(formatINR(total)) && lines.length) reply += ` (${formatINR(total)})`;

  return {
    lines,
    unmatched: raw.unmatched ?? [],
    customerName: raw.customer_name ?? "",
    pickupHint: /^\d{1,2}:\d{2}$/.test(raw.pickup_hint ?? "") ? raw.pickup_hint : "",
    notes: raw.notes ?? "",
    replyText: reply,
    englishSummary: raw.english_summary ?? "",
    language,
    transcript,
    total,
    upsell:
      offerUpsell && !alreadyHasGift && lines.length
        ? { itemId: gift!.id, name: gift!.name, price: gift!.price, pitch: `Add a ${gift!.name} for ${formatINR(gift!.price)}?` }
        : null,
  };
}

function mergeLines(lines: OrderLine[]): OrderLine[] {
  const m = new Map<string, OrderLine>();
  for (const l of lines) {
    const prev = m.get(l.itemId);
    if (prev) {
      prev.qty += l.qty;
      prev.lineTotal = Math.round(prev.qty * prev.price);
    } else m.set(l.itemId, { ...l });
  }
  return [...m.values()];
}

export function linesFromCart(catalog: CatalogItem[], cart: { itemId: string; qty: number }[]): OrderLine[] {
  return mergeLines(
    cart
      .map(({ itemId, qty }) => {
        const c = catalog.find((x) => x.id === itemId);
        if (!c || !(qty > 0)) return null;
        return { itemId, name: c.name, qty, unit: c.unit, price: c.price, lineTotal: Math.round(qty * c.price) };
      })
      .filter(Boolean) as OrderLine[],
  );
}

export function describeLines(lines: OrderLine[]) {
  return lines.map((l) => `${formatQty(l.qty, l.unit)} ${l.name}`).join(", ");
}

/* ------------------------------------------------------------------ */
/* Pickup slots (IST)                                                  */
/* ------------------------------------------------------------------ */

export function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600_000);
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), dateKey: d.toISOString().slice(0, 10) };
}

export interface Slot {
  value: string;
  label: string;
  taken: number;
  capacity: number;
  full: boolean;
}

export async function getSlots(shop: Shop, capacity: number): Promise<Slot[]> {
  const { h, m, dateKey } = istNow();
  const orders = await listOrders(shop.slug, 300);
  const today = orders.filter((o) => istDateKey(o.createdAt) === dateKey && o.status !== "picked");
  const slots: Slot[] = [];
  let start = h * 60 + m + 30; // need at least 30 minutes to pack
  start = Math.ceil(start / 30) * 30;
  const end = shop.closesAt * 60;
  for (let t = Math.max(start, 9 * 60); t <= end - 30 && slots.length < 12; t += 30) {
    const value = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    const taken = today.filter((o) => o.slot === value).length;
    slots.push({ value, label: slotLabel(value), taken, capacity, full: taken >= capacity });
  }
  return slots;
}

export function slotLabel(v: string) {
  const [hh, mm] = v.split(":").map(Number);
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
}

function istDateKey(ts: number) {
  return new Date(ts + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

export async function listOrders(shopSlug: string, limit = 100): Promise<Order[]> {
  const ids = await lrange<string>(`orders:${shopSlug}`, 0, limit - 1);
  const orders = await Promise.all(ids.map((id) => getJSON<Order>(`order:${id}`)));
  return orders.filter(Boolean) as Order[];
}

export async function getOrder(id: string) {
  return getJSON<Order>(`order:${id}`);
}

export async function saveOrder(o: Order) {
  await setJSON(`order:${o.id}`, o);
}

export async function createOrder(input: Omit<Order, "id" | "token" | "createdAt" | "updatedAt" | "status" | "ownerSummary">, ownerLang: string) {
  const n = await incr(`token:${input.shop}:${istNow().dateKey}`);
  const id = `${input.shop.slice(0, 3)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let ownerSummary = "";
  try {
    if (ownerLang !== "en-IN" && input.englishSummary) ownerSummary = await translate(input.englishSummary, ownerLang, "en-IN");
  } catch {
    ownerSummary = "";
  }
  const order: Order = {
    ...input,
    id,
    token: `B${String(n).padStart(2, "0")}`,
    ownerSummary,
    status: "new",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveOrder(order);
  await lpush(`orders:${input.shop}`, id, 1000);
  return order;
}

export async function soldOut(shopSlug: string) {
  return smembers(`soldout:${shopSlug}`);
}

export function readyMessageEnglish(o: Order, shop: Shop) {
  const name = o.customerName ? `${o.customerName}, ` : "";
  return `${name}your order ${o.token} from ${shop.name} is ready. Please pick it up at the counter. Thank you and happy festivities!`;
}

export { langLabel };
