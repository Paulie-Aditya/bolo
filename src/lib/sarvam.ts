import { lpush, lrange } from "./store";

const BASE = "https://api.sarvam.ai";
const KEY = process.env.SARVAM_API_KEY || "";

export type SarvamApi = "stt" | "chat" | "translate" | "tts";

export interface CallMetric {
  api: SarvamApi;
  ok: boolean;
  ms: number;
  at: number;
  error?: string;
}

export class SarvamError extends Error {
  constructor(message: string, public api: SarvamApi, public status?: number) {
    super(message);
  }
}

/** Every Sarvam call goes through here so /api/health (and NudgeBee) can see latency and errors. */
async function tracked<T>(api: SarvamApi, chaos: boolean, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    if (chaos) {
      await new Promise((r) => setTimeout(r, 400));
      throw new SarvamError("Simulated Sarvam outage (Flagsmith flag chaos_sarvam_outage is on)", api, 503);
    }
    const out = await fn();
    await record({ api, ok: true, ms: Date.now() - start, at: Date.now() });
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await record({ api, ok: false, ms: Date.now() - start, at: Date.now(), error: msg.slice(0, 200) });
    throw e instanceof SarvamError ? e : new SarvamError(msg, api);
  }
}

async function record(m: CallMetric) {
  try {
    await lpush("metrics:sarvam", m, 300);
  } catch {
    /* metrics must never break ordering */
  }
}

export async function recentMetrics(windowMs = 5 * 60_000): Promise<CallMetric[]> {
  const all = await lrange<CallMetric>("metrics:sarvam", 0, 299);
  const since = Date.now() - windowMs;
  return all.filter((m) => m && m.at >= since);
}

async function postJSON(path: string, body: unknown, api: SarvamApi) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "api-subscription-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new SarvamError(`Sarvam ${path} ${res.status}: ${text.slice(0, 300)}`, api, res.status);
  return JSON.parse(text);
}

/** Saaras v4 speech-to-text with language auto-detection and catalog keyterm biasing. */
export async function transcribe(
  audio: Blob,
  opts: { keyterms?: string[]; language?: string; chaos?: boolean } = {},
): Promise<{ transcript: string; language: string | null; languageProbability?: number }> {
  return tracked("stt", !!opts.chaos, async () => {
    const fd = new FormData();
    fd.append("file", audio, "order.webm");
    fd.append("model", "saaras:v4");
    fd.append("mode", "codemix");
    fd.append("language_code", opts.language || "unknown");
    if (opts.keyterms?.length) fd.append("keyterms", JSON.stringify(opts.keyterms.slice(0, 50)));
    const res = await fetch(BASE + "/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": KEY },
      body: fd,
    });
    const text = await res.text();
    if (!res.ok) throw new SarvamError(`Sarvam STT ${res.status}: ${text.slice(0, 300)}`, "stt", res.status);
    const d = JSON.parse(text);
    return { transcript: d.transcript ?? "", language: d.language_code ?? null, languageProbability: d.language_probability };
  });
}

/** Sarvam-105B chat with structured output (JSON schema). Reasoning is off for low latency. */
export async function chatJSON<T>(
  system: string,
  user: string,
  schema: { name: string; schema: Record<string, unknown> },
  opts: { chaos?: boolean; maxTokens?: number } = {},
): Promise<T> {
  return tracked("chat", !!opts.chaos, async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const d = await postJSON(
        "/v1/chat/completions",
        {
          model: "sarvam-105b",
          reasoning_effort: null,
          temperature: attempt ? 0 : 0.2,
          max_tokens: opts.maxTokens ?? 1200,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_schema", json_schema: { name: schema.name, schema: schema.schema, strict: true } },
        },
        "chat",
      );
      const content: string = d.choices?.[0]?.message?.content ?? "";
      try {
        return parseLooseJSON<T>(content);
      } catch (e) {
        lastErr = e;
        console.warn("[sarvam] chat JSON parse failed, retrying", content.slice(0, 300));
      }
    }
    throw lastErr;
  });
}

function parseLooseJSON<T>(content: string): T {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  let text = content.slice(start, end + 1);
  try {
    return JSON.parse(text) as T;
  } catch {
    text = text
      .replace(/,\s*([}\]])/g, "$1") // trailing commas
      .replace(/}\s*{/g, "},{") // missing commas between objects
      .replace(/"\s*\n\s*"/g, '",\n"'); // missing commas between fields
    return JSON.parse(text) as T;
  }
}

/** Mayura translation (short text). */
export async function translate(text: string, target: string, source = "auto", opts: { chaos?: boolean } = {}): Promise<string> {
  if (!text.trim()) return text;
  if (target === source) return text;
  return tracked("translate", !!opts.chaos, async () => {
    const d = await postJSON(
      "/translate",
      { input: text.slice(0, 1000), source_language_code: source, target_language_code: target, model: "mayura:v1", mode: "modern-colloquial" },
      "translate",
    );
    return d.translated_text as string;
  });
}

const TTS_LANGS = new Set(["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"]);

/** Bulbul v3 text-to-speech. Returns base64 WAV. */
export async function speak(text: string, language: string, opts: { chaos?: boolean; speaker?: string } = {}): Promise<string> {
  const lang = TTS_LANGS.has(language) ? language : "hi-IN";
  return tracked("tts", !!opts.chaos, async () => {
    const d = await postJSON(
      "/text-to-speech",
      { text: text.slice(0, 2400), language_code: lang, model: "bulbul:v3", speaker: opts.speaker || "priya", pace: 1.05 },
      "tts",
    );
    return d.audios?.[0] as string;
  });
}
