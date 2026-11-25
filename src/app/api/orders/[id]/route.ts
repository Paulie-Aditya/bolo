import { connection } from "next/server";
import { apiError, json } from "@/lib/api";
import { getOrder, readyMessageEnglish, saveOrder, type OrderStatus } from "@/lib/orders";
import { translate } from "@/lib/sarvam";
import { getShop } from "@/lib/shops";


export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const order = await getOrder(id);
  if (!order) return json({ error: "not_found" }, 404);
  const shop = getShop(order.shop);
  return json({ order, shop: shop && { name: shop.name, area: shop.area, city: shop.city, slug: shop.slug } });
}

const NEXT: OrderStatus[] = ["new", "preparing", "ready", "picked"];

/** Owner moves an order along. "ready" writes the pickup message in the customer's own language (Mayura). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { status } = (await req.json()) as { status: OrderStatus };
    if (!NEXT.includes(status)) return json({ error: "bad_status" }, 400);
    const order = await getOrder(id);
    if (!order) return json({ error: "not_found" }, 404);
    const shop = getShop(order.shop)!;
    order.status = status;
    order.updatedAt = Date.now();
    if (status === "ready" && !order.readyText) {
      const en = readyMessageEnglish(order, shop);
      try {
        order.readyText = order.customerLang === "en-IN" ? en : await translate(en, order.customerLang, "en-IN");
      } catch {
        order.readyText = en;
      }
    }
    await saveOrder(order);
    return json({ order });
  } catch (e) {
    return apiError(e);
  }
}
