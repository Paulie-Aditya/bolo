#!/usr/bin/env node
/**
 * Creates every Flagsmith feature, segment and segment override that Bolo uses,
 * through the Flagsmith Admin API (v2 feature versioning).
 *
 *   FLAGSMITH_ADMIN_KEY=... FLAGSMITH_PROJECT_ID=... FLAGSMITH_ENV_IDS=119867,119868 \
 *     node scripts/setup-flagsmith.mjs
 *
 * Safe to re-run: existing features and segments are reused.
 */
const API = "https://api.flagsmith.com/api/v1";
const KEY = process.env.FLAGSMITH_ADMIN_KEY;
const PROJECT = process.env.FLAGSMITH_PROJECT_ID;
const ENV_IDS = (process.env.FLAGSMITH_ENV_IDS || process.env.FLAGSMITH_ENV_ID || "").split(",").filter(Boolean);
if (!KEY || !PROJECT || !ENV_IDS.length) {
  console.error("Set FLAGSMITH_ADMIN_KEY, FLAGSMITH_PROJECT_ID and FLAGSMITH_ENV_IDS");
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Api-Key ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const theme = (t) => JSON.stringify(t);

const THEMES = {
  shaadi: {
    key: "shaadi",
    festival: "Shaadi Season",
    greeting: "Shaadi season is here! Order mithai for the big day.",
    tagline: "Bulk orders for sangeet, haldi and reception",
    accent: "#E11D48",
    accent2: "#F59E0B",
    emoji: "💍",
    featured: ["kaju-katli", "motichoor-ladoo", "gift-box"],
  },
  karthigai: {
    key: "karthigai",
    festival: "Karthigai Deepam",
    greeting: "Karthigai Deepam vazhthukkal! Light up the evening with sweets.",
    tagline: "Appam, pori urundai and festive boxes",
    accent: "#EA580C",
    accent2: "#FACC15",
    emoji: "🪔",
    featured: ["mysore-pak", "pori-urundai", "gift-box"],
  },
  christmas: {
    key: "christmas",
    festival: "Christmas & New Year",
    greeting: "Merry Christmas! Pre-order your plum cake before the rush.",
    tagline: "Plum cakes, rose cookies and kulkuls",
    accent: "#DC2626",
    accent2: "#16A34A",
    emoji: "🎄",
    featured: ["plum-cake", "rose-cookies", "gift-box"],
  },
};

const SEGMENTS = [
  { name: "shops_in_rush", description: "Shops whose owner switched on Rush Mode (trait rush_mode=true)", conditions: [{ property: "rush_mode", operator: "EQUAL", value: "true" }] },
  { name: "pilot_shops", description: "Shops in the owner-voice-commands pilot", conditions: [{ property: "plan", operator: "EQUAL", value: "pilot" }] },
  { name: "bakeries", description: "Bakeries: Christmas theme", conditions: [{ property: "shop_type", operator: "EQUAL", value: "bakery" }] },
  { name: "region_tamil_nadu", description: "Shops in Tamil Nadu / Tamil-first shops", conditions: [{ property: "region", operator: "EQUAL", value: "tamil_nadu" }] },
];

const FEATURES = [
  {
    name: "festival_theme",
    description: "Remote config: which festival the storefront is dressed for. Change it without a redeploy.",
    enabled: true,
    value: theme(THEMES.shaadi),
    overrides: [
      { segment: "bakeries", enabled: true, value: theme(THEMES.christmas) },
      { segment: "region_tamil_nadu", enabled: true, value: theme(THEMES.karthigai) },
    ],
  },
  {
    name: "rush_mode",
    description: "Festive rush controls: slot capacity, pickup-only and a fast-movers-only menu.",
    enabled: false,
    value: JSON.stringify({ slot_capacity: 3, pickup_only: true, fast_movers_only: true, banner: "We're in festive rush! Pickup only, limited slots." }),
    overrides: [
      { segment: "shops_in_rush", enabled: true, value: JSON.stringify({ slot_capacity: 3, pickup_only: true, fast_movers_only: true, banner: "We're in festive rush! Pickup only, limited slots." }) },
    ],
  },
  { name: "voice_ordering", description: "Kill switch: speak-your-order via Sarvam STT + LLM. Off = tap-to-order fallback.", enabled: true, value: "" },
  { name: "voice_replies", description: "Kill switch: spoken confirmations via Sarvam Bulbul TTS.", enabled: true, value: "" },
  {
    name: "enabled_languages",
    description: "Remote config: languages offered on the storefront.",
    enabled: true,
    value: JSON.stringify(["hi-IN", "kn-IN", "ta-IN", "te-IN", "ml-IN", "bn-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN", "en-IN"]),
  },
  {
    name: "owner_voice_commands",
    description: "Beta: shop owner manages the shop by voice (\"kaju katli khatam\"). Pilot shops only.",
    enabled: false,
    value: "",
    overrides: [{ segment: "pilot_shops", enabled: true, value: "" }],
  },
  { name: "chaos_sarvam_outage", description: "Game-day switch: make Bolo's Sarvam calls fail so the NudgeBee runbook can be rehearsed.", enabled: false, value: "" },
  {
    name: "upsell_prompt",
    type: "MULTIVARIATE",
    description: "A/B test: does offering a festive gift box at confirmation raise order value?",
    enabled: true,
    value: "none",
    variants: [{ value: "gift_box", pct: 50 }],
  },
];

async function main() {
  const existingFeatures = (await call("GET", `/projects/${PROJECT}/features/?page_size=100`)).results;
  const existingSegments = (await call("GET", `/projects/${PROJECT}/segments/?page_size=100`)).results;

  const segIds = {};
  for (const s of SEGMENTS) {
    let seg = existingSegments.find((x) => x.name === s.name);
    if (!seg) {
      seg = await call("POST", `/projects/${PROJECT}/segments/`, {
        name: s.name,
        description: s.description,
        project: Number(PROJECT),
        rules: [{ type: "ALL", rules: [{ type: "ANY", rules: [], conditions: s.conditions }], conditions: [] }],
      });
      console.log("segment +", s.name);
    }
    segIds[s.name] = seg.id;
  }

  for (const f of FEATURES) {
    let feat = existingFeatures.find((x) => x.name === f.name);
    if (!feat) {
      feat = await call("POST", `/projects/${PROJECT}/features/`, {
        name: f.name,
        description: f.description,
        type: f.type || "STANDARD",
        default_enabled: f.enabled,
        initial_value: f.value,
        multivariate_options: (f.variants || []).map((v) => ({ type: "unicode", string_value: v.value, default_percentage_allocation: v.pct })),
      });
      console.log("feature +", f.name);
    }
    for (const envId of ENV_IDS) {
      const body = {
        publish_immediately: true,
        feature_states_to_update: [{ feature_segment: null, enabled: f.enabled, feature_state_value: { type: "unicode", string_value: f.value } }],
        feature_states_to_create: (f.overrides || []).map((o, i) => ({
          feature_segment: { segment: segIds[o.segment], priority: i },
          enabled: o.enabled,
          feature_state_value: { type: "unicode", string_value: o.value },
        })),
      };
      try {
        await call("POST", `/environments/${envId}/features/${feat.id}/versions/`, body);
      } catch (e) {
        // overrides already exist on re-run: just update the environment default
        delete body.feature_states_to_create;
        await call("POST", `/environments/${envId}/features/${feat.id}/versions/`, body);
      }
    }
  }
  console.log("Flagsmith is set up for Bolo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
