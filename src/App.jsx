import { useState, useEffect, useRef } from "react";

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const STORAGE_KEY  = "hc-traffic-history";
const PROFILE_KEY  = "hc-profile";
const WEATHER_KEY  = "hc-weather";
const HOLIDAYS_KEY = "hc-holidays";
const SHORT_DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── WMO weather interpretation codes ──────────────────────────────────────
const WMO = {
  0:  { label:"Clear sky",             emoji:"☀️",  impact:0  },
  1:  { label:"Mainly clear",          emoji:"🌤️",  impact:0  },
  2:  { label:"Partly cloudy",         emoji:"⛅",   impact:2  },
  3:  { label:"Overcast",              emoji:"☁️",   impact:4  },
  45: { label:"Fog",                   emoji:"🌫️",  impact:15 },
  48: { label:"Icy fog",               emoji:"🌫️",  impact:20 },
  51: { label:"Light drizzle",         emoji:"🌦️",  impact:8  },
  53: { label:"Drizzle",               emoji:"🌧️",  impact:12 },
  55: { label:"Heavy drizzle",         emoji:"🌧️",  impact:16 },
  61: { label:"Light rain",            emoji:"🌧️",  impact:10 },
  63: { label:"Rain",                  emoji:"🌧️",  impact:18 },
  65: { label:"Heavy rain",            emoji:"🌧️",  impact:25 },
  71: { label:"Light snow",            emoji:"🌨️",  impact:20 },
  73: { label:"Snow",                  emoji:"❄️",   impact:30 },
  75: { label:"Heavy snow",            emoji:"❄️",   impact:40 },
  77: { label:"Snow grains",           emoji:"🌨️",  impact:22 },
  80: { label:"Light showers",         emoji:"🌦️",  impact:10 },
  81: { label:"Showers",              emoji:"🌧️",  impact:18 },
  82: { label:"Heavy showers",         emoji:"⛈️",  impact:25 },
  85: { label:"Snow showers",          emoji:"🌨️",  impact:28 },
  86: { label:"Heavy snow showers",    emoji:"❄️",   impact:38 },
  95: { label:"Thunderstorm",          emoji:"⛈️",  impact:35 },
  96: { label:"Thunderstorm+hail",     emoji:"⛈️",  impact:40 },
  99: { label:"Heavy thunderstorm",    emoji:"⛈️",  impact:45 },
};
const getWmo = (code) => {
  if (WMO[code]) return WMO[code];
  const nearest = Object.keys(WMO).map(Number).sort((a,b)=>a-b)
    .reduce((p,c) => Math.abs(c-code) < Math.abs(p-code) ? c : p);
  return WMO[nearest] || { label:"Unknown", emoji:"🌡️", impact:5 };
};

// ─── Google public holiday calendar IDs by ISO country code ─────────────────
const HOLIDAY_CALENDARS = {
  US: "en.usa#holiday@group.v.calendar.google.com",
  GB: "en.uk#holiday@group.v.calendar.google.com",
  AU: "en.australian#holiday@group.v.calendar.google.com",
  CA: "en.canadian#holiday@group.v.calendar.google.com",
  IN: "en.indian#holiday@group.v.calendar.google.com",
  DE: "en.german#holiday@group.v.calendar.google.com",
  FR: "en.french#holiday@group.v.calendar.google.com",
  JP: "en.japanese#holiday@group.v.calendar.google.com",
  SG: "en.singapore#holiday@group.v.calendar.google.com",
  NZ: "en.new_zealand#holiday@group.v.calendar.google.com",
  ZA: "en.south_africa#holiday@group.v.calendar.google.com",
  IE: "en.irish#holiday@group.v.calendar.google.com",
  NL: "en.dutch#holiday@group.v.calendar.google.com",
  BR: "en.brazilian#holiday@group.v.calendar.google.com",
  MX: "en.mexican#holiday@group.v.calendar.google.com",
  KR: "en.south_korea#holiday@group.v.calendar.google.com",
  PH: "en.philippines#holiday@group.v.calendar.google.com",
  MY: "en.malaysia#holiday@group.v.calendar.google.com",
  HK: "en.hong_kong#holiday@group.v.calendar.google.com",
};

// ─── System prompt ─────────────────────────────────────────────────────────
const buildSystemPrompt = (profile, history, weather, holidays) => {
  // Traffic history
  const trafficLines = [];
  if (history && Object.keys(history).length > 0) {
    for (const [day, slots] of Object.entries(history)) {
      for (const [slot, readings] of Object.entries(slots)) {
        if (!readings.length) continue;
        const avg = Math.round(readings.reduce((a,b)=>a+b,0)/readings.length);
        const mn = Math.min(...readings), mx = Math.max(...readings);
        trafficLines.push(`${day} ${slot}: avg=${avg}min, min=${mn}min, max=${mx}min (${readings.length} readings)`);
      }
    }
  }

  // Weather forecast
  const weatherLines = [];
  if (weather?.daily) {
    const d = weather.daily;
    for (let i = 0; i < d.time.length; i++) {
      const wmo  = getWmo(d.weathercode?.[i] ?? 0);
      const rain = d.precipitation_sum?.[i] ?? 0;
      const wind = d.windspeed_10m_max?.[i] ?? 0;
      const prob = d.precipitation_probability_max?.[i] ?? 0;
      const label = new Date(d.time[i] + "T12:00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
      weatherLines.push(
        `${d.time[i]} (${label}): ${wmo.emoji} ${wmo.label} | rain: ${rain}mm (${prob}% chance) | wind: ${wind}km/h | traffic impact est: +${wmo.impact}min`
      );
    }
  }

  // Holidays
  const holidayLines = holidays?.length
    ? holidays.map(h => {
        const label = new Date(h.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
        return `${h.date} (${label}): ${h.name} — office likely closed, do NOT recommend commuting`;
      })
    : [];

  return `You are HybridCommute — an intelligent commute optimization agent for hybrid workers.
You have access to three real data sources: Google Maps traffic, live weather forecasts, and public holiday calendars.

User Profile:
- Origin: ${profile?.originName || "not set"}
- Destination: ${profile?.destName || "not set"}
- Office days required per week: ${profile?.officeDays || "not set"}
- Morning departure: ${profile?.windowStart || "8"}:00 (home → office)
- Evening return: ${profile?.returnHour || "17"}:00 (office → home)
- Country: ${profile?.countryCode || "US"}

Real Historical Traffic Data (Google Maps Distance Matrix):
${trafficLines.length ? trafficLines.join("\n") : "No traffic data yet. Ask the user to collect data from the Data tab."}

7-Day Weather Forecast (Open-Meteo):
${weatherLines.length ? weatherLines.join("\n") : "No weather data yet. Will be fetched during data collection."}

Upcoming Public Holidays (next 60 days):
${holidayLines.length ? holidayLines.join("\n") : "No upcoming public holidays found."}

Instructions:
1. Use ALL THREE sources for holistic, data-driven recommendations.
2. Holidays = office closed. NEVER recommend commuting on a holiday.
3. Bad weather (rain >5mm, snow, thunderstorm) adds meaningful commute time — factor the +Xmin impact into your Combined Score.
4. Combined Score per day = historical traffic avg (min) + weather impact (min). Lower is better.
5. Flag days where holidays or severe weather make commuting unnecessary or dangerous.
6. Cite which data source supports each recommendation.

Format day recommendations as:
| Day | Date | Traffic Avg | Weather | +Impact | Combined | Verdict |
|-----|------|------------|---------|---------|----------|---------|

Traffic: 🟢 light (<20% above min) 🟡 moderate (20–50%) 🔴 heavy (>50%)
Weather: ☀️ great  ⛅ fine  🌧️ poor  ❄️ avoid  🚫 holiday
Always end with one proactive tip about the upcoming week.`;
};

// ─── Google Maps JS SDK loader ──────────────────────────────────────────────
const loadMapsSDK = (apiKey) => new Promise((resolve, reject) => {
  if (window.google?.maps?.Geocoder) { resolve(window.google.maps); return; }
  const existing = document.getElementById("gmap-sdk");
  if (existing) { existing.addEventListener("load", () => resolve(window.google.maps)); return; }
  const script = document.createElement("script");
  script.id = "gmap-sdk";
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
  script.async = true;
  script.onload = () => resolve(window.google.maps);
  script.onerror = () => reject(new Error("Failed to load Google Maps SDK. Check your API key and ensure Maps JavaScript API is enabled."));
  document.head.appendChild(script);
});

// ─── Geocode — also extracts country code ──────────────────────────────────
const geocodeAddress = (mapsApi, address) => new Promise((resolve, reject) => {
  const geocoder = new mapsApi.Geocoder();
  geocoder.geocode({ address }, (results, status) => {
    if (status === "OK" && results[0]) {
      const loc = results[0].geometry.location;
      const countryComp = results[0].address_components?.find(c => c.types.includes("country"));
      resolve({
        lat: loc.lat(),
        lng: loc.lng(),
        name: results[0].formatted_address,
        countryCode: countryComp?.short_name || null,
      });
    } else {
      reject(new Error(`Geocoding failed: ${status}. Check the address and ensure Geocoding API is enabled.`));
    }
  });
});

// ─── Get route duration via JS SDK DistanceMatrix ───────────────────────────
const getRouteDuration = (mapsApi, origin, dest, departureTime) => new Promise((resolve, reject) => {
  const service = new mapsApi.DistanceMatrixService();
  service.getDistanceMatrix({
    origins: [new mapsApi.LatLng(origin.lat, origin.lng)],
    destinations: [new mapsApi.LatLng(dest.lat, dest.lng)],
    travelMode: mapsApi.TravelMode.DRIVING,
    drivingOptions: { departureTime, trafficModel: mapsApi.TrafficModel.BEST_GUESS },
  }, (response, status) => {
    if (status !== "OK") { reject(new Error(`Distance Matrix failed: ${status}`)); return; }
    const element = response.rows[0]?.elements[0];
    if (element?.status !== "OK") { reject(new Error(`Route element status: ${element?.status}`)); return; }
    const mins = Math.round((element.duration_in_traffic?.value || element.duration?.value || 0) / 60);
    resolve({ minutes: mins });
  });
});

// ─── Weather API (Open-Meteo — free, no key needed) ────────────────────────
const fetchWeatherForecast = async (lat, lng) => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,precipitation_sum,windspeed_10m_max,precipitation_probability_max&forecast_days=7&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
  const data = await res.json();
  return { ...data, _fetched: Date.now() };
};

// ─── Google Calendar public holidays ────────────────────────────────────────
const fetchHolidays = async (apiKey, countryCode) => {
  const calId = HOLIDAY_CALENDARS[countryCode] || HOLIDAY_CALENDARS.US;
  const now   = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const future  = new Date(now); future.setDate(future.getDate() + 60);
  const timeMax = future.toISOString();
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "25");
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Holiday API ${res.status}: ${err?.error?.message || "ensure Google Calendar API is enabled in Cloud Console"}`);
  }
  const data = await res.json();
  return (data.items || [])
    .map(e => ({ name: e.summary, date: e.start?.date || e.start?.dateTime?.split("T")[0] }))
    .filter(h => h.date);
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const nextOccurrence = (dayOfWeek, timeStr) => {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(now);
  const diff = (dayOfWeek - now.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  d.setHours(h, m || 0, 0, 0);
  return d;
};

// Returns the YYYY-MM-DD of the next occurrence of a named weekday (Mon, Tue…)
const nextDateForDay = (dayName) => {
  const idx = SHORT_DAYS.indexOf(dayName);
  if (idx < 0) return null;
  const now = new Date();
  const diff = (idx - now.getDay() + 7) % 7;
  const d = new Date(now);
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  return d.toISOString().split("T")[0];
};

const countReadings = (h) =>
  Object.values(h || {}).flatMap(s => Object.values(s)).flatMap(x => x).length;

// ─── Constants ─────────────────────────────────────────────────────────────
const TABS = ["Chat", "Data", "Settings"];
const QUICK_ACTIONS = [
  { label:"Best days this week",       prompt:"Based on my traffic data, weather, and holidays, what are the best days to commute this week?" },
  { label:"Weekly pattern analysis",   prompt:"Show me a full weekly analysis combining traffic patterns, weather forecast, and upcoming holidays." },
  { label:"Optimal departure times",   prompt:"What is the optimal departure time for each day of the week given traffic and weather?" },
  { label:"Time savings summary",      prompt:"How much time can I save by choosing the best vs worst commute days, factoring in weather?" },
];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`,
}));

const SETUP_FIELDS = [
  { field:"originRaw",   label:"Home address",              placeholder:"123 Main St, Austin TX" },
  { field:"destRaw",     label:"Office address",            placeholder:"456 Congress Ave, Austin TX" },
  { field:"officeDays",  label:"Required office days/week", placeholder:"3", type:"number" },
  { field:"windowStart", label:"Morning departure time",    type:"select", options: HOUR_OPTIONS },
  { field:"returnHour",  label:"Evening return time",       type:"select", options: HOUR_OPTIONS },
];

// ─── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]               = useState("Chat");
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [profile, setProfile]       = useState(null);
  const [history, setHistory]       = useState({});
  const [weather, setWeather]       = useState(null);
  const [holidays, setHolidays]     = useState([]);
  const [collecting, setCollecting] = useState(false);
  const [collectLog, setCollectLog] = useState([]);
  const [setupData, setSetupData]   = useState({});
  const [setupLog, setSetupLog]     = useState([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const bottomRef = useRef(null);

  // Load persisted data
  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem(PROFILE_KEY)  || "null"); if (p) setProfile(p); }  catch(e) {}
    try { const h = JSON.parse(localStorage.getItem(STORAGE_KEY)  || "null"); if (h) setHistory(h); }  catch(e) {}
    try { const w = JSON.parse(localStorage.getItem(WEATHER_KEY)  || "null"); if (w) setWeather(w); }  catch(e) {}
    try { const d = JSON.parse(localStorage.getItem(HOLIDAYS_KEY) || "null"); if (d) setHolidays(d); } catch(e) {}
  }, []);

  // Auto-refresh weather if >6 h stale
  useEffect(() => {
    if (!profile?.originCoords) return;
    const age = weather?._fetched ? Date.now() - weather._fetched : Infinity;
    if (age > 6 * 60 * 60 * 1000) {
      fetchWeatherForecast(profile.originCoords.lat, profile.originCoords.lng)
        .then(wx => saveWeather(wx))
        .catch(() => {});
    }
  }, [profile?.originCoords?.lat]);

  // Welcome message
  useEffect(() => {
    const readingCount = countReadings(history);
    const hasWeather   = !!weather?.daily;
    const holCount     = holidays.length;
    let msg;
    if (!profile) {
      msg = { role:"assistant", content:`👋 **Welcome to HybridCommute!**\n\nI combine real Google Maps traffic, live weather forecasts, and public holiday data to find your optimal office days.\n\n**Getting started:**\n1. Go to **Settings** → enter your commute addresses\n2. Come back here — I'll collect your data automatically!\n\nThe more data collected over time, the smarter my recommendations become.` };
    } else if (readingCount === 0) {
      msg = { role:"assistant", type:"collect-prompt" };
    } else {
      msg = { role:"assistant", content:`👋 Welcome back!\n\n📍 **${profile.originName}** → 🏢 **${profile.destName}**\n📊 **${readingCount} traffic readings** · ${hasWeather ? "✅ weather loaded" : "⚠️ no weather yet"} · ${holCount} upcoming holidays\n\nAsk me for recommendations, or go to **Data** to refresh traffic, weather & holidays!` };
    }
    setMessages([msg]);
  }, [profile?.originName]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, aiLoading]);

  const saveProfile  = async (p) => { setProfile(p);  try { localStorage.setItem(PROFILE_KEY,  JSON.stringify(p)); } catch(e) {} };
  const saveHistory  = async (h) => { setHistory(h);  try { localStorage.setItem(STORAGE_KEY,  JSON.stringify(h)); } catch(e) {} };
  const saveWeather  = async (w) => { setWeather(w);  try { localStorage.setItem(WEATHER_KEY,  JSON.stringify(w)); } catch(e) {} };
  const saveHolidays = async (d) => { setHolidays(d); try { localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(d)); } catch(e) {} };

  const confirmHoliday = (date, value) => {
    setHolidays(prev => {
      const updated = prev.map(h => h.date === date ? { ...h, confirmed: value } : h);
      try { localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(updated)); } catch(e) {}
      return updated;
    });
    setMessages(msgs => msgs.map(m =>
      m.type === "holiday-confirm"
        ? { ...m, holidays: m.holidays.map(h => h.date === date ? { ...h, confirmed: value } : h) }
        : m
    ));
  };

  // ── Collect traffic + weather + holidays ──────────────────────────────
  const runCollection = async (append, updateLast) => {
    if (!GOOGLE_API_KEY) { append("⚠️ No Google API key configured."); return; }
    let mapsApi;
    try {
      mapsApi = await loadMapsSDK(GOOGLE_API_KEY);
      append("✅ SDK loaded. Starting traffic collection for Mon–Fri…");
    } catch(e) {
      append("❌ " + e.message); return;
    }

    const morningSlot = `↑ ${profile.windowStart || "8"}:00`;
    const eveningSlot = `↓ ${profile.returnHour  || "17"}:00`;
    const workdays    = [1,2,3,4,5];
    const newHistory  = JSON.parse(JSON.stringify(history));
    let collected     = 0;

    for (const day of workdays) {
      const dayName = SHORT_DAYS[day];
      if (!newHistory[dayName]) newHistory[dayName] = {};

      if (!newHistory[dayName][morningSlot]) newHistory[dayName][morningSlot] = [];
      append(`📡 ${dayName} morning (${morningSlot})…`);
      try {
        const depTime = nextOccurrence(day, `${profile.windowStart || "8"}:00`);
        const result  = await getRouteDuration(mapsApi, profile.originCoords, profile.destCoords, depTime);
        newHistory[dayName][morningSlot].push(result.minutes);
        collected++;
        updateLast(`✅ ${dayName} morning: ${result.minutes} min`);
      } catch(e) {
        updateLast(`❌ ${dayName} morning: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 200));

      if (!newHistory[dayName][eveningSlot]) newHistory[dayName][eveningSlot] = [];
      append(`📡 ${dayName} evening (${eveningSlot})…`);
      try {
        const retTime = nextOccurrence(day, `${profile.returnHour || "17"}:00`);
        const result  = await getRouteDuration(mapsApi, profile.destCoords, profile.originCoords, retTime);
        newHistory[dayName][eveningSlot].push(result.minutes);
        collected++;
        updateLast(`✅ ${dayName} evening: ${result.minutes} min`);
      } catch(e) {
        updateLast(`❌ ${dayName} evening: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 200));
    }
    await saveHistory(newHistory);
    append(`✅ Traffic done: +${collected} readings (${countReadings(newHistory)} total)`);

    try {
      append("🌤️ Fetching 7-day weather forecast (Open-Meteo)…");
      const wx = await fetchWeatherForecast(profile.originCoords.lat, profile.originCoords.lng);
      await saveWeather(wx);
      updateLast(`✅ Weather: 7-day forecast loaded`);
    } catch(e) {
      updateLast(`⚠️ Weather: ${e.message}`);
    }

    let fetchedHolidays = [];
    try {
      const cc = profile.countryCode || "US";
      append(`📅 Fetching public holidays for ${cc} (Google Calendar)…`);
      const hols = await fetchHolidays(GOOGLE_API_KEY, cc);
      const existingMap = Object.fromEntries(holidays.map(h => [h.date, h.confirmed]));
      fetchedHolidays = hols.map(h => ({ ...h, confirmed: existingMap[h.date] }));
      await saveHolidays(fetchedHolidays);
      updateLast(`✅ Holidays: ${hols.length} upcoming events found`);
    } catch(e) {
      updateLast(`⚠️ Holidays: ${e.message}`);
    }

    return { collected, fetchedHolidays };
  };

  const collectNow = async () => {
    if (!GOOGLE_API_KEY) { setCollectLog(["⚠️ No Google API key configured."]); return; }
    setCollecting(true);
    setCollectLog(["🔄 Loading Google Maps SDK…"]);
    await runCollection(
      line => setCollectLog(l => [...l, line]),
      line => setCollectLog(l => { const n=[...l]; n[n.length-1]=line; return n; })
    );
    setCollectLog(l => [...l, `\n🎉 All done! Go to Chat for recommendations.`]);
    setCollecting(false);
  };

  const collectNowFromChat = async () => {
    if (!profile) return;
    setCollecting(true);
    setMessages(msgs => msgs.map(m =>
      m.type === "collect-prompt"
        ? { role:"assistant", type:"collect-progress", log:["🔄 Loading Google Maps SDK…"] }
        : m
    ));
    const appendChat   = line => setMessages(msgs => msgs.map(m =>
      m.type === "collect-progress" ? { ...m, log:[...m.log, line] } : m
    ));
    const updateLastChat = line => setMessages(msgs => msgs.map(m =>
      m.type === "collect-progress" ? { ...m, log:[...m.log.slice(0,-1), line] } : m
    ));
    const { collected = 0, fetchedHolidays = [] } = await runCollection(appendChat, updateLastChat) || {};
    setMessages(msgs => {
      const updated = msgs.map(m =>
        m.type === "collect-progress"
          ? { role:"assistant", content:`🎉 **All done!** Collected ${collected} traffic readings plus weather & holidays.\n\nAsk me for commute recommendations whenever you're ready!` }
          : m
      );
      if (fetchedHolidays.length > 0) {
        return [...updated, { role:"assistant", type:"holiday-confirm", holidays: fetchedHolidays }];
      }
      return updated;
    });
    setCollecting(false);
  };

  // ── AI chat ───────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || aiLoading) return;
    setInput("");
    const next = [...messages, { role:"user", content:userText }];
    setMessages(next);
    setAiLoading(true);
    try {
      // Only send real text turns — UI-only cards (collect-prompt,
      // collect-progress, holiday-confirm) have no `content` and would
      // otherwise produce a message missing the required `content` field.
      // The API also requires the conversation to start with a user turn,
      // so drop any leading assistant messages (e.g. the welcome greeting).
      const apiMessages = next
        .filter(m => typeof m.content === "string" && m.content.length > 0)
        .map(m => ({ role:m.role, content:m.content }));
      while (apiMessages.length && apiMessages[0].role !== "user") apiMessages.shift();

      const res = await fetch("/anthropic/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: buildSystemPrompt(profile, history, weather, holidays.filter(h => h.confirmed !== false)),
          messages: apiMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = data.error?.message || JSON.stringify(data);
        setMessages(prev => [...prev, { role:"assistant", content:`⚠️ API error (${res.status}): ${msg}` }]);
      } else {
        const reply = data.content?.map(b => b.text||"").join("\n") || "Sorry, something went wrong.";
        setMessages(prev => [...prev, { role:"assistant", content:reply }]);
      }
    } catch(e) {
      setMessages(prev => [...prev, { role:"assistant", content:`⚠️ Connection error: ${e.message}` }]);
    }
    setAiLoading(false);
  };

  const handleKey = (e) => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendMessage(); } };

  // ── Save profile — geocode + detect country + fetch holidays ─────────
  const handleSaveProfile = async () => {
    const originAddr = setupData.originRaw || profile?.originRaw;
    const destAddr   = setupData.destRaw   || profile?.destRaw;
    if (!originAddr || !destAddr) { setSetupLog(["⚠️ Please fill in both addresses."]); return; }
    setSetupLoading(true);
    setSetupLog(["🔄 Loading Google Maps SDK…"]);
    try {
      const mapsApi = await loadMapsSDK(GOOGLE_API_KEY);
      setSetupLog(l => [...l, "✅ SDK loaded. Geocoding addresses…"]);
      const origin = await geocodeAddress(mapsApi, originAddr);
      setSetupLog(l => [...l, `✅ Home: ${origin.name}`]);
      const dest = await geocodeAddress(mapsApi, destAddr);
      setSetupLog(l => [...l, `✅ Office: ${dest.name}`]);
      const countryCode = origin.countryCode || "US";
      const p = {
        originRaw:    originAddr,
        originName:   origin.name,
        originCoords: { lat:origin.lat, lng:origin.lng },
        destRaw:      destAddr,
        destName:     dest.name,
        destCoords:   { lat:dest.lat, lng:dest.lng },
        officeDays:   parseInt(setupData.officeDays   || profile?.officeDays   || 3),
        windowStart:  String(setupData.windowStart    || profile?.windowStart  || "8"),
        returnHour:   String(setupData.returnHour     || profile?.returnHour   || "17"),
        countryCode,
      };
      await saveProfile(p);
      setSetupLog(l => [...l, `🌍 Country detected: ${countryCode}`]);

      // Fetch holidays for detected country
      try {
        setSetupLog(l => [...l, `📅 Fetching public holidays for ${countryCode}…`]);
        const hols = await fetchHolidays(GOOGLE_API_KEY, countryCode);
        const existingMap = Object.fromEntries(holidays.map(h => [h.date, h.confirmed]));
        await saveHolidays(hols.map(h => ({ ...h, confirmed: existingMap[h.date] })));
        setSetupLog(l => [...l, `✅ Holidays: ${hols.length} upcoming events found`]);
      } catch(e) {
        setSetupLog(l => [...l, `⚠️ Holidays: ${e.message}`]);
      }

      setSetupLog(l => [...l, "🎉 Profile saved! Go to Data to collect traffic & weather."]);
      setSetupData({});
    } catch(e) {
      setSetupLog(l => [...l, "❌ " + e.message]);
    }
    setSetupLoading(false);
  };

  // ── Markdown renderer ─────────────────────────────────────────────────
  const renderMd = (text) => {
    const lines = text.split("\n");
    const els = [];
    let tLines = [], inT = false;
    const flushT = () => {
      if (tLines.length < 2) { tLines.forEach((l,i)=>els.push(<p key={`tl${i}`} style={{margin:"2px 0",fontSize:13,color:"var(--color-text-primary)"}}>{l}</p>)); tLines=[]; inT=false; return; }
      const rows = tLines.map(l=>l.split("|").map(c=>c.trim()).filter(c=>c!=="")).filter(r=>!r.every(c=>/^[-:]+$/.test(c)));
      els.push(<div key={`t${els.length}`} style={{overflowX:"auto",margin:"8px 0"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{rows[0]?.map((c,i)=><th key={i} style={{padding:"5px 8px",textAlign:"left",borderBottom:"1.5px solid var(--color-border-secondary)",fontWeight:500,color:"var(--color-text-secondary)",whiteSpace:"nowrap"}}>{c}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,ri)=><tr key={ri} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{row.map((c,ci)=><td key={ci} style={{padding:"5px 8px",color:"var(--color-text-primary)",whiteSpace:"nowrap"}}>{c}</td>)}</tr>)}</tbody></table></div>);
      tLines=[]; inT=false;
    };
    lines.forEach((line, idx) => {
      if (line.includes("|")) { inT=true; tLines.push(line); return; }
      if (inT) flushT();
      const fmt = s => s.replace(/\*\*(.*?)\*\*/g,(_,m)=>`<strong>${m}</strong>`);
      if (line.startsWith("**")&&line.endsWith("**")&&line.length>4) els.push(<p key={idx} style={{margin:"8px 0 3px",fontWeight:500,fontSize:13,color:"var(--color-text-primary)"}}>{line.slice(2,-2)}</p>);
      else if (line.startsWith("- ")||line.startsWith("• ")) els.push(<div key={idx} style={{display:"flex",gap:7,margin:"2px 0"}}><span style={{color:"var(--color-text-secondary)",fontSize:13,flexShrink:0}}>•</span><span style={{fontSize:13,color:"var(--color-text-primary)",lineHeight:1.6}} dangerouslySetInnerHTML={{__html:fmt(line.slice(2))}}/></div>);
      else if (line==="") els.push(<div key={idx} style={{height:5}}/>);
      else els.push(<p key={idx} style={{margin:"2px 0",fontSize:13,color:"var(--color-text-primary)",lineHeight:1.65}} dangerouslySetInnerHTML={{__html:fmt(line)}}/>);
    });
    if (inT) flushT();
    return els;
  };

  // ── Data tab ──────────────────────────────────────────────────────────
  const DataTab = () => {
    const days = ["Mon","Tue","Wed","Thu","Fri"]
      .sort((a, b) => (nextDateForDay(a) || "").localeCompare(nextDateForDay(b) || ""));
    const weatherAge = weather?._fetched
      ? Math.round((Date.now() - weather._fetched) / 60000)
      : null;

    return (
      <div style={{padding:"16px 20px",overflowY:"auto",flex:1}}>

        {/* Collect button */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontWeight:500,fontSize:14,color:"var(--color-text-primary)"}}>Traffic · Weather · Holidays</div>
            <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>
              {countReadings(history)} readings
              {weatherAge !== null ? ` · weather ${weatherAge < 60 ? `${weatherAge}m ago` : `${Math.round(weatherAge/60)}h ago`}` : " · no weather"}
              {holidays.length > 0 ? ` · ${holidays.length} holidays` : ""}
            </div>
          </div>
          <button
            onClick={collectNow}
            disabled={collecting || !profile}
            style={{fontSize:12,padding:"7px 14px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:collecting||!profile?"var(--color-background-secondary)":"var(--color-background-info)",color:"var(--color-text-primary)",cursor:collecting||!profile?"default":"pointer",fontWeight:500}}
          >
            {collecting ? "Collecting…" : "Collect data now"}
          </button>
        </div>

        {collectLog.length > 0 && (
          <div style={{background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,padding:"10px 14px",marginBottom:14,maxHeight:180,overflowY:"auto"}}>
            {collectLog.map((l,i) => <div key={i} style={{fontSize:11,color:"var(--color-text-secondary)",lineHeight:1.7,fontFamily:"var(--font-mono)"}}>{l}</div>)}
          </div>
        )}

        {!profile && (
          <p style={{fontSize:13,color:"var(--color-text-secondary)",textAlign:"center",padding:"40px 0"}}>Set up your profile in Settings first.</p>
        )}

        {/* ── Weather forecast ── */}
        {weather?.daily && (
          <div style={{marginBottom:18}}>
            <div style={{fontWeight:500,fontSize:13,color:"var(--color-text-primary)",marginBottom:8}}>7-Day Weather Forecast</div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
              {weather.daily.time.map((date, i) => {
                const wmo    = getWmo(weather.daily.weathercode?.[i] ?? 0);
                const rain   = weather.daily.precipitation_sum?.[i] ?? 0;
                const prob   = weather.daily.precipitation_probability_max?.[i] ?? 0;
                const wind   = weather.daily.windspeed_10m_max?.[i] ?? 0;
                const dayShort = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday:"short" });
                const impact = wmo.impact;
                const impactColor = impact === 0 ? "#16a34a" : impact < 15 ? "#d97706" : "#dc2626";
                const isToday = date === new Date().toISOString().split("T")[0];
                return (
                  <div key={date} style={{minWidth:88,flexShrink:0,background:"var(--color-background-secondary)",border:`0.5px solid ${isToday ? "var(--color-border-primary)" : "var(--color-border-tertiary)"}`,borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:isToday?600:400,color:"var(--color-text-primary)",marginBottom:1}}>{isToday ? "Today" : dayShort}</div>
                    <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginBottom:6}}>{date.slice(5)}</div>
                    <div style={{fontSize:22,marginBottom:4,lineHeight:1}}>{wmo.emoji}</div>
                    <div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:4,lineHeight:1.3}}>{wmo.label}</div>
                    <div style={{fontSize:10,color:"var(--color-text-secondary)"}}>💧 {rain}mm</div>
                    <div style={{fontSize:10,color:"var(--color-text-secondary)"}}>☔ {prob}%</div>
                    <div style={{fontSize:10,color:"var(--color-text-secondary)"}}>💨 {wind}km/h</div>
                    {impact > 0 && (
                      <div style={{fontSize:10,color:impactColor,fontWeight:600,marginTop:5}}>+{impact}min</div>
                    )}
                    {impact === 0 && (
                      <div style={{fontSize:10,color:"#16a34a",fontWeight:600,marginTop:5}}>✓ clear</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:6}}>Source: Open-Meteo · +Xmin = estimated extra commute time due to weather</div>
          </div>
        )}

        {/* ── Upcoming holidays ── */}
        {holidays.length > 0 && (
          <div style={{marginBottom:18}}>
            <div style={{fontWeight:500,fontSize:13,color:"var(--color-text-primary)",marginBottom:8}}>Upcoming Public Holidays</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {holidays.map((h, i) => {
                const d       = new Date(h.date + "T12:00:00");
                const dayLong = d.toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" });
                const daysAway = Math.ceil((d - new Date()) / 86400000);
                return (
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--color-background-secondary)",border:`0.5px solid ${h.confirmed===false?"var(--color-border-tertiary)":"var(--color-border-tertiary)"}`,borderRadius:8,padding:"8px 12px",opacity:h.confirmed===false?0.5:1}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",display:"flex",alignItems:"center",gap:6}}>
                        {h.name}
                        {h.confirmed===false && <span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:"rgba(107,119,153,0.15)",color:"var(--color-text-tertiary)"}}>skipped</span>}
                      </div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{dayLong}{daysAway > 0 ? ` · in ${daysAway} day${daysAway!==1?"s":""}` : " · today"}</div>
                    </div>
                    <div style={{display:"flex",gap:5,flexShrink:0,alignItems:"center"}}>
                      {h.confirmed!==false && <div style={{fontSize:11,padding:"3px 9px",borderRadius:6,background:"#dc262611",color:"#dc2626",border:"0.5px solid #dc262644",fontWeight:500}}>🚫 No commute</div>}
                      <button onClick={() => confirmHoliday(h.date, true)} style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:`1px solid ${h.confirmed===true?"#22c55e":"var(--color-border-secondary)"}`,background:h.confirmed===true?"rgba(34,197,94,0.15)":"transparent",color:h.confirmed===true?"#22c55e":"var(--color-text-secondary)",cursor:"pointer"}}>✓</button>
                      <button onClick={() => confirmHoliday(h.date, false)} style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:`1px solid ${h.confirmed===false?"#ef4444":"var(--color-border-secondary)"}`,background:h.confirmed===false?"rgba(239,68,68,0.15)":"transparent",color:h.confirmed===false?"#ef4444":"var(--color-text-secondary)",cursor:"pointer"}}>✗</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:6}}>Source: Google Calendar public holiday feed · {profile?.countryCode || "US"}</div>
          </div>
        )}

        {/* ── Traffic history ── */}
        {profile && countReadings(history) === 0 && !collecting && (
          <p style={{fontSize:13,color:"var(--color-text-secondary)",textAlign:"center",padding:"20px 0"}}>
            No traffic data yet. Click "Collect data now" to fetch traffic, weather & holidays in one go.
          </p>
        )}

        {countReadings(history) > 0 && (
          <div>
            <div style={{fontWeight:500,fontSize:13,color:"var(--color-text-primary)",marginBottom:8}}>Traffic History</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {days.map(day => {
                const slots = history[day] || {};
                if (!Object.keys(slots).length) return null;

                // Only show morning (↑) and evening (↓) slots
                const morningEntry = Object.entries(slots).find(([k]) => k.startsWith("↑"));
                const eveningEntry = Object.entries(slots).find(([k]) => k.startsWith("↓"));
                if (!morningEntry && !eveningEntry) return null;

                const avg = (readings) => Math.round(readings.reduce((a,b)=>a+b,0)/readings.length);
                const morningAvg  = morningEntry ? avg(morningEntry[1]) : null;
                const eveningAvg  = eveningEntry ? avg(eveningEntry[1]) : null;

                // Specific upcoming date for this weekday
                const nextDate    = nextDateForDay(day);
                const nextDateFmt = nextDate
                  ? new Date(nextDate + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" })
                  : "";

                // Holiday: only flag if the specific upcoming date is a holiday
                const holidayMatch = holidays.find(h => h.date === nextDate);

                // Weather: match by specific date in forecast
                let weatherWmo = null;
                if (weather?.daily && nextDate) {
                  const idx = weather.daily.time.indexOf(nextDate);
                  if (idx >= 0) weatherWmo = getWmo(weather.daily.weathercode?.[idx] ?? 0);
                }

                // Traffic colour helper
                const trafficColor = (mins, ref) => {
                  if (!ref) return "#6b7799";
                  const pct = (mins - ref) / ref;
                  return pct < 0.2 ? "#22c55e" : pct < 0.5 ? "#f59e0b" : "#ef4444";
                };
                const refAvg = [morningAvg, eveningAvg].filter(Boolean);
                const minRef = refAvg.length ? Math.min(...refAvg) : null;

                return (
                  <div key={day} style={{
                    background:"var(--color-background-secondary)",
                    borderRadius:10,
                    border:`1px solid ${holidayMatch ? "rgba(239,68,68,0.3)" : "var(--color-border-secondary)"}`,
                    borderLeft:`3px solid ${holidayMatch ? "#ef4444" : "#6366f1"}`,
                    padding:"12px 14px",
                  }}>
                    {/* Day header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontWeight:600,fontSize:14,color:"var(--color-text-primary)"}}>{day}</span>
                        <span style={{fontSize:11,color:"var(--color-text-tertiary)",background:"var(--color-border-tertiary)",padding:"1px 7px",borderRadius:4}}>{nextDateFmt}</span>
                        {holidayMatch && (
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.25)",fontWeight:500}}>
                            🚫 {holidayMatch.name}
                          </span>
                        )}
                      </div>
                      {weatherWmo && !holidayMatch && (
                        <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>
                          {weatherWmo.emoji} {weatherWmo.label}
                          {weatherWmo.impact > 0 && <span style={{color:"#f59e0b",fontWeight:500}}> +{weatherWmo.impact}m</span>}
                        </span>
                      )}
                    </div>

                    {holidayMatch ? (
                      <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)"}}>Office closed — no commute needed</p>
                    ) : (
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {/* Morning slot */}
                        {morningEntry && (
                          <div style={{background:"var(--color-border-tertiary)",borderRadius:8,padding:"9px 12px"}}>
                            <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:4}}>🌅 Morning departure</div>
                            <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:6}}>{morningEntry[0].replace("↑ ","")}</div>
                            <div style={{fontSize:20,fontWeight:700,color:trafficColor(morningAvg, minRef),letterSpacing:"-0.5px"}}>{morningAvg}<span style={{fontSize:11,fontWeight:400,marginLeft:2}}>min</span></div>
                            <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:3}}>{morningEntry[1].length} reading{morningEntry[1].length!==1?"s":""}</div>
                          </div>
                        )}
                        {/* Evening slot */}
                        {eveningEntry && (
                          <div style={{background:"var(--color-border-tertiary)",borderRadius:8,padding:"9px 12px"}}>
                            <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:4}}>🌆 Evening return</div>
                            <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:6}}>{eveningEntry[0].replace("↓ ","")}</div>
                            <div style={{fontSize:20,fontWeight:700,color:trafficColor(eveningAvg, minRef),letterSpacing:"-0.5px"}}>{eveningAvg}<span style={{fontSize:11,fontWeight:400,marginLeft:2}}>min</span></div>
                            <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:3}}>{eveningEntry[1].length} reading{eveningEntry[1].length!==1?"s":""}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Settings tab ──────────────────────────────────────────────────────
  const settingsTabContent = (
    <div style={{padding:"16px 20px",overflowY:"auto",flex:1}}>
      <div style={{background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,padding:"12px 14px",marginBottom:18,fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.7}}>
        <div style={{fontWeight:500,color:"var(--color-text-primary)",marginBottom:4}}>Required Google Cloud APIs</div>
        <div>Enable these in your Google Cloud Console:</div>
        <div>• <strong style={{color:"var(--color-text-primary)"}}>Maps JavaScript API</strong> — browser-safe SDK (geocoding + routing)</div>
        <div>• <strong style={{color:"var(--color-text-primary)"}}>Geocoding API</strong> — address lookup + country detection</div>
        <div>• <strong style={{color:"var(--color-text-primary)"}}>Distance Matrix API</strong> — traffic-aware travel times</div>
        <div>• <strong style={{color:"var(--color-text-primary)"}}>Google Calendar API</strong> — public holiday detection</div>
        <div style={{marginTop:6,color:"var(--color-text-tertiary)"}}>
          Weather is provided by <strong style={{color:"var(--color-text-secondary)"}}>Open-Meteo</strong> (free, no key needed).
          Add your site URL (or <code>*</code>) to the API key's HTTP referrer restrictions.
        </div>
      </div>

      <div style={{fontWeight:500,fontSize:13,color:"var(--color-text-primary)",marginBottom:4}}>
        {profile ? "Update commute profile" : "Set up commute profile"}
      </div>
      {profile && (
        <div style={{background:"var(--color-background-secondary)",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)",padding:"10px 14px",marginBottom:12,fontSize:12,color:"var(--color-text-secondary)"}}>
          <div>📍 {profile.originName}</div>
          <div>🏢 {profile.destName}</div>
          <div>{profile.officeDays} days/wk · 🌅 {HOUR_OPTIONS[parseInt(profile.windowStart)]?.label || `${profile.windowStart}:00`} depart · 🌆 {HOUR_OPTIONS[parseInt(profile.returnHour || 17)]?.label || `${profile.returnHour}:00`} return</div>
          {profile.countryCode && <div>🌍 Country: {profile.countryCode} {HOLIDAY_CALENDARS[profile.countryCode] ? "✅" : "⚠️ (using US holidays as fallback)"}</div>}
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:12}}>
        {SETUP_FIELDS.map((f,i) => (
          <div key={i}>
            <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>{f.label}</label>
            {f.type === "select" ? (
              <select
                value={setupData[f.field] ?? profile?.[f.field] ?? ""}
                onChange={e => setSetupData(p => ({...p, [f.field]: e.target.value}))}
                style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,boxSizing:"border-box",outline:"none",cursor:"pointer",appearance:"auto"}}
              >
                <option value="" disabled>Select time…</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                type={f.type || "text"}
                value={setupData[f.field] || ""}
                onChange={e => setSetupData(p => ({...p, [f.field]: e.target.value}))}
                placeholder={f.placeholder}
                style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,boxSizing:"border-box",outline:"none"}}
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSaveProfile}
        disabled={setupLoading}
        style={{width:"100%",padding:"9px 0",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:!setupLoading?"var(--color-background-info)":"var(--color-background-secondary)",color:"var(--color-text-primary)",fontSize:13,cursor:!setupLoading?"pointer":"default",fontWeight:500}}
      >
        {setupLoading ? "Geocoding…" : profile ? "Update & re-geocode" : "Save profile & geocode"}
      </button>

      {setupLog.length > 0 && (
        <div style={{marginTop:12,background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,padding:"10px 14px",maxHeight:160,overflowY:"auto"}}>
          {setupLog.map((l,i) => <div key={i} style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.7}}>{l}</div>)}
        </div>
      )}

      <div style={{height:1,background:"var(--color-border-tertiary)",margin:"18px 0"}}/>
      <button
        onClick={() => {
          try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
          setHistory({});
          setCollectLog(["🗑️ Traffic history cleared."]);
        }}
        style={{width:"100%",padding:"8px 0",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)",background:"transparent",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer",marginBottom:8}}
      >
        Clear traffic history
      </button>
      <button
        onClick={() => {
          try { localStorage.removeItem(WEATHER_KEY); localStorage.removeItem(HOLIDAYS_KEY); } catch(e) {}
          setWeather(null); setHolidays([]);
          setCollectLog(["🗑️ Weather & holiday cache cleared."]);
        }}
        style={{width:"100%",padding:"8px 0",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)",background:"transparent",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}
      >
        Clear weather & holiday cache
      </button>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxWidth:760,margin:"0 auto",fontFamily:"var(--font-sans)",borderInline:"1px solid var(--color-border-secondary)"}}>

      {/* Header */}
      <div style={{padding:"13px 20px",borderBottom:"1px solid var(--color-border-secondary)",display:"flex",alignItems:"center",gap:12,flexShrink:0,background:"var(--color-background-secondary)"}}>
        <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,boxShadow:"0 0 12px rgba(99,102,241,0.4)"}}>🚗</div>
        <div>
          <div style={{fontWeight:600,fontSize:14,color:"var(--color-text-primary)",letterSpacing:"-0.2px"}}>HybridCommute</div>
          <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:1}}>Traffic · Weather · Holidays</div>
        </div>
        {profile && (
          <div style={{marginLeft:"auto",fontSize:11,color:"var(--color-text-secondary)",textAlign:"right"}}>
            <div style={{fontWeight:500,color:"var(--color-text-primary)"}}>{profile.originName} → {profile.destName}</div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:3}}>
              <span style={{color:"#22c55e",fontWeight:500}}>{countReadings(history)} readings</span>
              {weather?.daily && <span style={{color:"#60a5fa"}}>⛅ wx</span>}
              {holidays.length > 0 && <span style={{color:"#f87171"}}>📅 {holidays.length}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid var(--color-border-secondary)",flexShrink:0,background:"var(--color-background-secondary)"}}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{flex:1,padding:"10px 0",fontSize:12,fontWeight:tab===t?600:400,color:tab===t?"var(--color-text-primary)":"var(--color-text-tertiary)",background:"transparent",border:"none",borderBottom:tab===t?"2px solid #6366f1":"2px solid transparent",cursor:"pointer",letterSpacing:"0.2px",transition:"color 0.15s"}}>
            {t}
          </button>
        ))}
      </div>

      {/* Chat */}
      {tab === "Chat" && (
        <>
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
            {messages.map((msg,i) => (
              <div key={i} style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",gap:10,alignItems:"flex-start",animation:"fadeIn 0.2s ease"}}>
                {msg.role==="assistant" && (
                  <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,marginTop:2}}>🚗</div>
                )}
                <div style={{
                  maxWidth:"82%",
                  background: msg.role==="user"
                    ? "linear-gradient(135deg,rgba(99,102,241,0.2),rgba(124,58,237,0.15))"
                    : "var(--color-background-secondary)",
                  borderRadius: msg.role==="user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  padding:"10px 14px",
                  border: msg.role==="user"
                    ? "1px solid rgba(99,102,241,0.3)"
                    : "1px solid var(--color-border-secondary)",
                }}>
                  {msg.type==="holiday-confirm" ? (
                    <div>
                      <p style={{margin:"0 0 10px",fontSize:13,color:"var(--color-text-primary)",lineHeight:1.65}}>
                        📅 Found {msg.holidays.length} public holiday{msg.holidays.length!==1?"s":""}. Confirm which apply to your location — skipped ones won't affect recommendations:
                      </p>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {msg.holidays.map(h => {
                          const label = new Date(h.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
                          return (
                            <div key={h.date} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                              <div>
                                <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)"}}>{h.name}</div>
                                <div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{label}</div>
                              </div>
                              <div style={{display:"flex",gap:5,flexShrink:0}}>
                                <button onClick={() => confirmHoliday(h.date, true)} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:`1px solid ${h.confirmed===true?"#22c55e":"var(--color-border-secondary)"}`,background:h.confirmed===true?"rgba(34,197,94,0.15)":"transparent",color:h.confirmed===true?"#22c55e":"var(--color-text-secondary)",cursor:"pointer",transition:"all 0.15s"}}>✓ Mine</button>
                                <button onClick={() => confirmHoliday(h.date, false)} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:`1px solid ${h.confirmed===false?"#ef4444":"var(--color-border-secondary)"}`,background:h.confirmed===false?"rgba(239,68,68,0.15)":"transparent",color:h.confirmed===false?"#ef4444":"var(--color-text-secondary)",cursor:"pointer",transition:"all 0.15s"}}>✗ Skip</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : msg.type==="collect-prompt" ? (
                    <div>
                      <p style={{margin:"0 0 10px",fontSize:13,color:"var(--color-text-primary)",lineHeight:1.65}}>
                        📊 No traffic data yet for <strong>{profile?.originName}</strong> → <strong>{profile?.destName}</strong>.<br/>
                        Collect traffic, weather &amp; holidays to get recommendations.
                      </p>
                      <button
                        onClick={collectNowFromChat}
                        disabled={collecting}
                        style={{fontSize:12,padding:"7px 16px",borderRadius:8,border:"none",background:collecting?"var(--color-background-secondary)":"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"#fff",cursor:collecting?"default":"pointer",fontWeight:600,boxShadow:collecting?"none":"0 0 10px rgba(99,102,241,0.35)"}}
                      >
                        {collecting ? "Collecting…" : "Collect data now"}
                      </button>
                    </div>
                  ) : msg.type==="collect-progress" ? (
                    <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--color-text-secondary)",lineHeight:1.8}}>
                      {msg.log.map((l,i) => <div key={i}>{l}</div>)}
                    </div>
                  ) : msg.role==="assistant" ? renderMd(msg.content) : <p style={{margin:0,fontSize:13,color:"var(--color-text-primary)",lineHeight:1.65}}>{msg.content}</p>}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>🚗</div>
                <div style={{background:"var(--color-background-secondary)",borderRadius:"4px 16px 16px 16px",padding:"12px 16px",border:"1px solid var(--color-border-secondary)"}}>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#6366f1",animation:`pulse 1.4s ease-in-out ${i*0.18}s infinite`}}/>)}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {!aiLoading && profile && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
            <div style={{padding:"0 20px 12px",display:"flex",flexWrap:"wrap",gap:6}}>
              {QUICK_ACTIONS.map((a,i) => (
                <button key={i} onClick={() => sendMessage(a.prompt)} style={{fontSize:11,padding:"5px 12px",borderRadius:20,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",cursor:"pointer",transition:"border-color 0.15s,color 0.15s"}}>{a.label}</button>
              ))}
            </div>
          )}

          <div style={{padding:"10px 20px 16px",borderTop:"1px solid var(--color-border-secondary)",flexShrink:0,background:"var(--color-background-secondary)"}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your commute…"
                rows={1}
                style={{flex:1,resize:"none",padding:"10px 14px",borderRadius:14,border:"2px solid var(--color-border-primary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,fontFamily:"var(--font-sans)",lineHeight:1.5,outline:"none",minHeight:40,maxHeight:100,overflowY:"auto",transition:"border-color 0.15s"}}
                onInput={e => { e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"; }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || aiLoading}
                style={{width:40,height:40,borderRadius:12,border:"none",background:input.trim()&&!aiLoading?"linear-gradient(135deg,#4f46e5,#7c3aed)":"var(--color-border-secondary)",color:"#fff",cursor:input.trim()&&!aiLoading?"pointer":"default",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:input.trim()&&!aiLoading?"0 0 12px rgba(99,102,241,0.4)":"none",transition:"all 0.15s"}}
              >↑</button>
            </div>
            <p style={{margin:"8px 0 0",fontSize:10,color:"var(--color-text-tertiary)",textAlign:"center",letterSpacing:"0.3px"}}>
              Claude · Google Maps · Open-Meteo · Google Calendar
            </p>
          </div>
        </>
      )}

      {tab === "Data" && <DataTab/>}
      {tab === "Settings" && settingsTabContent}

    </div>
  );
}
