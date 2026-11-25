import { connection } from "next/server";
import { json } from "@/lib/api";
import { getShopFlags } from "@/lib/flags";
import { istNow, listOrders, soldOut } from "@/lib/orders";
import { getShop } from "@/lib/shops";


/** Owner dashboard feed. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const shop = getShop(slug);
  if (!shop) return json({ error: "not_found" }, 404);
  const [orders, flags, out] = await Promise.all([listOrders(slug, 200), getShopFlags(shop), soldOut(slug)]);
  const { dateKey } = istNow();
  const today = orders.filter((o) => new Date(o.createdAt + 5.5 * 3600_000).toISOString().slice(0, 10) === dateKey);
  const byItem = new Map<string, { name: string; qty: number; unit: string; revenue: number }>();
  for (const o of today)
    for (const l of o.lines) {
      const p = byItem.get(l.itemId) ?? { name: l.name, qty: 0, unit: l.unit, revenue: 0 };
      p.qty += l.qty;
      p.revenue += l.lineTotal;
      byItem.set(l.itemId, p);
    }
  const langs = new Map<string, number>();
  today.forEach((o) => langs.set(o.customerLang, (langs.get(o.customerLang) ?? 0) + 1));
  const variants: Record<string, { orders: number; revenue: number }> = {};
  today.forEach((o) => {
    const v = (variants[o.upsellVariant] ??= { orders: 0, revenue: 0 });
    v.orders++;
    v.revenue += o.total;
  });

  return json({
    shop: { slug: shop.slug, name: shop.name, area: shop.area, city: shop.city, ownerName: shop.ownerName, ownerLang: shop.ownerLang, plan: shop.plan },
    catalog: shop.catalog.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, price: c.price, unit: c.unit, fast: c.fast, soldOut: out.includes(c.id) })),
    orders,
    flags,
    stats: {
      ordersToday: today.length,
      revenueToday: today.reduce((s, o) => s + o.total, 0),
      voiceShare: today.length ? today.filter((o) => o.channel === "voice").length / today.length : 0,
      pending: orders.filter((o) => o.status === "new" || o.status === "preparing").length,
      topItems: [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      languages: [...langs.entries()].map(([lang, n]) => ({ lang, n })).sort((a, b) => b.n - a.n),
      variants,
    },
  });
}
