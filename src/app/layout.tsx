import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Fraunces({ variable: "--font-display-face", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Plus_Jakarta_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Bolo — voice orders for India's festive rush",
  description:
    "Customers speak their order in any Indian language. Your shop gets a clean, translated order board. Built with Sarvam AI, Flagsmith and NudgeBee.",
  openGraph: {
    title: "Bolo — just say your order",
    description: "Voice ordering in 11 Indian languages for neighbourhood sweet shops and home bakers.",
  },
};

export const viewport: Viewport = { themeColor: "#fbf6ec", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
