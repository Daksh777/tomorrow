# Tomorrow

**A nightly demand forecast for independent cafés, restaurants, bars and shops, written like a weather report.**

Every evening the owner gets one card: how busy tomorrow will be, why, and the two things to do about it. No POS, no sales history, no sign-up. Setup is picking your business on Google Maps.

Built for the **SerpApi India Hackathon 2026**, track: Commerce & Market Intelligence.

> **Disclosure:** this project is new, built for the hackathon, and was built with Claude Code.

---

## Two cafés, same night

Saturday 10 Oct 2026: Bengaluru FC host SC Delhi (ISL) at Sree Kanteerava Stadium, 5 pm. Both cards are built from live SerpApi responses.

| Third Wave Coffee, Church St · 1.5 km from the stadium | Blue Tokai, Indiranagar · about 5 km away |
| --- | --- |
| ![Third Wave card](docs/third-wave-sat-oct-10.png) | ![Blue Tokai card](docs/blue-tokai-sat-oct-10.png) |

Third Wave gets a stadium pin and reads **busier** through the afternoon and evening. Blue Tokai sees the same match only as a TV match (people stay home), so its day stays **usual**. Same city, same night, different answer: the forecast is about *your* place, not a city feed.

---

## How it works

1. **Learn your usual week.** Google's popular times for your business (or, if it has none, the three nearest places like it) give the curve of a normal day, hour by hour.
2. **Find what's different tomorrow.** Six SerpApi engines and a few free sources look for what moves *this* place: a match at the stadium down the road, an event nearby, rain, a bandh in the news, hotel prices jumping, a festival your state actually keeps, payday week.
3. **Turn it into a card.** Each reason becomes a pin with its source and distance. The forecast is the usual curve times every pin's effect, drawn as a band that is wider where we're less sure, and ends with two actions for prep and staffing.
4. **Get better every morning.** One tap ("quieter / as expected / busier") retrains the weights for that place. Google's live busyness readings score every forecast, so the app knows how often it's right.

---

## What the owner sees

| | |
| --- | --- |
| **Evening card** | One-line headline, usual day vs tomorrow's band, pins you can open for the source, two actions. In English, Hindi, Kannada, Tamil or Bengali. |
| **Your numbers** | "About 900 covers on a usual day" turns +20% into "about 180 more covers". Counts orders, bills, customers or covers for the whole day, never one item. |
| **Morning tap** | "How was yesterday?" One tap retrains that place's weights and shows what moved. |
| **Today so far** | Last night's forecast for today with Google's live readings as dots: in range or out. |
| **How we did this week** | What the card said, what the owner said, and how many live readings fell inside the band. |
| **Your plans** | A quiz night, an offer, a big booking: the owner adds it and it becomes a pin. |
| **What moves your place** | Every signal seen so far, how strong it is now against our first guess, and where that came from. |
| **Week strip** | Seven days ahead, one word per part of the day. |
| **Send to staff** | WhatsApp message or a 1000×1000 card image, plus an evening push notification. |
| **Works anywhere** | Installable, dark mode, the last card opens offline. |

---

## Built on SerpApi

| Engine | What we ask | Why |
| --- | --- | --- |
| `google_maps` (place) | Popular times, live busyness, review count | The usual week; the live score is the ground truth every forecast is scored against |
| `google_maps` (search) | Stadiums, colleges, malls and venues nearby; same-type places' hours | Anchors for matches and events; a nearby rival closed tomorrow sends you its crowd |
| `google` | `events this week` in the city; `weather tomorrow` | Local events (each venue located for distance and size); hourly rain chance and heat |
| `google_sports` | League fixtures (ICC, ISL) for the next 8 days | Stadium matches pull crowds in; TV matches keep people home |
| `google_news` | `<city> road closure OR strike OR bandh` | Disruptions, filtered to the last 48 hours and to the right day |
| `google_hotels` | Tomorrow's prices vs the same weekday in two weeks | A 15%+ jump means visitors arriving, often before any listing |
| `google_trends` | Festival search interest by state | How widely a festival is actually kept where you are (Navratri in Delhi: 92 vs a median state of 31) |

Every call is cached at the widest level that's still correct (per city, league or place), logged with the place that caused it, and checked against SerpApi's remaining quota at `GET /api/usage`.

Free sources fill the gaps: Open-Meteo (rain in millimetres, feels-like heat, PM2.5, timezone) and `date-holidays`.

<details>
<summary><b>Notes from real SerpApi responses</b></summary>

- `events in <city>` returns no `events_results`; `events this week` does. The events block also comes and goes between identical requests, so the fetcher tries a second phrasing and never caches an empty result. `google_events` is deprecated and blocked in `lib/serp.ts`.
- `location` must be SerpApi's canonical name ("London,England,United Kingdom"); a bare "London" returns UK-wide events. `lib/location.ts` resolves it with the free Locations API.
- `google_sports` takes `moa`/`mob` as ISO8601 UTC strings, not epoch seconds. `sp=cr` works for ISL, `ft` or `cr` for ICC; both are tried. Venues come back as names without coordinates, so a stadium match is recognised by matching the venue name to a stadium anchor.
- TV-match pins only count when a team name contains the place's country or city, so a qualifier between two foreign sides moves nothing.
- The live score sits on the `current: true` point inside `popular_times.graph_results`; there is no top-level `live_busyness_score`.
- News headlines are dropped unless under 48 hours old, and when the title names a different day ("on Thursday", "tomorrow" read from the publish date): stories get republished. City-wide words (bandh, curfew) get the full effect, a disruption near you 70%, a protest elsewhere in the city 35%.
- The weather answer box gives the chance of rain but no amount, so Open-Meteo's hourly millimetres are merged in: light (under 1 mm/h, 0.6×), plain, or heavy (4 mm/h and up, 1.5×), plus an "after the rain" pin when rain stops in the daytime.

Raw responses are in `fixtures/`.
</details>

---

## India first

| Signal | What it does |
| --- | --- |
| **Festival calendar** | Navratri, Garba, Durga Puja, Dussehra, Karva Chauth, Dhanteras, Diwali, Chhath, Christmas, New Year's Eve, Pitru Paksha. Effects differ by business type and fire by state (Durga Puja in the east, Garba in Gujarat and Maharashtra), scaled by how widely each is kept, measured with Google Trends. |
| **Payday** | Salaried India is paid around the 1st to 7th; office areas respond more than residential ones. |
| **Air quality** | PM2.5 mapped to CPCB categories cuts street footfall (a Delhi study saw up to 33% less in Connaught Place) and lifts delivery kitchens. |
| **Drinking culture** | Pub cities give bars bigger match and payday boosts; dry states drop dry-day and abstinence effects. |
| **Dry days, holidays, exam season** | National dry days, holidays the library misses (Dussehra, Christmas), board-exam windows. |
| **Five languages** | Every sentence has a template in each language, so the card works with no model key; an LLM only polishes it and must keep every number. |

Every magnitude is a starting guess in `config/effects.json` and `config/india-calendar.json`, marked as reported or assumed. The morning tap tunes them per place.

---

## The model

Rules, not ML, so every number on the card can be explained.

```
F(h) = B(h) × Π (1 + wᵢ · eᵢ(h))
```

- **B(h)** is the usual curve for tomorrow's weekday, corrected by how this place has actually run against it in Google's live readings.
- **eᵢ(h)** is each signal's effect for this kind of business, scaled by distance (to zero at your radius) and by venue size.
- **wᵢ** is how much this place trusts each signal. It starts from what places like it have learned and moves with every morning tap.

<details>
<summary><b>Details: learning, the band, the usual-curve correction</b></summary>

- **Learning:** `w ← w + 0.2 × outcome × sign(e) × |e| / max|e|`, clamped to 0..2. Each signal is credited by its share of the day's biggest effect, so a small payday nudge isn't blamed like a stadium match. `outcome` is the tap (−1, 0, +1), or the measured miss from Google's live readings (a 50% miss counts as a full tap) when it agrees with the tap. "Tuned to your place" after 7 taps.
- **Pooled start:** a new place starts from places with the same type in the same city: `1 + (mean − 1) × m/(m+3)`.
- **Buckets:** below −15% quieter, to +15% usual, to +40% busier, above that much busier. A per-hour cap of 0.3× to 2.5× stops stacked signals running away.
- **Band:** wider when opposing signals overlap and for days further out (+3% a day), narrower with taps. Once live readings have scored past forecasts, it moves towards the width that would have held 80% of them (`n/(n+20)` of the way).
- **Usual-curve correction:** popular times are a months-long average. Live readings in ordinary hours give `live / usual` per part of the day, averaged in log space, shrunk towards no change (`n/(n+6)`, then per weekday `n/(n+4)`), clamped to 0.6–1.5, and only used after 3 readings.
- **Copy:** prep and staffing actions follow the net change over the pin's hours, so pins that cancel out read "prep as usual".
- `npm run backtest` scores every stored forecast against live readings and taps.
</details>

---

## Try it

The home page lists eight demo restaurants: MTR, Vidyarthi Bhavan and Toit in Bengaluru, Karim's and Saravana Bhavan in Delhi, Leopold Cafe in Mumbai, Peter Cat in Kolkata and Murugan Idli Shop in Chennai. Their Google data and every pin are real. The owners' answers for the past week are scripted and run through the same learning as a real tap, and each card says so. Yesterday is left unanswered, so you can tap it yourself.

Or search for any business on Google Maps and set it up in about 20 seconds.

---

## Run it yourself

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
```

1. **Supabase:** create a project and run `supabase/schema.sql` in the SQL editor ("Run and enable RLS"). It is safe to re-run. Tables have RLS on with no policies; only the server's secret key reads them.
2. **Keys in `.env.local`:** `SERPAPI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and optionally `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` (without either, the templates are used). For the evening push: `npx web-push generate-vapid-keys`, then `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
3. **Leagues:** `LEAGUE_KGMIDS=ICC:/m/021q23,ISL:/m/0ynr_sq`.
4. **Deploy to Vercel.** `vercel.json` runs `/api/cron` at 18:00 IST (builds tomorrow's cards and pushes them) and `/api/observe` at 20:00 IST (a live reading for every place). Test with `/api/cron?force=1`.

| Command | What it does |
| --- | --- |
| `npm test` | Forecast maths, learning rule, parsers, and an offline replay of a real day |
| `npm run typecheck` | TypeScript |
| `npm run seed-demo` | Set up or reset the demo restaurants (`-- --unscript` removes the scripted answers, `-- --remove` the places) |
| `npm run backtest` | Score stored forecasts against live readings and taps |
| `npm run fixtures -- "<business>"` | Save raw responses from every endpoint for a real place |

**Stack:** Next.js 15, React 19, Tailwind, Supabase, Vercel Cron, Web Push, Vitest.

<details>
<summary><b>Engineering notes</b></summary>

- All signal sources are fetched in parallel; pins still come out in a fixed order. Concurrent requests for the same cached key share one fetch.
- The week strip is cached per place for 3 hours and dropped whenever weights, taps, settings or plans change.
- The nightly cron prunes cached signals older than 60 days and the call log older than 90. Forecasts, taps and live readings are kept: they are the training data.
- No accounts. The phone that sets a place up gets a random edit key (the server keeps only its SHA-256 hash). Anyone with the link can read a card; only that phone can retrain it.
</details>

---

## Known limits

- Run live in Bengaluru, Delhi, Mumbai, Kolkata, Chennai and London so far.
- Effect sizes are hand-set starting guesses; the morning tap tunes them per place.
- Live readings exist only when Google shows a live score (busy enough places, open hours). On Vercel Hobby there is one scheduled reading a day, plus one each time a card is opened.
- Google returns about 10 events per query, so a busy day can have events we never see.
- Not modelled yet: college fests, state and election dry days (only via news), IPL (no verified league id until the season).
- The Kannada, Tamil and Bengali templates should be checked by a native speaker.
- Not built: WhatsApp Business API delivery, accounts, choosing which part of the day on the morning tap.
