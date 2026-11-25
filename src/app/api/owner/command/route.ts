import { apiError, json } from "@/lib/api";
import { getShopFlags } from "@/lib/flags";
import { chatJSON, transcribe } from "@/lib/sarvam";
import { getShop, langLabel } from "@/lib/shops";

export const maxDuration = 60;

const SCHEMA = {
  name: "owner_command",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: ["sold_out", "restock", "rush_on", "rush_off", "unknown"] },
      items: { type: "array", items: { type: "string" } },
      english: { type: "string", description: "what will happen, in English, one line" },
      confirm_text: { type: "string", description: "same line in the owner's language and script" },
    },
    required: ["action", "items", "english", "confirm_text"],
  },
};

/**
 * Beta (Flagsmith: owner_voice_commands, pilot_shops segment).
 * The owner speaks in their own language ("kaju katli khatam aaytu", "rush mode on maadi").
 * Bolo proposes an action; nothing changes until the owner taps Approve.
 */
export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const shop = getShop(String(fd.get("shop") || ""));
    if (!shop) return json({ error: "not_found" }, 404);
    const flags = await getShopFlags(shop);
    if (!flags.ownerVoiceCommands) return json({ error: "not_in_pilot", message: "Owner voice commands are in beta for pilot shops." }, 403);

    let text = String(fd.get("text") || "").trim();
    const audio = fd.get("audio");
    if (audio && audio instanceof Blob && audio.size > 0) {
      const stt = await transcribe(audio, { keyterms: shop.catalog.map((c) => c.name).concat(["rush mode", "sold out", "khatam", "stock"]), chaos: flags.chaos });
      text = stt.transcript;
    }
    if (!text) return json({ error: "empty" }, 422);

    const system = `You help the owner of ${shop.name} run the shop by voice during the festive rush.
Catalog ids: ${shop.catalog.map((c) => `${c.id} (${c.name}; ${c.aliases.join(", ")})`).join("; ")}.
Map the owner's sentence to ONE action:
- sold_out: items ran out ("khatam", "khali", "illa", "mugidide", "finished", "over")
- restock: items are back ("aa gaya", "banthu", "ready again", "back in stock")
- rush_on: too many orders, switch on rush mode / limit orders
- rush_off: rush is over, back to normal
- unknown: anything else
Use only catalog ids in items.
english: the proposed change as an imperative, e.g. "Mark Mysore Pak as sold out" or "Turn on Rush Mode".
confirm_text: the same proposal as a short yes/no question written in ${langLabel(shop.ownerLang)} (${shop.ownerLang}) in its native script, e.g. for Kannada "ಮೈಸೂರ್ ಪಾಕ್ ಸೋಲ್ಡ್ ಔಟ್ ಎಂದು ಗುರುತಿಸಲೇ?".`;
    const intent = await chatJSON<{ action: string; items: string[]; english: string; confirm_text: string }>(system, `Owner said: """${text}"""`, SCHEMA, { chaos: flags.chaos, maxTokens: 400 });
    intent.items = (intent.items || []).filter((i) => shop.catalog.some((c) => c.id === i));
    return json({ heard: text, intent });
  } catch (e) {
    return apiError(e);
  }
}
