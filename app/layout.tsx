import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Tomorrow",
  description: "A nightly demand forecast for your café, written like a weather report.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#14181f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen">
        <div className="mx-auto max-w-md px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
