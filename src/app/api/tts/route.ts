import { apiError, json } from "@/lib/api";
import { getShopFlags } from "@/lib/flags";
import { speak } from "@/lib/sarvam";
import { getShop } from "@/lib/shops";
import { getJSON, setJSON } from "@/lib/store";


/** Bulbul v3 voice reply, behind the voice_replies kill switch. Cached for an hour. */
export async function POST(req: Request) {
  try {
    const { text, lang, shop: slug } = (await req.json()) as { text: string; lang: string; shop: string };
    const shop = getShop(slug);
    if (!shop || !text) return json({ error: "bad_request" }, 400);
    const flags = await getShopFlags(shop);
    if (!flags.voiceReplies) return json({ audio: null, disabled: true });
    const key = `tts:${lang}:${hash(text)}`;
    const cached = await getJSON<string>(key);
    if (cached) return json({ audio: cached, cached: true });
    const audio = await speak(text, lang, { chaos: flags.chaos });
    await setJSON(key, audio, 3600);
    return json({ audio });
  } catch (e) {
    return apiError(e);
  }
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length;
}
