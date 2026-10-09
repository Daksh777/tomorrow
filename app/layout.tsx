import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Schibsted_Grotesk } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#101216" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const THEME_SCRIPT = `try{var t=localStorage.getItem("tomorrow.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint, so a dark choice never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans min-h-dvh">
        <RegisterSW />
        <div className="mx-auto max-w-md px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+5rem)]">{children}</div>
      </body>
    </html>
  );
}
