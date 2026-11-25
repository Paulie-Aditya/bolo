import Link from "next/link";

const SHOPS = [
  { slug: "annapurna-sweets", name: "Annapurna Sweets", where: "Jayanagar, Bengaluru", note: "Shaadi season · owner reads Kannada · pilot shop", emoji: "💍" },
  { slug: "meenakshi-sweets", name: "Meenakshi Sweets", where: "T. Nagar, Chennai", note: "Karthigai Deepam theme via Flagsmith segment", emoji: "🪔" },
  { slug: "rosies-bakes", name: "Rosie's Home Bakes", where: "Fraser Town, Bengaluru", note: "Christmas theme for bakeries · owner reads Malayalam", emoji: "🎄" },
];

const LINES = [
  { lang: "हिन्दी", text: "भैया, एक किलो काजू कतली और दस गुलाब जामुन, शाम छह बजे" },
  { lang: "ಕನ್ನಡ", text: "ಅರ್ಧ ಕೆಜಿ ಮೈಸೂರ್ ಪಾಕ್ ಮತ್ತು ಒಂದು gift box ಬೇಕು" },
  { lang: "தமிழ்", text: "ஒரு கிலோ மைசூர் பாக், அரை கிலோ mixture வேணும்" },
  { lang: "English", text: "Two kg motichoor ladoo for the sangeet, pickup at 7" },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 texture opacity-60" />
        <div className="relative max-w-6xl mx-auto px-6 pt-8 pb-20">
          <nav className="flex items-center justify-between">
            <span className="font-display text-3xl font-bold">bolo</span>
            <div className="flex gap-2 text-sm">
              <Link className="btn btn-ghost !py-2" href="/ops">
                Ops
              </Link>
              <Link className="btn btn-primary !py-2" href="/shop/annapurna-sweets">
                Owner demo
              </Link>
            </div>
          </nav>

          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center mt-16">
            <div>
              <span className="chip">🪔 Built for the festive rush · Festive Hacks 2026</span>
              <h1 className="font-display text-5xl md:text-7xl font-extrabold leading-[0.95] mt-5">
                Just say
                <br />
                your order.
              </h1>
              <p className="text-lg text-ink-2 mt-6 max-w-lg">
                In Diwali, shaadi and Christmas weeks, the neighbourhood sweet shop takes hundreds of orders by phone and WhatsApp voice note, in five languages, on paper. Orders get lost and quantities get misheard. Bolo
                lets customers <b className="text-ink">speak their order in any Indian language</b>. The owner gets a clean, translated order board with pickup slots that don’t overbook.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/s/annapurna-sweets" className="btn btn-accent text-base !px-6 !py-4">
                  🎙 Try ordering by voice
                </Link>
                <Link href="/shop/annapurna-sweets" className="btn btn-ghost text-base !px-6 !py-4">
                  See the shop’s side →
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              {LINES.map((l, i) => (
                <div key={l.text} className="card px-4 py-3 rise flex items-start gap-3" style={{ animationDelay: `${i * 120}ms`, marginLeft: i % 2 ? 32 : 0 }}>
                  <span className="chip !py-0.5 shrink-0">{l.lang}</span>
                  <span className="text-[15px]">“{l.text}”</span>
                </div>
              ))}
              <div className="card px-4 py-3 bg-ink text-paper border-ink rise" style={{ animationDelay: "500ms" }}>
                <div className="text-[11px] uppercase tracking-wide opacity-60">Owner sees, in Kannada and English</div>
                <div className="mt-1 font-semibold">B07 · 1 kg Kaju Katli, 10 Gulab Jamun · pickup 6:00 PM · ₹1,350</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-display text-4xl font-bold">How it works</h2>
        <div className="grid md:grid-cols-4 gap-4 mt-8">
          {[
            ["Scan & speak", "Customers scan the QR at the counter or open the shop’s WhatsApp link and talk. No app, no login."],
            ["Understood", "Sarvam Saaras transcribes any of 22 languages, including code-mixed speech. Sarvam-105B maps it to the menu, quantities and pickup time."],
            ["Confirmed out loud", "Bulbul reads the order back in the customer’s own language. Slots respect the shop’s capacity, so nobody waits 40 minutes."],
            ["Packed & told", "The owner’s board shows every order translated into their language. “Ready” sends a spoken message in the customer’s language."],
          ].map(([t, d], i) => (
            <div key={t} className="card p-5">
              <div className="font-display text-5xl font-extrabold text-accent">{i + 1}</div>
              <div className="font-bold text-lg mt-2">{t}</div>
              <p className="text-sm text-ink-2 mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="font-display text-4xl font-bold">Try a shop</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {SHOPS.map((s) => (
            <div key={s.slug} className="card p-5 flex flex-col">
              <div className="text-3xl">{s.emoji}</div>
              <div className="font-display text-2xl font-bold mt-2">{s.name}</div>
              <div className="text-sm text-ink-2">{s.where}</div>
              <div className="text-xs mt-2 text-ink-2">{s.note}</div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-line">
                <Link href={`/s/${s.slug}`} className="btn btn-primary !py-2 text-sm flex-1">
                  Customer
                </Link>
                <Link href={`/shop/${s.slug}`} className="btn btn-ghost !py-2 text-sm flex-1">
                  Owner
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper">
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-8">
          <div>
            <div className="chip !bg-transparent !text-paper/80 !border-paper/20">Sarvam AI</div>
            <h3 className="font-display text-2xl font-bold mt-3">Hears India</h3>
            <p className="text-paper/70 text-sm mt-2">Saaras v4 speech-to-text with catalog keyterms. Sarvam-105B structured extraction. Bulbul v3 voice replies. Mayura translation for the owner and for “your order is ready”.</p>
          </div>
          <div>
            <div className="chip !bg-transparent !text-paper/80 !border-paper/20">Flagsmith</div>
            <h3 className="font-display text-2xl font-bold mt-3">Runs the shop floor</h3>
            <p className="text-paper/70 text-sm mt-2">Festival themes by segment. Rush Mode via traits and segments. Kill switches for voice. A live A/B experiment on the gift-box upsell. Owner voice commands in beta for pilot shops.</p>
          </div>
          <div>
            <div className="chip !bg-transparent !text-paper/80 !border-paper/20">NudgeBee</div>
            <h3 className="font-display text-2xl font-bold mt-3">Keeps it standing</h3>
            <p className="text-paper/70 text-sm mt-2">
              An automation watches Bolo’s health. When Sarvam degrades mid-rush it opens an AI-analysed incident and asks a human. On approval it flips Flagsmith to tap-to-order. <Link className="underline" href="/ops">See the loop →</Link>
            </p>
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-8 text-sm text-ink-2 flex justify-between">
        <span>Bolo · Festive Hacks, BIEC Bengaluru · 25 Nov 2026</span>
        <a className="underline" href="https://github.com/Paulie-Aditya/bolo">
          GitHub
        </a>
      </footer>
    </main>
  );
}
