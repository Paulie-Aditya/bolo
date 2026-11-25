import { Flagsmith } from "@flagsmith/nodejs";
import type { Shop } from "./shops";
import { shopTraits } from "./shops";

/**
 * Flagsmith is Bolo's control plane:
 *  - festival_theme      remote config, overridden per segment (bakeries -> Christmas, Tamil Nadu -> Karthigai Deepam)
 *  - rush_mode           enabled through the `shops_in_rush` segment when the owner sets the rush_mode trait
 *  - voice_ordering      kill switch NudgeBee flips (after human approval) when Sarvam degrades
 *  - voice_replies       kill switch for Bulbul TTS
 *  - enabled_languages   remote config
 *  - owner_voice_commands beta, `pilot_shops` segment only
 *  - chaos_sarvam_outage game-day switch to rehearse the NudgeBee runbook
 *  - upsell_prompt       multivariate experiment (Flagsmith Experimentation), metric: order_placed
 */

export interface FestivalTheme {
  key: string;
  festival: string;
  greeting: string;
  tagline: string;
  accent: string;
  accent2: string;
  emoji: string;
  featured: string[];
}

export interface RushConfig {
  slot_capacity: number;
  pickup_only: boolean;
  fast_movers_only: boolean;
  banner: string;
}

export interface ShopFlags {
  theme: FestivalTheme;
  rush: { enabled: boolean; config: RushConfig };
  voiceOrdering: boolean;
  voiceReplies: boolean;
  languages: string[];
  ownerVoiceCommands: boolean;
  chaos: boolean;
  source: "flagsmith" | "defaults";
}

const DEFAULT_THEME: FestivalTheme = {
  key: "shaadi",
  festival: "Shaadi Season",
  greeting: "Shaadi season is here! Order mithai for the big day.",
  tagline: "Bulk orders for sangeet, haldi and reception",
  accent: "#E11D48",
  accent2: "#F59E0B",
  emoji: "💍",
  featured: [],
};
const DEFAULT_RUSH: RushConfig = { slot_capacity: 3, pickup_only: true, fast_movers_only: true, banner: "We're in festive rush! Pickup only, limited slots." };
const DEFAULT_LANGS = ["hi-IN", "kn-IN", "ta-IN", "te-IN", "ml-IN", "bn-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN", "en-IN"];

const g = globalThis as unknown as { __flagsmith?: Flagsmith | null };

export function client(): Flagsmith | null {
  if (g.__flagsmith !== undefined) return g.__flagsmith;
  const key = process.env.FLAGSMITH_SERVER_KEY;
  g.__flagsmith = key
    ? new Flagsmith({
        environmentKey: key,
        enableEvents: true,
        requestTimeoutSeconds: 4,
      })
    : null;
  return g.__flagsmith;
}

function parse<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v !== "string") return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export const shopIdentity = (slug: string) => `shop:${slug}`;

/** Flags for a shop identity. Traits are upserted on every read so segments stay current. */
export async function getShopFlags(shop: Shop, extraTraits: Record<string, string | boolean | number> = {}): Promise<ShopFlags> {
  const fs = client();
  const defaults: ShopFlags = {
    theme: DEFAULT_THEME,
    rush: { enabled: false, config: DEFAULT_RUSH },
    voiceOrdering: true,
    voiceReplies: true,
    languages: DEFAULT_LANGS,
    ownerVoiceCommands: shop.plan === "pilot",
    chaos: false,
    source: "defaults",
  };
  if (!fs) return defaults;
  try {
    const flags = await fs.getIdentityFlags(shopIdentity(shop.slug), { ...shopTraits(shop), ...extraTraits });
    const rushFlag = flags.getFlag("rush_mode");
    return {
      theme: { ...DEFAULT_THEME, ...parse<FestivalTheme>(flags.getFeatureValue("festival_theme"), DEFAULT_THEME) },
      rush: { enabled: rushFlag.enabled, config: { ...DEFAULT_RUSH, ...parse<RushConfig>(rushFlag.value, DEFAULT_RUSH) } },
      voiceOrdering: flags.isFeatureEnabled("voice_ordering"),
      voiceReplies: flags.isFeatureEnabled("voice_replies"),
      languages: parse<string[]>(flags.getFeatureValue("enabled_languages"), DEFAULT_LANGS),
      ownerVoiceCommands: flags.isFeatureEnabled("owner_voice_commands"),
      chaos: flags.isFeatureEnabled("chaos_sarvam_outage"),
      source: "flagsmith",
    };
  } catch (e) {
    console.error("[flagsmith] falling back to defaults", e);
    return defaults;
  }
}

/** Owner toggles Rush Mode: we set a trait, the `shops_in_rush` segment does the rest. */
export async function setShopRush(shop: Shop, on: boolean) {
  return getShopFlags(shop, { rush_mode: on ? "true" : "false" });
}

/** Upsell experiment: resolves the variation for this customer and records the exposure. */
export async function getUpsellVariant(customerId: string, traits: Record<string, string> = {}): Promise<string> {
  const fs = client();
  if (!fs) return "none";
  try {
    const flag = await fs.getExperimentFlag("upsell_prompt", `cust:${customerId}`, traits);
    return String(flag.value ?? "none") || "none";
  } catch (e) {
    console.error("[flagsmith] upsell flag failed", e);
    return "none";
  }
}

/** Conversion event for the experiment metric. */
export function trackOrderPlaced(customerId: string, total: number, metadata: Record<string, unknown>) {
  const fs = client();
  if (!fs) return;
  try {
    fs.trackEvent("order_placed", { identifier: `cust:${customerId}`, value: total, metadata });
  } catch (e) {
    console.error("[flagsmith] trackEvent failed", e);
  }
}

export async function flushFlagEvents() {
  try {
    await client()?.flushEvents();
  } catch {
    /* ignore */
  }
}
