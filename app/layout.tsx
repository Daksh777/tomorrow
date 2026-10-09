import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Schibsted_Grotesk } from "next/font/google";

// Schibsted Grotesk was drawn for a newspaper group: fits a forecast written like a weather report.
// Geist Mono carries the numbers (hours, distances, dates) so they line up.
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Tomorrow",
  description: "A nightly demand forecast for your café, written like a weather report.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#f6f4ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans min-h-dvh">
        <div className="mx-auto max-w-md px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+5rem)]">{children}</div>
      </body>
    </html>
  );
}
