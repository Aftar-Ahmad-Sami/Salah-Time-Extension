'use strict';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const KAABA = { lat: 21.422487, lon: 39.826206 };

const STORAGE_KEYS = {
  settings: 'salah:settings',
  location: 'salah:location',
  timings: 'salah:timings',
};

const DEFAULT_SETTINGS = {
  method: '',     // '' = let AlAdhan pick the nearest authority
  school: '1',    // 0 = Standard (Shafi'i/Maliki/Hanbali), 1 = Hanafi
  clock: '12',    // '12' or '24'
  manual: null,   // { lat, lon, name } when the user picked a city
};

// Re-check the device location in the background when the saved one is older than this.
const LOCATION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
// Only reload prayer times if the device moved further than this.
const MOVE_THRESHOLD_KM = 5;

// AlAdhan calculation method ids: https://aladhan.com/calculation-methods
const METHODS = [
  ['', 'Auto (nearest authority)'],
  ['3', 'Muslim World League'],
  ['2', 'ISNA (North America)'],
  ['1', 'University of Islamic Sciences, Karachi'],
  ['4', 'Umm al-Qura, Makkah'],
  ['5', 'Egyptian General Authority of Survey'],
  ['15', 'Moonsighting Committee Worldwide'],
  ['8', 'Gulf Region'],
  ['9', 'Kuwait'],
  ['10', 'Qatar'],
  ['16', 'Dubai'],
  ['11', 'Majlis Ugama Islam Singapura'],
  ['17', 'JAKIM (Malaysia)'],
  ['20', 'KEMENAG (Indonesia)'],
  ['13', 'Diyanet (Turkey)'],
  ['12', 'UOIF (France)'],
  ['14', 'Spiritual Administration of Muslims of Russia'],
  ['18', 'Tunisia'],
  ['19', 'Algeria'],
  ['21', 'Morocco'],
  ['22', 'Comunidade Islamica de Lisboa'],
  ['23', 'Jordan'],
  ['7', 'Institute of Geophysics, Tehran'],
  ['0', 'Shia Ithna-Ashari (Jafari)'],
];

const ICONS = {
  dawn: '<path d="M3 18h18"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 4l.6 1.4L14 6l-1.4.6L12 8l-.6-1.4L10 6l1.4-.6z"/><path d="M5 22h14"/>',
  sunrise: '<path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 2v7"/><path d="M4.2 10.2l1.4 1.4"/><path d="M1 18h2"/><path d="M21 18h2"/><path d="M18.4 11.6l1.4-1.4"/><path d="M23 22H1"/><path d="M8 6l4-4 4 4"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  sunLow: '<circle cx="10" cy="10" r="3.5"/><path d="M10 2.5v1.5M3.5 10H2M4.7 4.7l1 1M15.3 4.7l-1 1"/><path d="M8.5 20h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4 1.6A2.7 2.7 0 0 0 8.5 20z"/>',
  sunset: '<path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 9V2"/><path d="M4.2 10.2l1.4 1.4"/><path d="M1 18h2"/><path d="M21 18h2"/><path d="M18.4 11.6l1.4-1.4"/><path d="M23 22H1"/><path d="M16 5l-4 4-4-4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/><path d="M17 3.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z"/>',
};

const PRAYERS = [
  { key: 'Fajr', ar: 'الفجر', icon: 'dawn' },
  { key: 'Sunrise', ar: 'الشروق', icon: 'sunrise', minor: true },
  { key: 'Dhuhr', ar: 'الظهر', icon: 'sun' },
  { key: 'Asr', ar: 'العصر', icon: 'sunLow' },
  { key: 'Maghrib', ar: 'المغرب', icon: 'sunset' },
  { key: 'Isha', ar: 'العشاء', icon: 'moon' },
];

/* ------------------------------------------------------------------ */
/* State & helpers                                                     */
/* ------------------------------------------------------------------ */

const state = {
  settings: { ...DEFAULT_SETTINGS },
  location: null,
  data: null,        // AlAdhan "data" object for today
  dayKey: null,
  currentKey: null,
  loading: false,
};

const $ = (id) => document.getElementById(id);

const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: carry on without caching */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

const pad = (n) => String(n).padStart(2, '0');

function dateKey(date) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Turns an AlAdhan "HH:MM" string (sometimes with a " (TZ)" suffix) into a Date on `base`'s day. */
function parseTime(value, base) {
  const match = /(\d{1,2}):(\d{2})/.exec(value || '');
  if (!match) return null;
  const d = new Date(base);
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return d;
}

function formatTime(date) {
  if (!date) return '—';
  const h = date.getHours();
  const m = pad(date.getMinutes());
  if (state.settings.clock === '24') return `${pad(h)}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function isFriday(date) {
  return date.getDay() === 5;
}

function prayerLabel(prayer, date) {
  if (prayer.key === 'Dhuhr' && isFriday(date)) return { name: 'Jumuʿah', ar: 'الجمعة' };
  return { name: prayer.key, ar: prayer.ar };
}

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function qiblaBearing(from) {
  const phi1 = toRad(from.lat);
  const phi2 = toRad(KAABA.lat);
  const dLon = toRad(KAABA.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function compassPoint(deg) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(deg / 22.5) % 16];
}

function formatCoords(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

function placeName(result) {
  const a = (result && result.address) || {};
  const city = a.city || a.town || a.village || a.municipality || a.suburb || a.county || a.state || result.name || '';
  const country = a.country || '';
  const parts = [city, country].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return (result && result.display_name ? result.display_name.split(',').slice(0, 2).join(',') : '').trim();
}

class FriendlyError extends Error {
  constructor(title, message, { canSetManual = false } = {}) {
    super(message);
    this.title = title;
    this.canSetManual = canSetManual;
  }
}

/* ------------------------------------------------------------------ */
/* Network                                                             */
/* ------------------------------------------------------------------ */

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new FriendlyError('Location unavailable', 'This browser does not support location. Set your city manually.', { canSetManual: true }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new FriendlyError('Location access denied', 'Allow location access for this extension, or set your city manually.', { canSetManual: true }));
      } else {
        reject(new FriendlyError('Could not find your location', 'Check your connection and try again, or set your city manually.', { canSetManual: true }));
      }
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 });
  });
}

async function reverseGeocode(lat, lon) {
  const lang = encodeURIComponent(navigator.language || 'en');
  const data = await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1&accept-language=${lang}`
  );
  return placeName(data) || formatCoords(lat, lon);
}

async function searchCity(query) {
  const lang = encodeURIComponent(navigator.language || 'en');
  const results = await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=${lang}&q=${encodeURIComponent(query)}`
  );
  if (!Array.isArray(results) || !results.length) return null;
  const r = results[0];
  return { lat: Number(r.lat), lon: Number(r.lon), name: placeName(r) || query };
}

async function locateDevice() {
  const pos = await getPosition();
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const previous = store.get(STORAGE_KEYS.location);

  // Reuse the saved place name if we haven't really moved, to avoid an extra lookup.
  let name;
  if (previous && previous.name && distanceKm(previous, { lat, lon }) < 1) {
    name = previous.name;
  } else {
    name = await reverseGeocode(lat, lon).catch(() => formatCoords(lat, lon));
  }

  const loc = { lat, lon, name, ts: Date.now() };
  store.set(STORAGE_KEYS.location, loc);
  return loc;
}

function timingsCacheKey(loc, date) {
  const { method, school } = state.settings;
  return [dateKey(date), loc.lat.toFixed(3), loc.lon.toFixed(3), method, school].join('|');
}

async function getTimings(loc) {
  const today = new Date();
  const key = timingsCacheKey(loc, today);
  const cached = store.get(STORAGE_KEYS.timings);
  if (cached && cached.key === key && cached.data) return cached.data;

  showSkeleton();
  const { method, school } = state.settings;
  let url = `https://api.aladhan.com/v1/timings/${dateKey(today)}?latitude=${loc.lat}&longitude=${loc.lon}&school=${school}`;
  if (method !== '') url += `&method=${method}`;

  let json;
  try {
    json = await fetchJson(url);
  } catch {
    throw new FriendlyError('Could not load prayer times', 'The prayer times service did not respond. Check your connection and try again.');
  }
  if (!json || json.code !== 200 || !json.data || !json.data.timings) {
    throw new FriendlyError('Could not load prayer times', 'The prayer times service returned an unexpected response.');
  }

  store.set(STORAGE_KEYS.timings, { key, data: json.data });
  return json.data;
}

/* ------------------------------------------------------------------ */
/* Loading flow                                                        */
/* ------------------------------------------------------------------ */

async function loadData({ forceLocate = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  hideStatus();
  $('refreshBtn').classList.add('is-spinning');

  try {
    let loc;
    if (state.settings.manual) {
      loc = state.settings.manual;
    } else {
      const cached = store.get(STORAGE_KEYS.location);
      if (cached && !forceLocate) {
        loc = cached;
        if (Date.now() - (cached.ts || 0) > LOCATION_MAX_AGE_MS) refreshLocationQuietly(cached);
      } else {
        setText('locationName', 'Locating…');
        if (!state.data) showSkeleton();
        loc = await locateDevice();
      }
    }
    await showForLocation(loc);
  } catch (err) {
    showError(err);
  } finally {
    state.loading = false;
    $('refreshBtn').classList.remove('is-spinning');
  }
}

async function refreshLocationQuietly(previous) {
  try {
    const loc = await locateDevice();
    if (!state.settings.manual && distanceKm(previous, loc) > MOVE_THRESHOLD_KM) {
      await showForLocation(loc);
    }
  } catch {
    /* keep showing the saved location */
  }
}

async function showForLocation(loc) {
  state.location = loc;
  setText('locationName', loc.name || formatCoords(loc.lat, loc.lon));
  renderQibla(loc);
  const data = await getTimings(loc);
  applyData(data);
}

function applyData(data) {
  state.data = data;
  state.dayKey = dateKey(new Date());
  state.currentKey = null;
  hideStatus();
  renderDates(data.date);
  renderList();
  renderNight(data.timings);
  const methodName = data.meta && data.meta.method && data.meta.method.name;
  const school = state.settings.school === '1' ? 'Hanafi Asr' : 'Standard Asr';
  setText('methodName', methodName ? `${methodName} · ${school}` : school);
  tick();
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function computeSchedule(now) {
  const timings = state.data.timings;
  const events = PRAYERS.map((p) => ({ ...p, at: parseTime(timings[p.key], now) }));

  let idx = -1;
  events.forEach((e, i) => {
    if (e.at && e.at <= now) idx = i;
  });

  const last = events[events.length - 1];
  const first = events[0];
  let current;
  let next;
  if (idx === -1) {
    // After midnight, before Fajr: still in yesterday's Isha.
    current = { ...last, at: addDays(last.at, -1) };
    next = first;
  } else {
    current = events[idx];
    next = idx < events.length - 1 ? events[idx + 1] : { ...first, at: addDays(first.at, 1) };
  }
  return { events, idx, current, next };
}

function renderDates(date) {
  const now = new Date();
  setText('gregorianDate', now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
  const h = date && date.hijri;
  if (h) {
    setText('hijriDate', `${Number(h.day)} ${h.month.en} ${h.year} AH`);
    $('hijriDate').title = `${h.day} ${h.month.ar} ${h.year}`;
  } else {
    setText('hijriDate', '');
  }
}

function renderList() {
  const now = new Date();
  const timings = state.data.timings;
  $('prayerList').innerHTML = PRAYERS.map((p) => {
    const label = prayerLabel(p, now);
    return `
      <li class="prayer${p.minor ? ' is-minor' : ''}" data-key="${p.key}">
        <span class="p-icon">${iconSvg(p.icon)}</span>
        <span class="p-names">
          <span class="p-name">${label.name}</span>
          <span class="p-ar ar" lang="ar">${label.ar}</span>
        </span>
        <span class="p-meta">
          <span class="p-time">${formatTime(parseTime(timings[p.key], now))}</span>
          <span class="p-ends"></span>
        </span>
        <span class="p-progress"><span class="p-bar"></span></span>
      </li>`;
  }).join('');
}

function showSkeleton() {
  $('prayerList').innerHTML = PRAYERS.map(() => `
    <li class="prayer is-skeleton">
      <span class="p-icon"></span>
      <span class="p-names"><span class="p-name">&nbsp;</span></span>
      <span class="p-meta"><span class="p-time">&nbsp;</span></span>
    </li>`).join('');
}

function renderNight(timings) {
  const now = new Date();
  setText('imsakTime', formatTime(parseTime(timings.Imsak, now)));
  // Midnight and the last third usually fall after 00:00, i.e. tomorrow's date, but the clock time is what matters.
  setText('midnightTime', formatTime(parseTime(timings.Midnight, now)));
  setText('lastThirdTime', formatTime(parseTime(timings.Lastthird, now)));
}

function renderQibla(loc) {
  const bearing = qiblaBearing(loc);
  $('qiblaNeedle').style.transform = `rotate(${bearing}deg)`;
  setText('qiblaBearing', `${Math.round(bearing)}° ${compassPoint(bearing)}`);
  const km = distanceKm(loc, KAABA);
  setText('qiblaDistance', `${Math.round(km).toLocaleString()} km away`);
  $('qiblaDistance').title = `${Math.round(km).toLocaleString()} km to the Kaaba in Makkah`;
}

function tick() {
  if (!state.data) return;
  const now = new Date();

  // The day rolled over while the popup was open: load the new day's times.
  if (dateKey(now) !== state.dayKey) {
    state.dayKey = dateKey(now);
    if (state.location) showForLocation(state.location).catch(showError);
    return;
  }

  const { idx, current, next } = computeSchedule(now);
  const nextLabel = prayerLabel(next, next.at);

  setText('nextName', nextLabel.name);
  setText('nextArabic', nextLabel.ar);
  setText('countdown', formatCountdown(next.at - now));
  setText('nextTime', `· ${formatTime(next.at)}`);

  const rows = $('prayerList').querySelectorAll('.prayer');
  if (current.key !== state.currentKey) {
    state.currentKey = current.key;
    rows.forEach((row, i) => {
      row.classList.toggle('is-current', row.dataset.key === current.key);
      row.classList.toggle('is-past', idx !== -1 && i < idx);
    });
  }

  const row = $('prayerList').querySelector('.prayer.is-current');
  if (row) {
    const span = next.at - current.at;
    const pct = span > 0 ? Math.min(100, Math.max(0, ((now - current.at) / span) * 100)) : 0;
    row.querySelector('.p-bar').style.width = `${pct}%`;
    row.querySelector('.p-ends').textContent = `${formatDuration(next.at - now)} left`;
  }
}

function showStatus(title, message, { canSetManual = false } = {}) {
  setText('statusTitle', title);
  setText('statusMessage', message);
  $('manualBtn').hidden = !canSetManual;
  $('status').hidden = false;
}

function hideStatus() {
  $('status').hidden = true;
}

function showError(err) {
  console.error(err);
  if (!state.data) {
    $('prayerList').innerHTML = '';
    setText('countdown', '--:--:--');
  }
  if (!state.location) setText('locationName', 'Location unknown');
  if (err instanceof FriendlyError) {
    showStatus(err.title, err.message, { canSetManual: err.canSetManual });
  } else {
    showStatus('Something went wrong', 'Please try again in a moment.', { canSetManual: true });
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function loadSettings() {
  const saved = store.get(STORAGE_KEYS.settings);
  state.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
}

function saveSettings() {
  store.set(STORAGE_KEYS.settings, state.settings);
}

function renderSettingsForm() {
  const select = $('methodSelect');
  select.innerHTML = '';
  METHODS.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  });
  select.value = state.settings.method;

  document.querySelectorAll('input[name="school"]').forEach((input) => {
    input.checked = input.value === state.settings.school;
  });
  document.querySelectorAll('input[name="clock"]').forEach((input) => {
    input.checked = input.value === state.settings.clock;
  });
  renderLocationMode();
}

function renderLocationMode() {
  const manual = state.settings.manual;
  setText('locationMode', manual ? `Using ${manual.name}.` : 'Using your device location.');
  $('useDeviceBtn').hidden = !manual;
}

function openSettings() {
  renderSettingsForm();
  $('cityError').hidden = true;
  $('settings').hidden = false;
  $('methodSelect').focus();
}

function closeSettings() {
  $('settings').hidden = true;
  $('settingsBtn').focus();
}

function reloadTimings() {
  if (state.location) {
    showForLocation(state.location).catch(showError);
  } else {
    loadData();
  }
}

function bindEvents() {
  $('settingsBtn').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);
  $('manualBtn').addEventListener('click', () => {
    openSettings();
    $('cityInput').focus();
  });
  $('retryBtn').addEventListener('click', () => loadData({ forceLocate: !state.settings.manual }));

  $('refreshBtn').addEventListener('click', () => {
    store.remove(STORAGE_KEYS.timings);
    loadData({ forceLocate: !state.settings.manual });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('settings').hidden) {
      e.preventDefault();
      closeSettings();
    }
  });

  $('methodSelect').addEventListener('change', (e) => {
    state.settings.method = e.target.value;
    saveSettings();
    reloadTimings();
  });

  document.querySelectorAll('input[name="school"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.settings.school = input.value;
      saveSettings();
      reloadTimings();
    });
  });

  document.querySelectorAll('input[name="clock"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.settings.clock = input.value;
      saveSettings();
      if (state.data) applyData(state.data);
    });
  });

  $('cityForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = $('cityInput').value.trim();
    const errorEl = $('cityError');
    errorEl.hidden = true;
    if (!query) return;

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = '…';
    try {
      const place = await searchCity(query);
      if (!place) {
        errorEl.textContent = `No place found for “${query}”.`;
        errorEl.hidden = false;
        return;
      }
      state.settings.manual = place;
      saveSettings();
      $('cityInput').value = '';
      renderLocationMode();
      closeSettings();
      loadData();
    } catch {
      errorEl.textContent = 'Search failed. Check your connection and try again.';
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Set';
    }
  });

  $('useDeviceBtn').addEventListener('click', () => {
    state.settings.manual = null;
    saveSettings();
    renderLocationMode();
    closeSettings();
    loadData({ forceLocate: true });
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  renderSettingsForm();
  bindEvents();
  loadData();
  setInterval(tick, 1000);
});
