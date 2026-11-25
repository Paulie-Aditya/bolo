import { json } from "@/lib/api";
import { getShopFlags, setShopRush } from "@/lib/flags";
import { getShop } from "@/lib/shops";
import { sadd, srem } from "@/lib/store";


type Action = { action: "rush_on" | "rush_off" } | { action: "sold_out" | "restock"; items: string[] };

/** Shop control room. Rush Mode goes through Flagsmith (trait -> segment -> flag). */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const shop = getShop(slug);
  if (!shop) return json({ error: "not_found" }, 404);
  const body = (await req.json()) as Action;
  switch (body.action) {
    case "rush_on":
    case "rush_off": {
      const flags = await setShopRush(shop, body.action === "rush_on");
      return json({ ok: true, flags });
    }
    case "sold_out":
      await sadd(`soldout:${slug}`, ...body.items.filter((i) => shop.catalog.some((c) => c.id === i)));
      break;
    case "restock":
      await srem(`soldout:${slug}`, ...body.items);
      break;
    default:
      return json({ error: "bad_action" }, 400);
  }
  return json({ ok: true, flags: await getShopFlags(shop) });
}
