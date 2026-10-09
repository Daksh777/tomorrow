import { fmtHour } from "./time";
import type { DayPart, Language, Level, Weekday } from "./types";

/**
 * The card's sentences in every language, as templates. These are what the card says when no language
 * model is available (no key, quota used up, an error); with a model, it only polishes them.
 * Western digits throughout, so counts and times match the curve. Hindi was written with care;
 * Kannada, Tamil and Bengali use plain everyday wording and should be read by a native speaker.
 */
export interface Phrasebook {
  day: Record<Weekday, string>;
  /** "7 pm" in this language */
  hour: (h: number) => string;
  /** "from 11 am to 3 pm" */
  window: (a: number, b: number) => string;
  unit: (u: string) => string;
  usualDay: (day: string) => string;
  levelHeadline: (lvl: Level, day: string, part: DayPart) => string;
  prepMore: (pct: number, before: number | null) => string;
  prepMoreUnits: (n: number, unit: string, pct: number, before: number | null) => string;
  prepLess: (pct: number, win: [number, number] | null) => string;
  prepLessUnits: (n: number, unit: string, pct: number, win: [number, number] | null) => string;
  prepUsual: (day: string) => string;
  staffMore: (win: [number, number] | null) => string;
  staffLess: (win: [number, number] | null) => string;
  staffUsual: string;
}

/** Clock words by time of day, for languages that say "evening 6" rather than "6 pm". */
const clock = (words: { morning: string; noon: string; evening: string; night: string }, suffix: (h12: number) => string) => (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const w = hh >= 5 && hh < 12 ? words.morning : hh >= 12 && hh < 16 ? words.noon : hh >= 16 && hh < 20 ? words.evening : words.night;
  return `${w} ${suffix(h12)}`;
};

const EN_PART: Record<DayPart, string> = { morning: "in the morning", lunch: "at lunch", afternoon: "in the afternoon", evening: "after 6 pm", late: "late at night" };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const en: Phrasebook = {
  day: { sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday" },
  hour: fmtHour,
  window: (a, b) => `${fmtHour(a)} to ${fmtHour(b)}`,
  unit: (u) => u,
  usualDay: (d) => `A usual ${d}.`,
  levelHeadline: (lvl, d, p) => `${cap(lvl)} than a usual ${d} ${EN_PART[p]}.`,
  prepMore: (pct, b) => `Prep ${pct}% more of your fast sellers${b === null ? "" : ` before ${fmtHour(b)}`}.`,
  prepMoreUnits: (n, u, pct, b) => `Prep about ${n} more ${u} (${pct}% more)${b === null ? "" : ` before ${fmtHour(b)}`}.`,
  prepLess: (pct, w) => `Prep ${pct}% less ${w ? `for ${en.window(...w)}` : "all day"}.`,
  prepLessUnits: (n, u, pct, w) => `Prep about ${n} fewer ${u} (${pct}% less) ${w ? `for ${en.window(...w)}` : "all day"}.`,
  prepUsual: (d) => `Prep as you usually do on a ${d}.`,
  staffMore: (w) => (w ? `Keep one more person on ${en.window(...w)}.` : "Keep one more person on for your busiest hours."),
  staffLess: (w) => (w ? `Quiet from ${en.window(...w)}: one person can come in later or leave early.` : "Quiet all day: you can run with one person fewer."),
  staffUsual: "Keep your usual roster.",
};

const hiHour = clock({ morning: "सुबह", noon: "दोपहर", evening: "शाम", night: "रात" }, (h) => `${h} बजे`);
const HI_LEVEL: Record<Level, string> = { quieter: "कम भीड़", usual: "आम भीड़", busier: "ज़्यादा भीड़", "much busier": "बहुत ज़्यादा भीड़" };
const HI_PART: Record<DayPart, string> = { morning: "सुबह", lunch: "दोपहर के खाने के समय", afternoon: "दोपहर में", evening: "शाम 6 बजे के बाद", late: "देर रात" };
const HI_UNIT: Record<string, string> = { orders: "ऑर्डर", bills: "बिल", customers: "ग्राहक", covers: "कवर" };
const hi: Phrasebook = {
  day: { sunday: "रविवार", monday: "सोमवार", tuesday: "मंगलवार", wednesday: "बुधवार", thursday: "गुरुवार", friday: "शुक्रवार", saturday: "शनिवार" },
  hour: hiHour,
  window: (a, b) => `${hiHour(a)} से ${hiHour(b)} तक`,
  unit: (u) => HI_UNIT[u] ?? u,
  usualDay: (d) => `आम ${d} जैसा दिन।`,
  levelHeadline: (lvl, d, p) => `${d} को ${HI_PART[p]} आम दिनों से ${HI_LEVEL[lvl]}।`,
  prepMore: (pct, b) => `${b === null ? "" : `${hiHour(b)} से पहले `}जल्दी बिकने वाली चीज़ें ${pct}% ज़्यादा तैयार रखें।`,
  prepMoreUnits: (n, u, pct, b) => `${b === null ? "" : `${hiHour(b)} से पहले `}लगभग ${n} ${u} ज़्यादा (${pct}% ज़्यादा) की तैयारी रखें।`,
  prepLess: (pct, w) => `${w ? hi.window(...w) : "पूरे दिन"} ${pct}% कम तैयारी करें।`,
  prepLessUnits: (n, u, pct, w) => `${w ? hi.window(...w) : "पूरे दिन"} लगभग ${n} ${u} कम (${pct}% कम) की तैयारी करें।`,
  prepUsual: (d) => `हर ${d} की तरह तैयारी करें।`,
  staffMore: (w) => (w ? `${hi.window(...w)} एक व्यक्ति ज़्यादा रखें।` : "सबसे व्यस्त घंटों में एक व्यक्ति ज़्यादा रखें।"),
  staffLess: (w) => (w ? `${hi.window(...w)} भीड़ कम रहेगी: एक व्यक्ति देर से आ सकता है या जल्दी जा सकता है।` : "पूरे दिन भीड़ कम: एक व्यक्ति कम से काम चल जाएगा।"),
  staffUsual: "स्टाफ़ हमेशा की तरह रखें।",
};

const knHour = clock({ morning: "ಬೆಳಿಗ್ಗೆ", noon: "ಮಧ್ಯಾಹ್ನ", evening: "ಸಂಜೆ", night: "ರಾತ್ರಿ" }, (h) => `${h} ಗಂಟೆ`);
const KN_LEVEL: Record<Level, string> = { quieter: "ಕಡಿಮೆ ಜನ", usual: "ಎಂದಿನಷ್ಟು ಜನ", busier: "ಹೆಚ್ಚು ಜನ", "much busier": "ತುಂಬಾ ಹೆಚ್ಚು ಜನ" };
const KN_PART: Record<DayPart, string> = { morning: "ಬೆಳಿಗ್ಗೆ", lunch: "ಊಟದ ಸಮಯದಲ್ಲಿ", afternoon: "ಮಧ್ಯಾಹ್ನ", evening: "ಸಂಜೆ 6 ಗಂಟೆಯ ನಂತರ", late: "ತಡರಾತ್ರಿ" };
const KN_UNIT: Record<string, string> = { orders: "ಆರ್ಡರ್", bills: "ಬಿಲ್", customers: "ಗ್ರಾಹಕರು", covers: "ಕವರ್" };
const kn: Phrasebook = {
  day: { sunday: "ಭಾನುವಾರ", monday: "ಸೋಮವಾರ", tuesday: "ಮಂಗಳವಾರ", wednesday: "ಬುಧವಾರ", thursday: "ಗುರುವಾರ", friday: "ಶುಕ್ರವಾರ", saturday: "ಶನಿವಾರ" },
  hour: knHour,
  window: (a, b) => `${knHour(a)}ಯಿಂದ ${knHour(b)}ಯವರೆಗೆ`,
  unit: (u) => KN_UNIT[u] ?? u,
  usualDay: (d) => `ಎಂದಿನ ${d}ದಂತೆ ಇರುತ್ತದೆ.`,
  levelHeadline: (lvl, d, p) => `${d} ${KN_PART[p]} ಎಂದಿಗಿಂತ ${KN_LEVEL[lvl]}.`,
  prepMore: (pct, b) => `${b === null ? "" : `${knHour(b)}ಯ ಮೊದಲು `}ಬೇಗ ಮಾರಾಟವಾಗುವ ವಸ್ತುಗಳನ್ನು ${pct}% ಹೆಚ್ಚು ತಯಾರಿಸಿ.`,
  prepMoreUnits: (n, u, pct, b) => `${b === null ? "" : `${knHour(b)}ಯ ಮೊದಲು `}ಸುಮಾರು ${n} ${u} ಹೆಚ್ಚು (${pct}% ಹೆಚ್ಚು) ತಯಾರಿ ಮಾಡಿ.`,
  prepLess: (pct, w) => `${w ? kn.window(...w) : "ದಿನವಿಡೀ"} ${pct}% ಕಡಿಮೆ ತಯಾರಿಸಿ.`,
  prepLessUnits: (n, u, pct, w) => `${w ? kn.window(...w) : "ದಿನವಿಡೀ"} ಸುಮಾರು ${n} ${u} ಕಡಿಮೆ (${pct}% ಕಡಿಮೆ) ತಯಾರಿಸಿ.`,
  prepUsual: (d) => `ಎಂದಿನ ${d}ದಂತೆ ತಯಾರಿಸಿ.`,
  staffMore: (w) => (w ? `${kn.window(...w)} ಒಬ್ಬರನ್ನು ಹೆಚ್ಚು ಕೆಲಸಕ್ಕೆ ಇಡಿ.` : "ಹೆಚ್ಚು ಜನ ಇರುವ ಸಮಯದಲ್ಲಿ ಒಬ್ಬರನ್ನು ಹೆಚ್ಚು ಇಡಿ."),
  staffLess: (w) => (w ? `${kn.window(...w)} ಜನ ಕಡಿಮೆ: ಒಬ್ಬರು ತಡವಾಗಿ ಬರಬಹುದು ಅಥವಾ ಬೇಗ ಹೋಗಬಹುದು.` : "ದಿನವಿಡೀ ಜನ ಕಡಿಮೆ: ಒಬ್ಬರು ಕಡಿಮೆ ಇದ್ದರೂ ನಡೆಯುತ್ತದೆ."),
  staffUsual: "ಎಂದಿನಂತೆ ಸಿಬ್ಬಂದಿ ಸಾಕು.",
};

const taHour = clock({ morning: "காலை", noon: "மதியம்", evening: "மாலை", night: "இரவு" }, (h) => `${h} மணி`);
const TA_LEVEL: Record<Level, string> = { quieter: "கூட்டம் குறைவு", usual: "வழக்கமான கூட்டம்", busier: "கூட்டம் அதிகம்", "much busier": "கூட்டம் மிக அதிகம்" };
const TA_PART: Record<DayPart, string> = { morning: "காலை", lunch: "மதிய உணவு நேரத்தில்", afternoon: "மதியம்", evening: "மாலை 6 மணிக்குப் பிறகு", late: "இரவு தாமதமாக" };
const TA_UNIT: Record<string, string> = { orders: "ஆர்டர்கள்", bills: "பில்கள்", customers: "வாடிக்கையாளர்கள்", covers: "கவர்கள்" };
const ta: Phrasebook = {
  day: { sunday: "ஞாயிற்றுக்கிழமை", monday: "திங்கட்கிழமை", tuesday: "செவ்வாய்க்கிழமை", wednesday: "புதன்கிழமை", thursday: "வியாழக்கிழமை", friday: "வெள்ளிக்கிழமை", saturday: "சனிக்கிழமை" },
  hour: taHour,
  window: (a, b) => `${taHour(a)} முதல் ${taHour(b)} வரை`,
  unit: (u) => TA_UNIT[u] ?? u,
  usualDay: (d) => `வழக்கமான ${d} போலவே இருக்கும்.`,
  levelHeadline: (lvl, d, p) => `${d} ${TA_PART[p]} வழக்கத்தை விட ${TA_LEVEL[lvl]}.`,
  prepMore: (pct, b) => `${b === null ? "" : `${taHour(b)}க்கு முன் `}வேகமாக விற்கும் பொருட்களை ${pct}% அதிகமாக தயார் செய்யுங்கள்.`,
  prepMoreUnits: (n, u, pct, b) => `${b === null ? "" : `${taHour(b)}க்கு முன் `}சுமார் ${n} ${u} கூடுதலாக (${pct}% அதிகம்) தயார் செய்யுங்கள்.`,
  prepLess: (pct, w) => `${w ? ta.window(...w) : "நாள் முழுவதும்"} ${pct}% குறைவாக தயார் செய்யுங்கள்.`,
  prepLessUnits: (n, u, pct, w) => `${w ? ta.window(...w) : "நாள் முழுவதும்"} சுமார் ${n} ${u} குறைவாக (${pct}% குறைவு) தயார் செய்யுங்கள்.`,
  prepUsual: (d) => `வழக்கமான ${d} போலவே தயார் செய்யுங்கள்.`,
  staffMore: (w) => (w ? `${ta.window(...w)} ஒருவரை கூடுதலாக வேலைக்கு வையுங்கள்.` : "அதிக கூட்டமான நேரங்களில் ஒருவரை கூடுதலாக வையுங்கள்."),
  staffLess: (w) => (w ? `${ta.window(...w)} கூட்டம் குறைவு: ஒருவர் தாமதமாக வரலாம் அல்லது சீக்கிரம் போகலாம்.` : "நாள் முழுவதும் கூட்டம் குறைவு: ஒருவர் குறைவாகவே சமாளிக்கலாம்."),
  staffUsual: "வழக்கமான ஊழியர்களே போதும்.",
};

const bnHour = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const w = hh >= 5 && hh < 12 ? "সকাল" : hh >= 12 && hh < 16 ? "দুপুর" : hh >= 16 && hh < 18 ? "বিকেল" : hh >= 18 && hh < 20 ? "সন্ধ্যা" : "রাত";
  return `${w} ${h12}টা`;
};
const BN_LEVEL: Record<Level, string> = { quieter: "ভিড় কম", usual: "সাধারণ ভিড়", busier: "ভিড় বেশি", "much busier": "ভিড় অনেক বেশি" };
const BN_PART: Record<DayPart, string> = { morning: "সকালে", lunch: "দুপুরের খাবারের সময়", afternoon: "বিকেলে", evening: "সন্ধ্যা 6টার পরে", late: "গভীর রাতে" };
const BN_UNIT: Record<string, string> = { orders: "অর্ডার", bills: "বিল", customers: "গ্রাহক", covers: "কভার" };
const bn: Phrasebook = {
  day: { sunday: "রবিবার", monday: "সোমবার", tuesday: "মঙ্গলবার", wednesday: "বুধবার", thursday: "বৃহস্পতিবার", friday: "শুক্রবার", saturday: "শনিবার" },
  hour: bnHour,
  window: (a, b) => `${bnHour(a)} থেকে ${bnHour(b)}`,
  unit: (u) => BN_UNIT[u] ?? u,
  usualDay: (d) => `সাধারণ ${d}ের মতোই দিন।`,
  levelHeadline: (lvl, d, p) => `${d} ${BN_PART[p]} সাধারণ দিনের চেয়ে ${BN_LEVEL[lvl]}।`,
  prepMore: (pct, b) => `${b === null ? "" : `${bnHour(b)}র আগে `}বেশি বিক্রি হওয়া জিনিস ${pct}% বেশি তৈরি রাখুন।`,
  prepMoreUnits: (n, u, pct, b) => `${b === null ? "" : `${bnHour(b)}র আগে `}প্রায় ${n} ${u} বেশি (${pct}% বেশি) ধরে প্রস্তুতি নিন।`,
  prepLess: (pct, w) => `${w ? bn.window(...w) : "সারাদিন"} ${pct}% কম প্রস্তুতি নিন।`,
  prepLessUnits: (n, u, pct, w) => `${w ? bn.window(...w) : "সারাদিন"} প্রায় ${n} ${u} কম (${pct}% কম) ধরে প্রস্তুতি নিন।`,
  prepUsual: (d) => `সাধারণ ${d}ের মতোই প্রস্তুতি নিন।`,
  staffMore: (w) => (w ? `${bn.window(...w)} একজন বেশি লোক রাখুন।` : "সবচেয়ে ব্যস্ত সময়ে একজন বেশি লোক রাখুন।"),
  staffLess: (w) => (w ? `${bn.window(...w)} ভিড় কম: একজন দেরিতে আসতে পারেন বা আগে যেতে পারেন।` : "সারাদিন ভিড় কম: একজন কম লোকেই চলবে।"),
  staffUsual: "স্টাফ যেমন থাকে তেমনই রাখুন।",
};

export const PHRASES: Record<Language, Phrasebook> = { en, hi, kn, ta, bn };
