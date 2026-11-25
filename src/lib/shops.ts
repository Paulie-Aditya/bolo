export type Unit = "kg" | "pc" | "box";

export interface CatalogItem {
  id: string;
  name: string;
  /** names customers actually say, used as Sarvam STT keyterms and LLM hints */
  aliases: string[];
  price: number; // INR per unit
  unit: Unit;
  fast: boolean; // fast mover: stays on the menu in Rush Mode
  emoji: string;
}

export interface Shop {
  slug: string;
  name: string;
  area: string;
  city: string;
  region: string;
  shopType: "sweets" | "bakery";
  plan: "pilot" | "standard";
  ownerName: string;
  ownerLang: string; // language the owner reads orders in
  closesAt: number; // hour, IST
  catalog: CatalogItem[];
}

const sweets: CatalogItem[] = [
  { id: "kaju-katli", name: "Kaju Katli", aliases: ["kaju katli", "kaju barfi", "काजू कतली", "ಕಾಜು ಕಟ್ಲಿ", "காஜு கத்லி"], price: 1100, unit: "kg", fast: true, emoji: "💠" },
  { id: "motichoor-ladoo", name: "Motichoor Ladoo", aliases: ["motichoor ladoo", "boondi ladoo", "laddu", "मोतीचूर लड्डू", "ಲಡ್ಡು"], price: 520, unit: "kg", fast: true, emoji: "🟠" },
  { id: "mysore-pak", name: "Mysore Pak", aliases: ["mysore pak", "mysore paak", "ಮೈಸೂರ್ ಪಾಕ್", "மைசூர் பாக்"], price: 640, unit: "kg", fast: true, emoji: "🟨" },
  { id: "soan-papdi", name: "Soan Papdi", aliases: ["soan papdi", "son papdi", "सोन पापड़ी"], price: 380, unit: "kg", fast: false, emoji: "🧈" },
  { id: "gulab-jamun", name: "Gulab Jamun", aliases: ["gulab jamun", "jamun", "गुलाब जामुन", "ಜಾಮೂನ್"], price: 25, unit: "pc", fast: true, emoji: "🟤" },
  { id: "rasgulla", name: "Rasgulla", aliases: ["rasgulla", "rosogolla", "रसगुल्ला", "রসগোল্লা"], price: 30, unit: "pc", fast: false, emoji: "⚪" },
  { id: "besan-ladoo", name: "Besan Ladoo", aliases: ["besan ladoo", "besan laddu", "बेसन लड्डू"], price: 560, unit: "kg", fast: false, emoji: "🟡" },
  { id: "pori-urundai", name: "Pori Urundai", aliases: ["pori urundai", "puffed rice balls", "பொரி உருண்டை"], price: 240, unit: "kg", fast: false, emoji: "🍙" },
  { id: "jalebi", name: "Jalebi", aliases: ["jalebi", "jilebi", "जलेबी", "ಜಿಲೇಬಿ"], price: 400, unit: "kg", fast: false, emoji: "🌀" },
  { id: "mixture", name: "Masala Mixture", aliases: ["mixture", "namkeen", "khara", "नमकीन", "ಖಾರ"], price: 360, unit: "kg", fast: true, emoji: "🥜" },
  { id: "dry-fruit-box", name: "Dry Fruit Box", aliases: ["dry fruit box", "dry fruits", "ड्राई फ्रूट"], price: 850, unit: "box", fast: false, emoji: "🌰" },
  { id: "gift-box", name: "Festive Gift Box (500g assorted)", aliases: ["gift box", "sweet box", "mithai box", "dabba", "डिब्बा", "ಬಾಕ್ಸ್"], price: 450, unit: "box", fast: true, emoji: "🎁" },
];

const bakery: CatalogItem[] = [
  { id: "plum-cake", name: "Rum Plum Cake", aliases: ["plum cake", "rum cake", "fruit cake", "प्लम केक", "പ്ലം കേക്ക്"], price: 700, unit: "kg", fast: true, emoji: "🍰" },
  { id: "rose-cookies", name: "Rose Cookies (Achappam)", aliases: ["rose cookies", "achappam", "അച്ചപ്പം"], price: 380, unit: "kg", fast: true, emoji: "🌸" },
  { id: "kulkuls", name: "Kulkuls", aliases: ["kulkul", "kulkuls", "kalkal"], price: 320, unit: "kg", fast: false, emoji: "🐚" },
  { id: "marzipan", name: "Cashew Marzipan", aliases: ["marzipan", "cashew marzipan"], price: 30, unit: "pc", fast: false, emoji: "🍬" },
  { id: "cupcakes", name: "Christmas Cupcakes", aliases: ["cupcake", "cupcakes", "muffin"], price: 60, unit: "pc", fast: true, emoji: "🧁" },
  { id: "stollen", name: "Stollen Loaf", aliases: ["stollen"], price: 550, unit: "box", fast: false, emoji: "🍞" },
  { id: "gift-box", name: "Christmas Hamper Box", aliases: ["gift box", "hamper", "box"], price: 750, unit: "box", fast: true, emoji: "🎁" },
];

export const SHOPS: Shop[] = [
  {
    slug: "annapurna-sweets",
    name: "Annapurna Sweets",
    area: "Jayanagar 4th Block",
    city: "Bengaluru",
    region: "karnataka",
    shopType: "sweets",
    plan: "pilot",
    ownerName: "Manjunath",
    ownerLang: "kn-IN",
    closesAt: 22,
    catalog: sweets,
  },
  {
    slug: "meenakshi-sweets",
    name: "Meenakshi Sweets",
    area: "T. Nagar",
    city: "Chennai",
    region: "tamil_nadu",
    shopType: "sweets",
    plan: "standard",
    ownerName: "Lakshmi",
    ownerLang: "ta-IN",
    closesAt: 22,
    catalog: sweets,
  },
  {
    slug: "rosies-bakes",
    name: "Rosie's Home Bakes",
    area: "Fraser Town",
    city: "Bengaluru",
    region: "karnataka",
    shopType: "bakery",
    plan: "standard",
    ownerName: "Rosie",
    ownerLang: "ml-IN",
    closesAt: 21,
    catalog: bakery,
  },
];

export function getShop(slug: string): Shop | undefined {
  return SHOPS.find((s) => s.slug === slug);
}

export function shopTraits(shop: Shop) {
  return { city: shop.city, region: shop.region, shop_type: shop.shopType, plan: shop.plan };
}

export const LANGS: Record<string, { label: string; native: string; tts: boolean }> = {
  "hi-IN": { label: "Hindi", native: "हिन्दी", tts: true },
  "kn-IN": { label: "Kannada", native: "ಕನ್ನಡ", tts: true },
  "ta-IN": { label: "Tamil", native: "தமிழ்", tts: true },
  "te-IN": { label: "Telugu", native: "తెలుగు", tts: true },
  "ml-IN": { label: "Malayalam", native: "മലയാളം", tts: true },
  "bn-IN": { label: "Bengali", native: "বাংলা", tts: true },
  "mr-IN": { label: "Marathi", native: "मराठी", tts: true },
  "gu-IN": { label: "Gujarati", native: "ગુજરાતી", tts: true },
  "pa-IN": { label: "Punjabi", native: "ਪੰਜਾਬੀ", tts: true },
  "od-IN": { label: "Odia", native: "ଓଡ଼ିଆ", tts: true },
  "en-IN": { label: "English", native: "English", tts: true },
};

export function langLabel(code?: string | null) {
  if (!code) return "Unknown";
  return LANGS[code]?.label ?? code;
}

export function formatINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function formatQty(qty: number, unit: Unit) {
  if (unit === "kg") {
    if (qty < 1) return `${Math.round(qty * 1000)} g`;
    return `${+qty.toFixed(2)} kg`;
  }
  if (unit === "box") return `${qty} box${qty === 1 ? "" : "es"}`;
  return `${qty} pc`;
}
