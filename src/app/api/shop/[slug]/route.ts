import { after, connection } from "next/server";
import { json } from "@/lib/api";
import { flushFlagEvents, getShopFlags, getUpsellVariant } from "@/lib/flags";
import { getSlots, soldOut } from "@/lib/orders";
import { getShop } from "@/lib/shops";


/** Everything the customer storefront needs, resolved through Flagsmith. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const shop = getShop(slug);
  if (!shop) return json({ error: "not_found" }, 404);
  const cid = new URL(req.url).searchParams.get("cid") || "anon";
  const lang = new URL(req.url).searchParams.get("lang") || "";

  const [flags, out, upsell] = await Promise.all([
    getShopFlags(shop),
    soldOut(shop.slug),
    getUpsellVariant(cid, { shop: shop.slug, ...(lang ? { language: lang } : {}) }),
  ]);
  after(flushFlagEvents);

  const capacity = flags.rush.enabled ? flags.rush.config.slot_capacity : 8;
  const slots = await getSlots(shop, capacity);
  const catalog = shop.catalog
    .filter((c) => !(flags.rush.enabled && flags.rush.config.fast_movers_only && !c.fast))
    .map((c) => ({ ...c, soldOut: out.includes(c.id) }));

  return json({
    shop: { slug: shop.slug, name: shop.name, area: shop.area, city: shop.city, shopType: shop.shopType },
    catalog,
    hiddenInRush: flags.rush.enabled && flags.rush.config.fast_movers_only ? shop.catalog.filter((c) => !c.fast).length : 0,
    flags: { ...flags, upsell },
    slots,
  });
}
