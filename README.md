# HybridCommute Agent

An intelligent commute optimization agent for hybrid workers. Combines real Google Maps traffic data, live weather forecasts, and public holiday calendars to recommend the best days and departure times for your office commute.

Built with React + Vite. AI powered by Claude (Anthropic).

---

## Features

- **Traffic analysis** — fetches traffic-aware travel times via Google Maps Distance Matrix API for exactly two slots per weekday: your morning departure (home → office) and evening return (office → home)
- **Weather forecasting** — pulls a 7-day forecast (condition, rain, wind, estimated commute impact in minutes) from Open-Meteo; auto-refreshes if data is >6 hours old
- **Holiday awareness** — fetches public holidays for the next 60 days from Google Calendar; holidays are matched against the specific upcoming date for each weekday, not just the weekday name, so future-month holidays don't incorrectly flag the entire week
- **AI recommendations** — Claude reasons over all three data sources and produces a combined commute score per day (traffic avg + weather impact), flags holidays, and suggests optimal days and departure times
- **Persistent history** — traffic readings accumulate over time in `localStorage`; more collections = more accurate averages

---

## API Integrations

### 1. Google Maps JavaScript SDK
- **Purpose:** geocoding addresses → lat/lng, fetching traffic-aware travel times
- **APIs required:** Maps JavaScript API, Geocoding API, Distance Matrix API
- **Auth:** API key (`VITE_GOOGLE_API_KEY` in `.env`)
- **Where it's called:** directly from the browser (CORS-safe via the JS SDK)
- **Country detection:** origin address `address_components` is parsed for the ISO country code, used to select the correct holiday calendar

### 2. Anthropic Claude API
- **Purpose:** AI chat — synthesizes traffic, weather, and holiday data into commute recommendations
- **Model:** `claude-sonnet-4-6`
- **Auth:** API key (`ANTHROPIC_API_KEY` in `.env`)
- **Where it's called:** React fetches `/anthropic/v1/messages`; the Vite dev server proxies this to `https://api.anthropic.com`, strips the `Origin`/`Referer` headers, and injects the key server-side — the key is never exposed to the browser
- **Production:** the Vite proxy is dev-only; a Netlify Function (`netlify/functions/chat.mjs`) serves the same path in production

### 3. Open-Meteo (Weather)
- **Purpose:** 7-day weather forecast — condition, precipitation, wind speed, and estimated extra commute time per day
- **API key:** none required — fully free and open
- **Where it's called:** directly from the browser
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Parameters:** `weathercode`, `precipitation_sum`, `windspeed_10m_max`, `precipitation_probability_max`
- **Refresh:** auto-refreshed in background if cached data is >6 hours old

### 4. Google Calendar API (Public Holidays)
- **Purpose:** fetches public holidays for the next 60 days; used to exclude holidays from commute recommendations and flag specific upcoming dates in the Data tab
- **APIs required:** Google Calendar API (enable separately in Google Cloud Console — same project as Maps)
- **Auth:** same API key as Google Maps (`VITE_GOOGLE_API_KEY`)
- **Where it's called:** directly from the browser
- **Holiday matching:** each weekday card computes its specific next occurrence date (`YYYY-MM-DD`) and checks for an exact match in the holiday list — prevents future-month holidays from incorrectly flagging recurring weekdays
- **Supported countries:** AU, BR, CA, DE, FR, GB, HK, IE, IN, JP, KR, MX, MY, NL, NZ, PH, SG, US, ZA (falls back to US if not listed)

---

## Data Collection

"Collect data now" in the Data tab runs three steps in sequence:

1. **Traffic** — for each weekday (Mon–Fri), fetches exactly **two** Distance Matrix calls:
   - Morning: home → office at your departure hour
   - Evening: office → home at your return hour (origin/destination swapped)
2. **Weather** — fetches 7-day Open-Meteo forecast for the origin coordinates
3. **Holidays** — refreshes the 60-day Google Calendar holiday list for your country

Each collection adds one reading per slot per day. Averages improve with repeated collections over time.

---

## Setup

### 1. Prerequisites

- Node.js 18+
- A Google Cloud project with the following APIs enabled:
  - Maps JavaScript API
  - Geocoding API
  - Distance Matrix API
  - **Google Calendar API** ← required for holiday detection
- An Anthropic API key

### 2. Environment variables

Create a `.env` file in the project root:

```env
VITE_GOOGLE_API_KEY=your_google_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Install and run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

---

## Usage

1. **Settings tab** — enter your home address, office address, required office days per week, morning departure hour (24h), and evening return hour (24h). Click "Save profile & geocode". This geocodes both addresses, auto-detects your country, and fetches upcoming public holidays.

2. **Data tab** — click "Collect data now". Collects traffic for morning departure and evening return only (10 API calls total for Mon–Fri), then fetches weather and refreshes holidays. Repeat periodically to build up historical averages.

3. **Chat tab** — ask for recommendations. Claude combines traffic history, weather forecast, and holidays into a per-day combined score table and suggests the best days and times to commute.

---

## Architecture

```
Local dev
Browser
├── Google Maps JS SDK    ──► Maps / Geocoding / Distance Matrix API  (direct, CORS-safe)
├── fetch /anthropic/...  ──► Vite dev proxy (strips Origin, injects key) ──► api.anthropic.com
├── fetch Open-Meteo      ──► api.open-meteo.com                           (direct, no key)
└── fetch Google Calendar ──► googleapis.com/calendar/v3                   (direct, API key)

Netlify (production)
Browser
├── Google Maps JS SDK    ──► Maps / Geocoding / Distance Matrix API  (direct, CORS-safe)
├── fetch /anthropic/...  ──► Netlify Function (chat.mjs) ──► api.anthropic.com  (key server-side)
├── fetch Open-Meteo      ──► api.open-meteo.com                           (direct, no key)
└── fetch Google Calendar ──► googleapis.com/calendar/v3                   (direct, API key)

State (localStorage)
├── hc-profile          — geocoded addresses, country code, departure/return hours
├── hc-traffic-history  — accumulated readings: { day: { "↑ 8:00": [mins], "↓ 17:00": [mins] } }
├── hc-weather          — latest 7-day forecast with fetch timestamp
└── hc-holidays         — upcoming public holidays for the next 60 days
```

---

## Deploying to Netlify

### 1. Set environment variables in Netlify dashboard

Go to **Site configuration → Environment variables** and add:

| Key | Value | Notes |
|-----|-------|-------|
| `ANTHROPIC_API_KEY` | your Anthropic key | server-side only — do NOT prefix with `VITE_` |
| `VITE_GOOGLE_API_KEY` | your Google API key | embedded in frontend build |

> Do **not** add `ANTHROPIC_API_KEY` to your `.env` file or prefix it with `VITE_` — that would expose it in the browser bundle.

### 2. Add your Netlify domain to Google API key referrer restrictions

In Google Cloud Console → APIs & Services → Credentials → your key → Application restrictions, add:
- `https://your-app.netlify.app/*`
- `https://your-custom-domain.com/*` (if applicable)

### 3. Deploy

Connect the repo to Netlify. The `netlify.toml` handles everything automatically:
- Build command: `npm run build`
- Publish directory: `dist`
- Serverless proxy: `netlify/functions/chat.mjs` mounted at `/anthropic/v1/messages`
- SPA fallback redirect

The fetch URL in `App.jsx` (`/anthropic/v1/messages`) is identical in dev and production — the Vite proxy handles it locally, the Netlify Function handles it in production.

---

## Development

```bash
npm run dev      # start dev server with Anthropic proxy
npm run build    # production build
npm run preview  # preview production build locally
npm run lint     # ESLint
```
