# Bolo: just say your order

**Voice ordering in Indian languages for neighbourhood sweet shops and home bakers during the festive rush.**

Built at **Festive Hacks (WeMakeDevs × WeAreDevelopers), BIEC Bengaluru, 25 Nov 2026** with **Sarvam AI**, **Flagsmith** and **NudgeBee**.

**Live:** https://bolo-festivehacks.vercel.app · **Customer:** `/s/annapurna-sweets` · **Owner:** `/shop/annapurna-sweets` · **Ops:** `/ops`

---

## The problem

In Diwali, shaadi and Christmas weeks, a neighbourhood mithai shop or home baker does a big share of its year's sales. The orders arrive as phone calls and WhatsApp voice notes, in Kannada, Hindi, Tamil and Hinglish, and get written on paper by someone who is also running the counter.

- Orders get lost or misheard ("aadha kilo" or "dhai sau gram"?).
- Pickup times pile up, so 15 people turn up at 7 PM.
- The owner may not read the customer's language (a Kannada-speaking owner, a Hindi-speaking customer).
- When something runs out, nobody stops taking orders for it.

Ordering apps don't help. These customers won't install an app, and many don't want to type. **They want to say it.**

## What Bolo does

1. **Customers scan a QR code at the counter** (or tap the shop's WhatsApp link) and **speak their order in any language**, code-mixed is fine.
2. **Sarvam Saaras v4** transcribes it with language auto-detection, biased toward the shop's menu (keyterms).
3. **Sarvam-105B** (structured JSON-schema output) maps it to the catalog: items, quantities ("aadha kilo" = 0.5 kg), customer name and pickup time. It writes a confirmation in the customer's language. **Prices and totals are computed server-side, never by the LLM.**
4. **Sarvam Bulbul v3** reads the confirmation back out loud, in that language.
5. The customer picks a **pickup slot that respects the shop's capacity** and gets a token (B07).
6. The **owner's board** shows each order with a **Mayura translation into the owner's language**, the original words, and Packing → Ready → Picked up buttons.
7. On **Ready**, the customer's tracking page **speaks "your order is ready" in their own language.**
8. **Owner voice commands (beta):** the owner says *"kaju katli khatam aaytu"* and Bolo proposes "Mark Kaju Katli sold out". The owner approves with one tap.

Total time from speech to a structured, priced order: **about 4 seconds.**

## How each sponsor tool is used

### Sarvam AI: the whole voice pipeline

| Step | Sarvam API | Where |
| --- | --- | --- |
| Hear the order (22 languages, code-mix, auto language-ID, menu keyterms) | `POST /speech-to-text`, `saaras:v4`, `mode=codemix` | `src/lib/sarvam.ts` → `transcribe` |
| Understand it (catalog mapping, quantities, name, time, reply in customer's language) | `POST /v1/chat/completions`, `sarvam-105b`, `response_format: json_schema`, reasoning off for latency | `src/lib/orders.ts` → `understandOrder` |
| Say it back | `POST /text-to-speech`, `bulbul:v3` | `/api/tts` |
| Translate for the owner, and "your order is ready" for the customer | `POST /translate`, `mayura:v1` | `createOrder`, `PATCH /api/orders/[id]` |
| Owner voice commands | Saaras + Sarvam-105B intent extraction | `/api/owner/command` |

Every Sarvam call is timed and its success or failure recorded. That feeds `/api/health`, which NudgeBee watches.

### Flagsmith: the shop's control plane

All of it is created by [`scripts/setup-flagsmith.mjs`](scripts/setup-flagsmith.mjs) through the Admin API (v2 feature versioning), so it's reproducible.

| Flag | Type | What it does |
| --- | --- | --- |
| `festival_theme` | Remote config + **segment overrides** | The storefront dresses itself for the festival without a redeploy. Default: Shaadi Season. Segment `bakeries` gets Christmas & New Year. Segment `region_tamil_nadu` gets Karthigai Deepam. |
| `rush_mode` | Flag + JSON config, enabled through the **`shops_in_rush` segment** | When the owner flips Rush Mode, Bolo sets the shop identity's `rush_mode` **trait**. The segment turns the flag on for that shop: pickup only, `slot_capacity: 3`, fast-movers-only menu. |
| `voice_ordering` | **Kill switch** | Off means the storefront falls back to tap-to-order. NudgeBee flips this after human approval when Sarvam degrades. |
| `voice_replies` | Kill switch | Turns off spoken confirmations (TTS) independently. |
| `enabled_languages` | Remote config | Languages offered on the storefront. |
| `owner_voice_commands` | **Beta, gated to the `pilot_shops` segment** (`plan = pilot`) | Only Annapurna Sweets has the "Tell Bolo" panel. |
| `chaos_sarvam_outage` | Game-day switch | Makes Bolo's Sarvam calls fail on purpose, so the NudgeBee runbook can be rehearsed before the real rush. |
| `upsell_prompt` | **Multivariate experiment (Flagsmith Experimentation)** | Question: *does offering a festive gift box at confirmation raise order value?* Control `none` vs `gift_box`, 50/50, bucketed on a stable per-device customer identity. `getExperimentFlag` records the exposure. `trackEvent("order_placed", { value: total })` records the conversion. The variation also changes what Sarvam-105B says out loud. |

Identities: each shop is `shop:<slug>` with traits `city`, `region`, `shop_type`, `plan`, `rush_mode`. Each customer is `cust:<device-id>`.

### NudgeBee: keeps the voice line up when it matters most

Peak festive hour is the worst time for the voice pipeline to fail. Bolo has a human-approved, self-healing loop:

```
Bolo /api/health ──(scheduled HTTP check)──► NudgeBee automation
   error rate / p95 of every Sarvam call          │ status == degraded && voice_ordering on?
                                                  ├─► events.store  → NudgeBee AI analysis of the incident
                                                  ├─► Approval (in-app)  ← a human decides
                                                  └─► HTTP → Bolo /api/ops/voice (re-checks health)
                                                             └─► Flagsmith Admin API: voice_ordering OFF
                                                             │
Customers ◄── storefront switches to tap-to-order in seconds ┘   (orders keep flowing)
```

Two pieces feed NudgeBee:

1. **In-cluster voice canary** ([`k8s/bolo-canary.yaml`](k8s/bolo-canary.yaml)). A tiny Deployment in a kind cluster that the NudgeBee agent watches. It polls `/api/health` every 20s and **fails its readiness probe when the Sarvam pipeline degrades**. NudgeBee then sees real Kubernetes events and logs for its AI root-cause analysis. `bash k8s/bootstrap.sh` creates the cluster and canary, then NudgeBee's own install command connects the agent.
2. **Approval-gated runbook** ([`nudgebee/bolo-voice-failover.yml`](nudgebee/bolo-voice-failover.yml)). Every minute: HTTP health check → `events.store` (AI analysis) → `llm.summary` → `core.approval` → HTTP call to Bolo's self-validating `/api/ops/voice`, which turns `voice_ordering` off through the Flagsmith Admin API → `events.add_evidence`. NudgeBee holds no secrets, and every action lands in an audit trail on `/ops`.

Rehearse it by turning on `chaos_sarvam_outage` in Flagsmith and placing a few voice orders.

## Architecture

- **Next.js 16** (App Router, route handlers), TypeScript, Tailwind v4, deployed on **Vercel (bom1, Mumbai)**
- **Upstash Redis** (Vercel Marketplace) for orders, tokens, sold-out items, TTS cache and Sarvam call metrics. Falls back to in-memory storage locally.
- `src/lib/sarvam.ts`: Sarvam client with metrics and chaos hooks
- `src/lib/flags.ts`: Flagsmith server SDK (`@flagsmith/nodejs` with events enabled)
- `src/lib/orders.ts`: order understanding, slots, persistence
- Pages: `/` landing, `/s/[slug]` customer storefront, `/shop/[slug]` owner board, `/o/[id]` order tracking, `/ops` health and runbook

## Run it locally

```bash
git clone https://github.com/Paulie-Aditya/bolo && cd bolo
npm install
cp .env.example .env.local      # add SARVAM_API_KEY and FLAGSMITH_SERVER_KEY

# one-time: create the Flagsmith flags, segments and overrides in your project
set -a; source .env.local; set +a
node scripts/setup-flagsmith.mjs

npm run dev                      # http://localhost:3000/s/annapurna-sweets
```

- `SARVAM_API_KEY`: from https://dashboard.sarvam.ai
- `FLAGSMITH_SERVER_KEY`: Flagsmith → Environment settings → Keys → server-side key
- `FLAGSMITH_ADMIN_KEY`, `FLAGSMITH_PROJECT_ID`, `FLAGSMITH_ENV_IDS`: only for the setup script
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`: optional, Upstash Redis

The microphone needs `localhost` or HTTPS. Every screen also accepts typed input, and the storefront has one-tap example orders in four languages.

## What's next (why this is a business, not a demo)

- **WhatsApp voice notes in**: the same pipeline, triggered from the shop's WhatsApp Business number, which is where these orders already arrive.
- **Phone line**: Sarvam's voice agents (Samvaad) put the same agent on a phone number for customers who just call.
- **Menu from a photo**: Sarvam Vision reads the handwritten rate board and builds the catalog in a minute.
- Pricing: a flat ₹499/month per shop in festive season. Customers need no app and no login.

## Disclosure

Built during the hackathon with an AI coding assistant (Claude Code), as allowed by the rules. All three demo shops are fictional.
