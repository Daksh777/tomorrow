import type { Language } from "./types";

/** Languages the headline and actions can be written in, by their own names. */
export const LANGUAGES: Record<Language, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  ta: "தமிழ்",
  bn: "বাংলা",
};
export const LANGUAGE_NAME: Record<Language, string> = { en: "English", hi: "Hindi", kn: "Kannada", ta: "Tamil", bn: "Bengali" };

/**
 * What the owner counts in a usual day. A total, never one item: the forecast knows how much busier,
 * not which items a crowd buys, so it scales the whole day's count.
 */
export const UNITS = ["orders", "bills", "customers", "covers"] as const;
export type Unit = (typeof UNITS)[number];
export const asUnit = (u: unknown): Unit => ((UNITS as readonly string[]).includes(String(u)) ? (u as Unit) : "orders");
