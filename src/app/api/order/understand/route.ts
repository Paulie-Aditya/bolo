import { apiError, json } from "@/lib/api";
import { getShopFlags } from "@/lib/flags";
import { soldOut, understandOrder } from "@/lib/orders";
import { transcribe } from "@/lib/sarvam";
import { getShop } from "@/lib/shops";

export const maxDuration = 60;

/**
 * Voice order -> structured order.
 *   1. Sarvam Saaras v4 transcribes (language auto-detected, catalog names as keyterms)
 *   2. Sarvam-105B maps it to the catalog with a JSON schema and writes the reply in the customer's language
 */
export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const shop = getShop(String(fd.get("shop") || ""));
    if (!shop) return json({ error: "not_found" }, 404);
    const upsell = String(fd.get("upsell") || "none");
    const flags = await getShopFlags(shop);
    if (!flags.voiceOrdering) return json({ error: "voice_disabled", message: "Voice ordering is paused. Please tap to order." }, 409);

    const out = await soldOut(shop.slug);
    const catalog = shop.catalog
      .filter((c) => !out.includes(c.id))
      .filter((c) => !(flags.rush.enabled && flags.rush.config.fast_movers_only && !c.fast));

    let transcript = String(fd.get("text") || "").trim();
    let language = String(fd.get("lang") || "");
    const audio = fd.get("audio");
    const t0 = Date.now();
    if (audio && audio instanceof Blob && audio.size > 0) {
      const stt = await transcribe(audio, { keyterms: catalog.flatMap((c) => [c.name, ...c.aliases.filter((a) => /^[\x00-\x7F]+$/.test(a))]), chaos: flags.chaos });
      transcript = stt.transcript;
      language = stt.language || language || "hi-IN";
    }
    const sttMs = Date.now() - t0;
    if (!transcript) return json({ error: "empty", message: "We couldn't hear an order. Try again, a little closer to the mic." }, 422);
    if (!language) language = /[ऀ-ॿ]/.test(transcript) ? "hi-IN" : "en-IN";

    const draft = await understandOrder({ shop, catalog, transcript, language, upsellVariant: upsell, chaos: flags.chaos });
    const soldOutAsked = shop.catalog.filter((c) => out.includes(c.id) && c.aliases.concat(c.name).some((a) => transcript.toLowerCase().includes(a.toLowerCase())));
    return json({ draft, soldOutAsked: soldOutAsked.map((c) => c.name), timings: { sttMs, totalMs: Date.now() - t0 } });
  } catch (e) {
    return apiError(e);
  }
}
