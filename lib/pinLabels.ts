import { PHRASES } from "./phrases";
import type { Language } from "./types";

/**
 * Pin names are built in English where the signal is made. For the other card languages, the common
 * ones are translated here on display; event, match and holiday names stay as they are (proper names).
 * Kannada, Tamil and Bengali should be read by a native speaker.
 */
type L = Exclude<Language, "en">;
const T = (hi: string, kn: string, ta: string, bn: string): Record<L, string> => ({ hi, kn, ta, bn });

const EXACT: Record<string, Record<L, string>> = {
  "Payday week": T("सैलरी वाला हफ़्ता", "ಸಂಬಳದ ವಾರ", "சம்பள வாரம்", "বেতনের সপ্তাহ"),
  "Month-end budgets": T("महीने का आख़िर, जेब तंग", "ತಿಂಗಳ ಕೊನೆ, ಖರ್ಚು ಕಡಿಮೆ", "மாதக் கடைசி, செலவு குறைவு", "মাসের শেষ, খরচ কম"),
  "Disruption near you": T("आपके पास रुकावट", "ನಿಮ್ಮ ಹತ್ತಿರ ಅಡಚಣೆ", "உங்கள் அருகில் இடையூறு", "আপনার কাছে গোলমাল"),
  "City-wide disruption": T("पूरे शहर में रुकावट", "ಇಡೀ ನಗರದಲ್ಲಿ ಅಡಚಣೆ", "நகரம் முழுவதும் இடையூறு", "গোটা শহরে গোলমাল"),
  "Protest in the city": T("शहर में प्रदर्शन", "ನಗರದಲ್ಲಿ ಪ್ರತಿಭಟನೆ", "நகரில் போராட்டம்", "শহরে বিক্ষোভ"),
  "Long weekend": T("लंबा वीकेंड", "ದೀರ್ಘ ವಾರಾಂತ್ಯ", "நீண்ட வார இறுதி", "লম্বা সপ্তাহান্ত"),
  "Bridge day": T("दो छुट्टियों के बीच का दिन", "ಎರಡು ರಜೆಗಳ ನಡುವಿನ ದಿನ", "இரு விடுமுறைகளுக்கு இடைப்பட்ட நாள்", "দুই ছুটির মাঝের দিন"),
  "Dry day: no alcohol served": T("ड्राई डे: शराब बंद", "ಡ್ರೈ ಡೇ: ಮದ್ಯ ಇಲ್ಲ", "டிரை டே: மது இல்லை", "ড্রাই ডে: মদ বন্ধ"),
  Navratri: T("नवरात्रि", "ನವರಾತ್ರಿ", "நவராத்திரி", "নবরাত্রি"),
  "Garba nights": T("गरबा की रातें", "ಗರ್ಬಾ ರಾತ್ರಿಗಳು", "கர்பா இரவுகள்", "গরবার রাত"),
  "Durga Puja": T("दुर्गा पूजा", "ದುರ್ಗಾ ಪೂಜೆ", "துர்கா பூஜை", "দুর্গাপূজা"),
  Dussehra: T("दशहरा", "ದಸರಾ", "தசரா", "দশেরা"),
  "Pitru Paksha": T("पितृ पक्ष", "ಪಿತೃ ಪಕ್ಷ", "பித்ரு பட்சம்", "পিতৃপক্ষ"),
  "Karva Chauth evening": T("करवा चौथ की शाम", "ಕರ್ವಾ ಚೌತ್ ಸಂಜೆ", "கர்வா சௌத் மாலை", "করবা চৌথের সন্ধ্যা"),
  "Dhanteras and Diwali shopping": T("धनतेरस और दिवाली की ख़रीदारी", "ಧನತ್ರಯೋದಶಿ ಮತ್ತು ದೀಪಾವಳಿ ಖರೀದಿ", "தந்தேரஸ், தீபாவளி ஷாப்பிங்", "ধনতেরস ও দীপাবলির কেনাকাটা"),
  "Diwali night": T("दिवाली की रात", "ದೀಪಾವಳಿ ರಾತ್ರಿ", "தீபாவளி இரவு", "দীপাবলির রাত"),
  "Govardhan Puja and Bhai Dooj": T("गोवर्धन पूजा और भाई दूज", "ಗೋವರ್ಧನ ಪೂಜೆ ಮತ್ತು ಭಾಯಿ ದೂಜ್", "கோவர்தன பூஜை, பாய் தூஜ்", "গোবর্ধন পূজা ও ভাইফোঁটা"),
  "Chhath Puja": T("छठ पूजा", "ಛಠ್ ಪೂಜೆ", "சத் பூஜை", "ছট পূজা"),
  "Guru Nanak Jayanti": T("गुरु नानक जयंती", "ಗುರು ನಾನಕ್ ಜಯಂತಿ", "குரு நானக் ஜெயந்தி", "গুরু নানক জয়ন্তী"),
  "Christmas Eve": T("क्रिसमस की पूर्व संध्या", "ಕ್ರಿಸ್‌ಮಸ್ ಹಿಂದಿನ ಸಂಜೆ", "கிறிஸ்துமஸ் முன்னிரவு", "বড়দিনের আগের সন্ধ্যা"),
  Christmas: T("क्रिसमस", "ಕ್ರಿಸ್‌ಮಸ್", "கிறிஸ்துமஸ்", "বড়দিন"),
  "New Year's Eve": T("नए साल की पूर्व संध्या", "ಹೊಸ ವರ್ಷದ ಹಿಂದಿನ ರಾತ್ರಿ", "புத்தாண்டு முன்னிரவு", "নববর্ষের আগের রাত"),
  Lohri: T("लोहड़ी", "ಲೋಹ್ರಿ", "லோரி", "লোহরি"),
  "Makar Sankranti": T("मकर संक्रांति", "ಮಕರ ಸಂಕ್ರಾಂತಿ", "மகர சங்கராந்தி", "মকর সংক্রান্তি"),
  Pongal: T("पोंगल", "ಪೊಂಗಲ್", "பொங்கல்", "পোঙ্গল"),
  "Ganesh Chaturthi": T("गणेश चतुर्थी", "ಗಣೇಶ ಚತುರ್ಥಿ", "விநாயகர் சதுர்த்தி", "গণেশ চতুর্থী"),
  Thiruvonam: T("तिरुवोणम", "ತಿರುವೋಣಂ", "திருவோணம்", "তিরুভোনাম"),
};

/** "<words> 5 pm to 7 pm": the words to translate, with the clock times put back in the language's own form. */
const TIMED: Record<string, Record<L, string>> = {
  "Light rain": T("हल्की बारिश", "ಸಣ್ಣ ಮಳೆ", "லேசான மழை", "হালকা বৃষ্টি"),
  Rain: T("बारिश", "ಮಳೆ", "மழை", "বৃষ্টি"),
  "Heavy rain": T("तेज़ बारिश", "ಜೋರು ಮಳೆ", "கனமழை", "ভারী বৃষ্টি"),
  "After the rain,": T("बारिश के बाद", "ಮಳೆ ನಿಂತ ಮೇಲೆ", "மழை நின்ற பிறகு", "বৃষ্টি থামার পর"),
};

const hourOf = (h: string, min: string | undefined, ap: string) => (Number(h) % 12) + (ap === "pm" ? 12 : 0) + (min ? Number(min) / 60 : 0);

export function pinLabel(label: string, lang: Language | null | undefined): string {
  if (!lang || lang === "en") return label;
  const exact = EXACT[label]?.[lang];
  if (exact) return exact;
  const ph = PHRASES[lang];
  const m = label.match(/^(.*?),? ?(\d{1,2})(?::(\d{2}))? (am|pm) to (\d{1,2})(?::(\d{2}))? (am|pm)$/);
  if (m) {
    const words = m[1].trim();
    const window = ph.window(Math.round(hourOf(m[2], m[3], m[4])), Math.round(hourOf(m[5], m[6], m[7])));
    const feels = words.match(/^Feels like (\d+)°C$/);
    const head = TIMED[words]?.[lang] ?? TIMED[`${words},`]?.[lang] ?? (feels ? { hi: `${feels[1]}°C जैसी गर्मी`, kn: `${feels[1]}°C ನಷ್ಟು ಸೆಖೆ`, ta: `${feels[1]}°C போன்ற வெப்பம்`, bn: `${feels[1]}°C-এর মতো গরম` }[lang] : words);
    return `${head}, ${window}`;
  }
  return label;
}
