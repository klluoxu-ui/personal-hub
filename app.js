const KEY = "personal-hub-v1";
const DAYS = ["日", "一", "二", "三", "四", "五", "六"];

const emptyState = () => ({
  astro: [],
  shifts: [],
  memos: [],
  sites: [],
  zomboid: [],
  games: [],
  reminders: [],
  workouts: [],
});

let state = load();
let sheet = null;

function load() {
  try {
    return { ...emptyState(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return emptyState();
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(value) {
  if (!value) return "未填日期";
  const [y, m, d] = value.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function parts() {
  return location.hash.replace(/^#/, "").split("/").filter(Boolean);
}

function route() {
  const segs = parts();
  return { path: segs[0] || "home", tab: segs[1], id: segs[2], segs };
}

function go(to) {
  location.hash = to;
}

function byDateDesc(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

function todayShift() {
  return state.shifts.find((item) => item.date === today());
}

let shiftImport = null;
let calendarCursor = today().slice(0, 7);
const SHIFT_NAME_KEY = "personal-hub-shift-name";
const XLSX_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
const MONTH_EN = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const MONTH_CN = { 正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function isRest(shift) {
  return shift === "休息";
}

const DARK_THRESHOLD_KEY = "personal-hub-dark-threshold";
const ASTRO_LOC_KEY = "personal-hub-astro-location";
const CLOUD_CACHE_KEY = "personal-hub-cloud-cache";
const DARK_HORIZON_DAYS = 60;
const CLOUD_FORECAST_DAYS = 16;
const CLOUD_CLEAR_MAX = 40;
/** Full-enough moon to list as a lunar shoot night. */
const MOON_SHOOT_MIN = 0.9;
const CLOUD_CACHE_MS = 6 * 60 * 60 * 1000;
const TWT_SCHEME = "twtapp://";
const TWT_ANDROID_INTENT = "intent://open#Intent;scheme=twtapp;package=com.twtapp;end";
const TWT_SITE = "https://twtapp.com/";
const LEAFLET_CSS = "https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.css";
const LEAFLET_JS = "https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.js";
const GAODE_TILE =
  "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
const SYNODIC_MONTH = 29.530588853;
/** Known new moon near J2000: 2000-01-06 18:14 UTC */
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/** @type {{ status: string, error: string|null }} */
let cloudState = { status: "idle", error: null };
let cityHits = null;
let cityQuery = "";
let citySearching = false;
/** @type {{ lat: number, lon: number, name: string } | null} */
let mapPicker = null;
let astroMap = null;
let astroMarker = null;
let geoWatchId = null;
let geoTimer = null;
let geoActive = false;
let astroAccuracy = null;
let mapStatusText = "";

const ASTRO_PLACES = [
  { keys: ["凯里市", "凯里"], name: "凯里市 · 贵州黔东南", lat: 26.57105, lon: 107.97695 },
  {
    keys: ["雷公山风景区", "雷公山景区", "雷公山国家级自然保护区", "雷公山"],
    name: "雷公山风景区 · 贵州雷山",
    lat: 26.38722,
    lon: 108.20255,
  },
  { keys: ["南山区", "深圳南山", "南山"], name: "南山区 · 深圳", lat: 22.53332, lon: 113.93037 },
];

const GEO_KEEP = new Set(["place", "boundary", "natural", "tourism", "leisure", "peak"]);

function getDarkThreshold() {
  return localStorage.getItem(DARK_THRESHOLD_KEY) === "0.5" ? 0.5 : 0.3;
}

function setDarkThreshold(value) {
  localStorage.setItem(DARK_THRESHOLD_KEY, value === 0.5 ? "0.5" : "0.3");
}

function getAstroLocation() {
  try {
    const loc = JSON.parse(localStorage.getItem(ASTRO_LOC_KEY) || "null");
    if (loc && typeof loc.lat === "number" && typeof loc.lon === "number") return loc;
  } catch {
    /* ignore */
  }
  return null;
}

function setAstroLocation(loc) {
  localStorage.setItem(ASTRO_LOC_KEY, JSON.stringify(loc));
  localStorage.removeItem(CLOUD_CACHE_KEY);
  cloudState = { status: "idle", error: null };
  cityHits = null;
  ensureCloudForecast();
}

function parseIsoDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDaysIso(iso, days) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Moon age in days (0 = new moon) for a local calendar date at local noon. */
function moonAgeDays(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const noonLocal = new Date(y, m - 1, d, 12, 0, 0);
  let age = ((noonLocal.getTime() - KNOWN_NEW_MOON_MS) / 86400000) % SYNODIC_MONTH;
  if (age < 0) age += SYNODIC_MONTH;
  return age;
}

/** Illuminated fraction 0–1 (0 ≈ new, 1 ≈ full). */
function moonIllumination(iso) {
  const age = moonAgeDays(iso);
  return (1 - Math.cos((2 * Math.PI * age) / SYNODIC_MONTH)) / 2;
}

function moonPhaseLabel(iso) {
  const age = moonAgeDays(iso);
  const phase = age / SYNODIC_MONTH;
  if (phase < 0.03 || phase >= 0.97) return "新月";
  if (phase < 0.22) return "蛾眉月";
  if (phase < 0.28) return "上弦";
  if (phase < 0.47) return "盈凸月";
  if (phase < 0.53) return "满月";
  if (phase < 0.72) return "亏凸月";
  if (phase < 0.78) return "下弦";
  return "残月";
}

function fmtIllum(illum) {
  return `${Math.round(illum * 100)}%`;
}

function fmtCloud(cloud) {
  if (cloud == null) return "无云量";
  return `云量 ${Math.round(cloud)}%`;
}

function shiftForDate(iso) {
  return state.shifts.find((item) => item.date === iso);
}

function loadCloudCache() {
  const loc = getAstroLocation();
  if (!loc) return null;
  try {
    const data = JSON.parse(localStorage.getItem(CLOUD_CACHE_KEY) || "null");
    if (!data?.byNight) return null;
    if (Math.abs(data.lat - loc.lat) > 0.01 || Math.abs(data.lon - loc.lon) > 0.01) return null;
    if (Date.now() - Number(data.fetchedAt || 0) > CLOUD_CACHE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function nightCloudAvg(iso) {
  const cache = loadCloudCache();
  if (!cache) return null;
  const value = cache.byNight[iso];
  return typeof value === "number" ? value : null;
}

/** Aggregate 21:00–03:00 cloud cover for each evening date. */
function aggregateNightCloud(times, covers) {
  const buckets = {};
  times.forEach((stamp, index) => {
    const cover = covers[index];
    if (cover == null) return;
    const [datePart, timePart] = stamp.split("T");
    const hour = Number((timePart || "").slice(0, 2));
    if (Number.isNaN(hour)) return;
    let nightDate = datePart;
    if (hour <= 3) nightDate = addDaysIso(datePart, -1);
    else if (hour < 21) return;
    if (!buckets[nightDate]) buckets[nightDate] = [];
    buckets[nightDate].push(cover);
  });
  const byNight = {};
  Object.entries(buckets).forEach(([date, values]) => {
    byNight[date] = values.reduce((sum, n) => sum + n, 0) / values.length;
  });
  return byNight;
}

async function ensureCloudForecast() {
  const loc = getAstroLocation();
  if (!loc) {
    cloudState = { status: "idle", error: null };
    return;
  }
  if (loadCloudCache()) {
    cloudState = { status: "ready", error: null };
    return;
  }
  if (cloudState.status === "loading") return;
  cloudState = { status: "loading", error: null };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&hourly=cloud_cover&forecast_days=${CLOUD_FORECAST_DAYS}&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("meteo");
    const json = await res.json();
    const times = json.hourly?.time || [];
    const covers = json.hourly?.cloud_cover || [];
    const byNight = aggregateNightCloud(times, covers);
    localStorage.setItem(
      CLOUD_CACHE_KEY,
      JSON.stringify({ lat: loc.lat, lon: loc.lon, fetchedAt: Date.now(), byNight })
    );
    cloudState = { status: "ready", error: null };
    render();
  } catch {
    cloudState = { status: "error", error: "云量预报暂时读不到。" };
    render();
  }
}

function placeKeyMatches(query, key) {
  return query.includes(key) || (query.length >= 2 && key.startsWith(query));
}

function matchAstroPlaces(query) {
  return ASTRO_PLACES.filter((place) => place.keys.some((key) => placeKeyMatches(query, key))).map((place) => ({
    name: place.name,
    lat: place.lat,
    lon: place.lon,
  }));
}

function stripPlaceSuffix(query) {
  return query
    .replace(/国家级自然保护区|自然保护区|风景名胜区|风景区|景区/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function regionHint(query) {
  const match = query.match(
    /北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门|深圳|黔东南|黔南|黔西南|雷山|凯里/
  );
  return match ? match[0] : "";
}

function nominatimQueries(query) {
  const stripped = stripPlaceSuffix(query);
  const region = regionHint(query);
  const list = [query];
  if (stripped && stripped !== query) {
    list.push(region && !stripped.includes(region) ? `${stripped} ${region}` : stripped);
  }
  const tail = (stripped || query).match(/([\u4e00-\u9fff]{2}(?:市|县))$/);
  if (tail) list.push(tail[1]);
  return [...new Set(list.filter(Boolean))];
}

function geoHitKey(hit) {
  return `${hit.name}|${hit.lat.toFixed(3)}|${hit.lon.toFixed(3)}`;
}

function mergeGeoHits(...groups) {
  const seen = new Set();
  const out = [];
  groups.flat().forEach((hit) => {
    if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) return;
    const key = geoHitKey(hit);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(hit);
  });
  return out;
}

function formatNominatimName(item) {
  const addr = item.address || {};
  const title = item.name || item.display_name?.split(",")[0] || "地点";
  const area = [addr.state, addr.city || addr.county || addr.town].filter(Boolean);
  const uniq = area.filter((part, index) => part !== title && area.indexOf(part) === index);
  return uniq.length ? `${title} · ${uniq.join(" ")}` : title;
}

function usefulNominatim(item, cores) {
  const category = item.category || "";
  const type = item.type || "";
  const name = `${item.name || ""} ${item.display_name || ""}`;
  const related = cores.some((core) => core.length >= 2 && name.includes(core));
  if (!related) return false;
  if (GEO_KEEP.has(category) || GEO_KEEP.has(type)) return true;
  return related && !["building", "highway", "landuse", "shop", "office", "amenity"].includes(category);
}

async function fetchNominatim(term) {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(term)}` +
    `&format=jsonv2&limit=8&accept-language=zh&countrycodes=cn&addressdetails=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("geo");
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function searchCity(query) {
  const q = String(query || "").trim();
  cityQuery = q;
  if (!q) {
    cityHits = [];
    citySearching = false;
    render();
    return;
  }
  citySearching = true;
  render();
  const aliases = matchAstroPlaces(q);
  const cores = [...new Set([q, stripPlaceSuffix(q), ...q.match(/[\u4e00-\u9fff]{2,}/g) || []])];
  try {
    const remote = [];
    const terms = nominatimQueries(q).slice(0, 2);
    for (let i = 0; i < terms.length; i += 1) {
      if (i) await new Promise((resolve) => setTimeout(resolve, 1100));
      const rows = await fetchNominatim(terms[i]);
      rows.forEach((item) => {
        if (!usefulNominatim(item, cores)) return;
        remote.push({
          name: formatNominatimName(item),
          lat: Number(item.lat),
          lon: Number(item.lon),
        });
      });
      if (mergeGeoHits(aliases, remote).length >= 3) break;
    }
    cityHits = mergeGeoHits(aliases, remote).slice(0, 8);
  } catch {
    cityHits = aliases.length ? aliases : [];
    if (!cityHits.length) alert("地点搜索失败。");
  }
  citySearching = false;
  render();
}

function locateAstro() {
  openMapPicker();
  panMapToMe();
}

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = resolve;
    script.onerror = () => reject(new Error("leaflet"));
    document.head.appendChild(script);
  });
}

function openMapPicker() {
  const loc = getAstroLocation();
  mapPicker = {
    lat: loc?.lat ?? 26.57105,
    lon: loc?.lon ?? 107.97695,
    name: loc?.name || "凯里市 · 贵州黔东南",
    allowConfirm: true,
  };
  render();
}

function stopGeoWatch() {
  geoActive = false;
  if (geoWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(geoWatchId);
  }
  geoWatchId = null;
  if (geoTimer != null) clearTimeout(geoTimer);
  geoTimer = null;
}

function clearAccuracyCircle() {
  if (astroAccuracy && astroMap) astroMap.removeLayer(astroAccuracy);
  astroAccuracy = null;
}

function closeMapPicker() {
  stopGeoWatch();
  clearAccuracyCircle();
  if (astroMap) {
    astroMap.remove();
    astroMap = null;
  }
  astroMarker = null;
  mapPicker = null;
  mapStatusText = "";
}

function outOfChina(lat, lon) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function gcjDelta(lat, lon) {
  const x = lon - 105;
  const y = lat - 35;
  let dLat =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  dLat += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  dLat += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  dLat += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  let dLon = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dLon += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  dLon += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  dLon += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  const radLat = (lat / 180) * Math.PI;
  const magic = 1 - 0.006693421622965943 * Math.sin(radLat) * Math.sin(radLat);
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((6378245 * (1 - 0.006693421622965943)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180) / ((6378245 / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { dLat, dLon };
}

function wgs84ToGcj02(lat, lon) {
  if (outOfChina(lat, lon)) return { lat, lon };
  const { dLat, dLon } = gcjDelta(lat, lon);
  return { lat: lat + dLat, lon: lon + dLon };
}

function gcj02ToWgs84(lat, lon) {
  if (outOfChina(lat, lon)) return { lat, lon };
  const { dLat, dLon } = gcjDelta(lat, lon);
  return { lat: lat - dLat, lon: lon - dLon };
}

function setMapMarker(latWgs, lonWgs, zoom) {
  if (!astroMap || !window.L) return;
  const gcj = wgs84ToGcj02(latWgs, lonWgs);
  if (astroMarker) astroMarker.setLatLng([gcj.lat, gcj.lon]);
  const nextZoom = zoom == null ? Math.max(astroMap.getZoom(), 12) : zoom;
  astroMap.setView([gcj.lat, gcj.lon], nextZoom);
}

function setAccuracyCircle(latWgs, lonWgs, radiusM) {
  if (!astroMap || !window.L) return;
  const gcj = wgs84ToGcj02(latWgs, lonWgs);
  const radius = Math.max(Number(radiusM) || 0, 20);
  if (astroAccuracy) {
    astroAccuracy.setLatLng([gcj.lat, gcj.lon]);
    astroAccuracy.setRadius(radius);
    return;
  }
  astroAccuracy = window.L.circle([gcj.lat, gcj.lon], {
    radius,
    color: "#4d7ec8",
    weight: 1,
    fillColor: "#4d7ec8",
    fillOpacity: 0.12,
  }).addTo(astroMap);
}

async function reversePlaceName(lat, lon) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}` +
      `&format=jsonv2&accept-language=zh&zoom=14`;
    const res = await fetch(url);
    if (!res.ok) return "";
    const json = await res.json();
    const addr = json.address || {};
    const title = json.name || addr.tourism || addr.peak || addr.village || addr.town || addr.city || addr.county || "";
    const area = [addr.state, addr.city || addr.county].filter((part) => part && part !== title);
    return [title, ...area].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

function setMapStatus(text) {
  mapStatusText = text || "";
  const el = document.querySelector("[data-map-status]");
  if (el) el.textContent = mapStatusText;
}

function updateMapPickerMeta() {
  const el = document.querySelector("[data-map-meta]");
  if (!el || !mapPicker) return;
  el.textContent = `${mapPicker.lat.toFixed(4)}, ${mapPicker.lon.toFixed(4)} · ${mapPicker.name || "地图选点"}`;
  const confirm = document.querySelector("[data-map-confirm]");
  if (confirm) confirm.disabled = mapPicker.allowConfirm === false;
}

async function applyMapPoint(lat, lon, fallbackName, opts = {}) {
  if (!mapPicker) return;
  mapPicker.lat = lat;
  mapPicker.lon = lon;
  mapPicker.name = fallbackName || "地图选点";
  mapPicker.allowConfirm = opts.allowConfirm !== false;
  const acc = Number(opts.accuracy);
  if (Number.isFinite(acc) && acc > 0) setAccuracyCircle(lat, lon, acc);
  else clearAccuracyCircle();
  setMapMarker(lat, lon, opts.zoom);
  updateMapPickerMeta();
  if (opts.skipReverse) return;
  const name = await reversePlaceName(lat, lon);
  if (mapPicker) {
    mapPicker.name = name || fallbackName || "地图选点";
    updateMapPickerMeta();
  }
}

async function mountAstroMap() {
  const el = document.getElementById("astro-map");
  if (!el || !mapPicker) return;
  try {
    await loadLeaflet();
  } catch {
    el.innerHTML = `<p class="meta">地图加载失败，请改用地点搜索，例如「南山区」。</p>`;
    return;
  }
  if (astroMap) {
    astroMap.remove();
    astroMap = null;
    astroMarker = null;
    astroAccuracy = null;
  }
  const gcj = wgs84ToGcj02(mapPicker.lat, mapPicker.lon);
  const map = window.L.map(el, { zoomControl: true }).setView([gcj.lat, gcj.lon], 12);
  window.L.tileLayer(GAODE_TILE, {
    maxZoom: 18,
    minZoom: 4,
    subdomains: ["1", "2", "3", "4"],
    attribution: "高德地图",
  }).addTo(map);
  astroMarker = window.L.circleMarker([gcj.lat, gcj.lon], {
    radius: 9,
    color: "#4d7ec8",
    fillColor: "#4d7ec8",
    fillOpacity: 0.9,
  }).addTo(map);
  map.on("click", (event) => {
    stopGeoWatch();
    const wgs = gcj02ToWgs84(event.latlng.lat, event.latlng.lng);
    applyMapPoint(wgs.lat, wgs.lon, "地图选点", { zoom: 16, allowConfirm: true });
    setMapStatus("已用你点的位置。");
  });
  astroMap = map;
  setTimeout(() => map.invalidateSize(), 80);
}

function mapPickerHtml() {
  if (!mapPicker) return "";
  return `
    <div class="sheet">
      <div class="map-picker">
        <div class="toolbar"><h2>地图选点</h2><button type="button" class="ghost" data-close>关闭</button></div>
        <p class="meta">底图是高德。直接点地图选观测点。苹果地图/高德 App 选完无法把坐标送回这个网页，所以那两个按钮已去掉。</p>
        <div id="astro-map" class="astro-map"></div>
        <p class="meta" data-map-meta>${mapPicker.lat.toFixed(4)}, ${mapPicker.lon.toFixed(4)} · ${esc(mapPicker.name || "地图选点")}</p>
        <p class="meta map-status" data-map-status>${esc(mapStatusText)}</p>
        <div class="actions">
          <button class="secondary" type="button" data-map-locate>定位到我</button>
          <button class="primary" type="button" data-map-confirm ${mapPicker.allowConfirm === false ? "disabled" : ""}>使用此点</button>
        </div>
      </div>
    </div>
  `;
}

function geoAccuracy(pos) {
  return Math.round(Number(pos?.coords?.accuracy) || 0);
}

function panMapToMe() {
  if (!navigator.geolocation) {
    setMapStatus("当前浏览器不给定位。请在图上点选，或先搜索「南山区」。");
    return;
  }
  stopGeoWatch();
  geoActive = true;
  setMapStatus("正在等精确 GPS。室内或基站定位常会落到福田，请稍候或直接点南山区。");
  let best = null;
  const preview = (pos) => {
    const acc = geoAccuracy(pos);
    applyMapPoint(pos.coords.latitude, pos.coords.longitude, `粗定位（约 ${acc} 米），请再点选`, {
      skipReverse: true,
      accuracy: acc,
      zoom: acc > 800 ? 12 : 14,
      allowConfirm: false,
    });
    setMapStatus(`还在等 GPS（当前约 ${acc} 米）。若停在福田，不要点「使用此点」，请再点到实际位置。`);
  };
  const accept = (pos) => {
    if (!geoActive) return;
    stopGeoWatch();
    const acc = geoAccuracy(pos);
    const precise = acc <= 80;
    applyMapPoint(
      pos.coords.latitude,
      pos.coords.longitude,
      precise ? "当前位置" : `当前位置（精度约 ${acc} 米）`,
      { skipReverse: !precise, accuracy: acc, zoom: precise ? 16 : 14, allowConfirm: true }
    );
    if (precise) setMapStatus(`已定位，精度约 ${acc} 米。`);
    else setMapStatus(`定位仍偏粗（约 ${acc} 米），南山和福田可能分不清。请再点到你所在位置。`);
  };
  const finishCoarse = () => {
    if (!geoActive) return;
    stopGeoWatch();
    if (best) {
      preview(best);
      setMapStatus("没有收到精确 GPS。请在高德图上点到实际位置，或先搜索「南山区」。");
      return;
    }
    setMapStatus("没有收到精确 GPS。请在高德图上点到实际位置，或先搜索「南山区」。");
  };
  geoTimer = setTimeout(() => {
    if (best && geoAccuracy(best) <= 250) accept(best);
    else finishCoarse();
  }, 18000);
  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!geoActive) return;
      if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
      if (pos.coords.accuracy <= 60) accept(pos);
      else preview(pos);
    },
    (err) => {
      if (!geoActive) return;
      if (best && geoAccuracy(best) <= 250) {
        accept(best);
        return;
      }
      if (err && err.code === 1) {
        stopGeoWatch();
        setMapStatus("没有定位权限。请点地图，或先搜索「南山区」。");
        return;
      }
      finishCoarse();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

function confirmMapPicker() {
  if (!mapPicker || mapPicker.allowConfirm === false) return;
  setAstroLocation({
    name: mapPicker.name || "地图选点",
    lat: mapPicker.lat,
    lon: mapPicker.lon,
  });
  closeMapPicker();
  render();
}

function openTwtApp(event) {
  event.preventDefault();
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isAndroid) {
    location.href = TWT_ANDROID_INTENT;
    return;
  }
  if (isIOS) {
    location.href = TWT_SCHEME;
    return;
  }
  window.open(TWT_SITE, "_blank", "noopener,noreferrer");
}

function nightTarget(iso, threshold = getDarkThreshold(), illum = moonIllumination(iso)) {
  if (illum <= threshold) return "deep";
  if (illum >= MOON_SHOOT_MIN) return "moon";
  return null;
}

/**
 * Classify a shoot night against cloud + roster.
 * target: deep | moon
 * kind: outing | busy | candidate
 * sky: clear | cloudy | unknown
 */
function classifyShootNight(iso, illum = moonIllumination(iso), target = nightTarget(iso, getDarkThreshold(), illum)) {
  const rec = shiftForDate(iso);
  const cloud = nightCloudAvg(iso);
  const sky = cloud == null ? "unknown" : cloud <= CLOUD_CLEAR_MAX ? "clear" : "cloudy";
  const rest = rec && isRest(rec.shift);
  const work = rec && !isRest(rec.shift);
  let kind = "candidate";
  if (work) kind = "busy";
  else if (rest && sky === "clear") kind = "outing";
  return {
    date: iso,
    illumination: illum,
    phase: moonPhaseLabel(iso),
    target: target || "deep",
    kind,
    shift: rec ? rec.shift : null,
    cloud,
    sky,
  };
}

/** Dark-sky and full-moon nights from today through +horizon days. */
function shootNightCandidates(horizon = DARK_HORIZON_DAYS, threshold = getDarkThreshold()) {
  const start = today();
  const list = [];
  for (let i = 0; i <= horizon; i += 1) {
    const date = addDaysIso(start, i);
    const illum = moonIllumination(date);
    const target = nightTarget(date, threshold, illum);
    if (target) list.push(classifyShootNight(date, illum, target));
  }
  return list;
}

function outingNights(horizon = DARK_HORIZON_DAYS, threshold = getDarkThreshold()) {
  return shootNightCandidates(horizon, threshold).filter((item) => item.kind === "outing");
}

function outingKindLabel(item) {
  const moon = item && item.target === "moon";
  if (typeof item === "string") {
    if (item === "outing") return "可出摊";
    if (item === "busy") return "暗夜但要上班";
    return "暗夜候选";
  }
  if (item.kind === "outing") return moon ? "可出摊 · 拍月亮" : "可出摊 · 拍深空";
  if (item.kind === "busy") return moon ? "拍月亮但要上班" : "暗夜但要上班";
  if (item.sky === "cloudy" && item.shift === "休息") return moon ? "休息但多云（拍月亮）" : "休息但多云";
  if (item.sky === "unknown") return moon ? "拍月亮候选（无云量）" : "暗夜候选（无云量）";
  return moon ? "拍月亮候选" : "暗夜候选";
}

function skyHint(item) {
  if (item.sky === "clear") return fmtCloud(item.cloud);
  if (item.sky === "cloudy") return fmtCloud(item.cloud);
  return "无云量预报";
}

function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = XLSX_SRC;
    script.onload = resolve;
    script.onerror = () => reject(new Error("xlsx"));
    document.head.appendChild(script);
  });
}

function cellText(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getDate()}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][value.getMonth()]}`;
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function isPersonName(value) {
  const name = cellText(value);
  if (!name || name.length > 12) return false;
  if (/合计|汇总|total|班次|工号|姓名|当日|工作安排|^ot\b|ccd|^[abc]$/i.test(name)) return false;
  if (/^sc\d/i.test(name)) return false;
  return /[\u4e00-\u9fff]/.test(name);
}

function normalizeShift(raw) {
  const value = cellText(raw);
  if (!value) return "";
  const upper = value.toUpperCase();
  if (["OFF", "AL", "休", "休息", "年假", "LEAVE"].includes(upper) || value === "休" || value === "年假") return "休息";
  return value;
}

function yearFromText(text) {
  const match = String(text || "").match(/(20\d{2})/);
  return match ? Number(match[1]) : 0;
}

function monthFromText(text) {
  const raw = String(text || "").trim();
  const cnNum = raw.match(/(?:^|[^\d])(\d{1,2})\s*月/);
  if (cnNum) {
    const month = Number(cnNum[1]);
    if (month >= 1 && month <= 12) return month;
  }
  const cnWord = raw.match(/(正|十一|十二|一|二|三|四|五|六|七|八|九|十)\s*月/);
  if (cnWord && MONTH_CN[cnWord[1]]) return MONTH_CN[cnWord[1]];
  const en = raw.toLowerCase().match(/\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)\b/);
  if (en && MONTH_EN[en[1]]) return MONTH_EN[en[1]];
  return 0;
}

function parseHeaderDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value) && value >= 1 && value <= 31) return { day: value };
    if (value > 31 && value < 80000) {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      if (!Number.isNaN(date.getTime()) && date.getFullYear() > 1990) {
        return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
      }
    }
  }
  const text = cellText(value);
  if (/^\d{1,2}$/.test(text)) {
    const day = Number(text);
    if (day >= 1 && day <= 31) return { day };
  }
  const en = text.match(/^(\d{1,2})-([A-Za-z]{3})/);
  if (en && MONTH_EN[en[2].toLowerCase()]) {
    return { day: Number(en[1]), month: MONTH_EN[en[2].toLowerCase()] };
  }
  const iso = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const cn = text.match(/(\d{1,2})\s*月\s*(\d{1,2})/);
  if (cn) return { month: Number(cn[1]), day: Number(cn[2]) };
  return null;
}

function monthFromSheetName(name) {
  const raw = String(name || "").trim();
  if (/^sheet\s*\d+$/i.test(raw)) return 0;
  const yearMonth = raw.match(/(20\d{2})?\s*[-_.年]?\s*(\d{1,2})\s*月/);
  if (yearMonth) {
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) return month;
  }
  const exact = raw.match(/^(\d{1,2})$/);
  if (exact) {
    const month = Number(exact[1]);
    if (month >= 1 && month <= 12) return month;
  }
  return monthFromText(raw);
}

function findDayHeader(rows) {
  let best = null;
  const limit = Math.min(rows.length, 80);
  for (let r = 0; r < limit; r += 1) {
    const days = [];
    (rows[r] || []).forEach((cell, c) => {
      const parsed = parseHeaderDay(cell);
      if (parsed) days.push({ ...parsed, col: c });
    });
    const unique = [];
    const seen = new Set();
    days.forEach((item) => {
      if (seen.has(item.day)) return;
      seen.add(item.day);
      unique.push(item);
    });
    if (unique.length >= 20 && (!best || unique.length > best.days.length)) {
      best = { row: r, days: unique };
    }
  }
  return best;
}

function monthYearFromDays(days) {
  const months = {};
  const years = {};
  days.forEach((item) => {
    if (item.month) months[item.month] = (months[item.month] || 0) + 1;
    if (item.year) years[item.year] = (years[item.year] || 0) + 1;
  });
  const pick = (map) => {
    const keys = Object.keys(map);
    if (!keys.length) return 0;
    return Number(keys.sort((a, b) => map[b] - map[a])[0]);
  };
  return { month: pick(months), year: pick(years) };
}

function findNameCol(rows) {
  for (let r = 0; r < Math.min(rows.length, 80); r += 1) {
    const cols = rows[r] || [];
    for (let c = 0; c < cols.length; c += 1) {
      if (cellText(cols[c]).includes("姓名")) return { row: r, col: c };
    }
  }
  return null;
}

function sheetToRows(sheet) {
  return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "", blankrows: true });
}

function parseShiftRows(rows, sheetName, yearHint, monthHint) {
  const dayHeader = findDayHeader(rows);
  const namePos = findNameCol(rows);
  if (!dayHeader || !namePos) return null;
  const dated = monthYearFromDays(dayHeader.days);
  const blob = [sheetName, ...rows.slice(0, 5).flat().map(cellText)].join(" ");
  const year = dated.year || yearFromText(blob) || yearHint || new Date().getFullYear();
  const month = dated.month || monthFromSheetName(sheetName) || monthHint || monthFromText(blob);
  if (!month) return null;
  const byName = {};
  for (let r = namePos.row + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const name = cellText(row[namePos.col]);
    if (!isPersonName(name)) continue;
    const records = [];
    dayHeader.days.forEach(({ day, col }) => {
      const shift = normalizeShift(row[col]);
      if (!shift) return;
      records.push({ date: isoDate(year, month, day), shift, site: "", notes: "" });
    });
    if (!records.length) continue;
    if (!byName[name]) byName[name] = [];
    const seen = new Set(byName[name].map((item) => item.date));
    records.forEach((item) => {
      if (seen.has(item.date)) return;
      seen.add(item.date);
      byName[name].push(item);
    });
  }
  const names = Object.keys(byName);
  if (!names.length) return null;
  return { year, month, period: `${year}年${month}月`, names, byName };
}

function parseShiftWorkbook(workbook) {
  const candidates = workbook.SheetNames.map((sheetName) => {
    const rows = sheetToRows(workbook.Sheets[sheetName] || {});
    return {
      sheetName,
      rows,
      dayHeader: findDayHeader(rows),
      namePos: findNameCol(rows),
    };
  });
  const calendars = candidates.filter((item) => item.dayHeader && item.namePos);
  const skipped = candidates
    .filter((item) => !item.dayHeader || !item.namePos)
    .map((item) => item.sheetName);
  const byName = {};
  const periods = [];
  let yearHint = 0;
  calendars.forEach((item, index) => {
    const monthHint = calendars.length >= 10 ? index + 1 : 0;
    const parsed = parseShiftRows(item.rows, item.sheetName, yearHint, monthHint);
    if (!parsed) {
      skipped.push(item.sheetName);
      return;
    }
    yearHint = parsed.year;
    if (!periods.includes(parsed.period)) periods.push(parsed.period);
    parsed.names.forEach((name) => {
      if (!byName[name]) byName[name] = [];
      const seen = new Set(byName[name].map((row) => row.date));
      parsed.byName[name].forEach((row) => {
        if (seen.has(row.date)) {
          const current = byName[name].find((entry) => entry.date === row.date);
          if (current) current.shift = row.shift;
          return;
        }
        seen.add(row.date);
        byName[name].push(row);
      });
    });
  });
  periods.sort();
  const names = Object.keys(byName);
  if (!names.length) return null;
  names.forEach((name) => byName[name].sort((a, b) => a.date.localeCompare(b.date)));
  return {
    periods,
    skipped,
    period:
      periods.length > 1 ? `${periods[0]}–${periods[periods.length - 1]} · ${periods.length} 个月` : periods[0] || "",
    names,
    byName,
  };
}

function pickShiftName(names) {
  const remembered = localStorage.getItem(SHIFT_NAME_KEY);
  return names.find((name) => name.includes("旭")) || (names.includes(remembered) ? remembered : names[0]);
}

function mergeShifts(records) {
  records.forEach((record) => {
    const existing = state.shifts.find((item) => item.date === record.date);
    if (existing) {
      existing.shift = record.shift;
    } else {
      state.shifts.unshift({ id: uid(), date: record.date, site: "", shift: record.shift, notes: "" });
    }
  });
  save();
}

function moveCalendar(delta) {
  if (delta === "today") {
    calendarCursor = today().slice(0, 7);
    return;
  }
  const [year, month] = calendarCursor.split("-").map(Number);
  const date = new Date(year, month - 1 + Number(delta), 1);
  calendarCursor = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function renderCalendar(ym) {
  const [year, month] = ym.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const threshold = getDarkThreshold();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(`<div class="cal-cell pad"></div>`);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = isoDate(year, month, day);
    const rec = state.shifts.find((item) => item.date === date);
    const todayCls = date === today() ? " today" : "";
    const target = nightTarget(date, threshold);
    const scored = target ? classifyShootNight(date) : null;
    const outing = scored?.kind === "outing";
    const cloudy = scored?.sky === "cloudy";
    const themeCls = target === "moon" ? " moon-full" : target === "deep" ? " dark" : "";
    const darkCls = `${themeCls}${outing ? " outing" : ""}${cloudy ? " cloudy" : ""}`;
    const moonTitle = scored
      ? `${scored.target === "moon" ? "满月" : "暗夜"} · 月照 ${fmtIllum(scored.illumination)} · ${skyHint(scored)}`
      : "";
    const moonMark = target
      ? `<span class="cal-moon" title="${esc(moonTitle)}">${target === "moon" ? "满" : "月"}</span>`
      : "";
    if (!rec) {
      cells.push(
        `<div class="cal-cell${todayCls}${darkCls}"><span class="cal-num">${day}</span>${moonMark}</div>`
      );
      continue;
    }
    const rest = isRest(rec.shift);
    const tag = rest ? "休" : "班";
    const code = rest ? "" : `<span class="cal-code">${esc(rec.shift)}</span>`;
    cells.push(
      `<a class="cal-cell${todayCls}${rest ? " rest" : " work"}${darkCls}" href="#/work/shifts/${rec.id}"><span class="cal-num">${day}</span><span class="cal-tag">${tag}</span>${code}${moonMark}</a>`
    );
  }
  return `
    <div class="cal">
      <div class="cal-head">
        <button class="ghost cal-nav" data-cal="-1" type="button">‹</button>
        <div class="cal-title">
          <p class="eyebrow">${year}年</p>
          <h1>${month}月</h1>
        </div>
        <button class="ghost cal-nav" data-cal="1" type="button">›</button>
      </div>
      <button class="ghost cal-today" data-cal="today" type="button">今天</button>
      <p class="meta cal-legend">「月」= 暗夜拍深空；「满」= 满月拍月亮。绿色/琥珀 = 休息+较晴可出摊。</p>
      <div class="cal-week">${DAYS.map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="cal-grid">${cells.join("")}</div>
    </div>
  `;
}

async function handleShiftFile(file) {
  try {
    await loadXlsx();
    const workbook = window.XLSX.read(new Uint8Array(await file.arrayBuffer()), {
      type: "array",
      cellDates: true,
      dense: false,
    });
    const parsed = parseShiftWorkbook(workbook);
    if (!parsed) {
      alert("没有识别到姓名和日期格。请确认是 SPL 月度排班表。");
      return;
    }
    shiftImport = { ...parsed, selected: pickShiftName(parsed.names) };
    render();
  } catch {
    alert("排班表无法读取。");
  }
}

function shiftImportHtml() {
  if (!shiftImport) return "";
  const records = shiftImport.byName[shiftImport.selected] || [];
  const workDays = records.filter((item) => !isRest(item.shift)).length;
  const preview = records
    .slice(0, 8)
    .map((item) => `<div>${fmtDate(item.date)}：<b>${esc(isRest(item.shift) ? "休" : item.shift)}</b></div>`)
    .join("");
  return `
    <div class="sheet">
      <form data-shift-import>
        <div class="toolbar"><h2>导入排班表</h2><button type="button" class="ghost" data-close>关闭</button></div>
        <p class="meta">${esc(shiftImport.period)} · ${shiftImport.names.length} 人</p>
        ${
          shiftImport.periods?.length
            ? `<p class="meta">已识别月份：${esc(shiftImport.periods.join("、"))}</p>`
            : ""
        }
        ${
          shiftImport.skipped?.length
            ? `<p class="meta">未读入子表：${esc(shiftImport.skipped.join("、"))}</p>`
            : ""
        }
        <label>导入谁的排班
          <select name="person">${shiftImport.names
            .map((name) => `<option value="${esc(name)}" ${name === shiftImport.selected ? "selected" : ""}>${esc(name)}</option>`)
            .join("")}</select>
        </label>
        <p class="meta">${records.length} 天里有 ${workDays} 天要上班，休息不显示班次代码。</p>
        <div class="peek">${preview || "<div>这一行没有班次。</div>"}${
          records.length > 8 ? `<div>……还有 ${records.length - 8} 天</div>` : ""
        }</div>
        <div class="actions"><button class="primary" type="submit">导入</button></div>
      </form>
    </div>
  `;
}

function todayReminders() {
  const weekday = new Date().getDay();
  return state.reminders
    .filter((item) => item.enabled !== false && (item.days || []).includes(weekday))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

function openSheet(title, fields, onSubmit, extra = "") {
  sheet = { title, fields, onSubmit, extra };
  render();
  document.querySelector("[name]")?.focus();
}

function closeSheet() {
  sheet = null;
  shiftImport = null;
  closeMapPicker();
  render();
}

function fieldHtml(field) {
  const value = esc(field.value ?? "");
  if (field.type === "textarea") {
    return `<label>${esc(field.label)}<textarea name="${field.name}" placeholder="${esc(field.placeholder || "")}">${value}</textarea></label>`;
  }
  if (field.type === "select") {
    const options = field.options
      .map((opt) => `<option value="${esc(opt)}" ${opt === field.value ? "selected" : ""}>${esc(opt)}</option>`)
      .join("");
    return `<label>${esc(field.label)}<select name="${field.name}">${options}</select></label>`;
  }
  if (field.type === "week") {
    const selected = new Set(field.value || []);
    const boxes = DAYS.map(
      (label, index) =>
        `<label>${label}<input type="checkbox" name="day-${index}" ${selected.has(index) ? "checked" : ""}></label>`
    ).join("");
    return `<div><span class="meta">${esc(field.label)}</span><div class="week">${boxes}</div></div>`;
  }
  if (field.type === "check") {
    return `<label class="switch">${esc(field.label)}<input type="checkbox" name="${field.name}" ${field.value ? "checked" : ""}></label>`;
  }
  return `<label>${esc(field.label)}<input type="${field.type || "text"}" name="${field.name}" value="${value}" placeholder="${esc(field.placeholder || "")}"></label>`;
}

function nav(active) {
  const items = [
    ["home", "/", "首页"],
    ["astro", "/astro", "天文"],
    ["work", "/work", "工作"],
    ["games", "/games", "游戏"],
    ["fitness", "/fitness", "健身"],
  ];
  return `<nav class="nav">${items
    .map(([key, href, label]) => `<a href="#${href}" class="${active === key ? "active" : ""}">${label}</a>`)
    .join("")}</nav>`;
}

function empty(text) {
  return `<div class="card empty">${esc(text)}</div>`;
}

function itemCard(href, title, meta) {
  return `<a class="card item" href="#${href}"><h3>${esc(title)}</h3><div class="meta">${esc(meta)}</div></a>`;
}

function formFrom(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.enabled = form.querySelector('[name="enabled"]')?.checked ?? undefined;
  data.days = DAYS.map((_, index) => (form.querySelector(`[name="day-${index}"]`)?.checked ? index : null)).filter(
    (v) => v !== null
  );
  return data;
}

function upsert(listName, id, payload) {
  const list = state[listName];
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) list[index] = { ...list[index], ...payload };
  else list.unshift({ id: id || uid(), ...payload });
  save();
}

function remove(listName, id) {
  state[listName] = state[listName].filter((item) => item.id !== id);
  save();
}

function outingPeekHtml(nights, emptyText) {
  if (!nights.length) return `<div>${esc(emptyText)}</div>`;
  return nights
    .map((item) => {
      const weekday = parseIsoDate(item.date).toLocaleDateString("zh-CN", { weekday: "short" });
      return `<div>${fmtDate(item.date)}（${weekday}）：<b>${esc(outingKindLabel(item))}</b> · ${esc(item.phase)} · 月照 ${fmtIllum(item.illumination)} · ${esc(skyHint(item))}</div>`;
    })
    .join("");
}

function cloudStatusLine() {
  const loc = getAstroLocation();
  if (!loc) return "未设置观测点，暂不筛云量。";
  if (cloudState.status === "loading") return `正在拉取 ${esc(loc.name || "观测点")} 云量…`;
  if (cloudState.status === "error") return cloudState.error || "云量预报失败。";
  if (cloudState.status === "ready" || loadCloudCache()) return `${esc(loc.name || "观测点")} · 夜间云量已更新`;
  return `${esc(loc.name || "观测点")} · 等待云量`;
}

function renderHome() {
  const shift = todayShift();
  const reminders = todayReminders();
  const upcomingOutings = outingNights(7);
  const todayTarget = nightTarget(today());
  const todayNight = todayTarget ? classifyShootNight(today()) : null;
  const loc = getAstroLocation();
  const shiftLine = !shift
    ? "<div>今天还没有排班。</div>"
    : isRest(shift.shift)
      ? "<div>今天休息。</div>"
      : `<div>今天上班：<b>${esc(shift.shift)}</b></div>`;
  const todayAstroLine = todayNight
    ? `<div>今晚${esc(outingKindLabel(todayNight))}：<b>${esc(todayNight.phase)}</b> · 月照 ${fmtIllum(todayNight.illumination)} · ${esc(skyHint(todayNight))}</div>`
    : "";
  const outingLines = upcomingOutings.length
    ? outingPeekHtml(upcomingOutings, "")
    : `<div>未来 7 天没有「休息 + 暗夜/满月 + 较晴」可出摊。${!loc ? "请到天文页设置观测点。" : "可先导入排班，或放宽月照。"}</div>`;
  return `
    <header class="top">
      <div>
        <p class="eyebrow">${new Date().toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1>旭的工作台</h1>
      </div>
      <div class="top-actions">
        <button class="ghost" data-import>导入</button>
        <button class="ghost" data-export>导出</button>
        <input id="import-file" type="file" accept="application/json" hidden />
      </div>
    </header>
    <div class="grid">
      <a class="tile" href="#/astro"><i class="dot astro"></i><strong>天文摄影</strong><span>${state.astro.length} 条拍摄 · ${upcomingOutings.length} 天可出摊</span></a>
      <a class="tile" href="#/work"><i class="dot work"></i><strong>排班日历</strong><span>${state.shifts.filter((item) => !isRest(item.shift) && item.date.startsWith(today().slice(0, 7))).length} 天本月要上班</span></a>
      <a class="tile" href="#/games"><i class="dot games"></i><strong>游戏进度</strong><span>僵尸地图 ${state.zomboid.length} · 手游 ${state.games.length}</span></a>
      <a class="tile" href="#/fitness"><i class="dot fit"></i><strong>健身提醒</strong><span>${reminders.length} 项今天要做</span></a>
    </div>
    <section class="card panel">
      <h2>今天</h2>
      <div class="peek">
        ${shiftLine}
        ${todayAstroLine}
        ${
          reminders.length
            ? reminders.map((item) => `<div>健身：<b>${esc(item.time)} ${esc(item.title)}</b></div>`).join("")
            : "<div>今天没有开启的健身提醒。</div>"
        }
      </div>
    </section>
    <section class="card panel">
      <h2>适合出摊</h2>
      <p class="meta">未来 7 天 · 休息 +（暗夜或满月）+ 夜间云量 ≤ ${CLOUD_CLEAR_MAX}%</p>
      <p class="meta">${cloudStatusLine()}</p>
      <div class="peek">${outingLines}</div>
    </section>
    ${nav("home")}
  `;
}

function renderAstro() {
  const items = [...state.astro].sort(byDateDesc).map((item) => ({
    ...item,
    title: item.target,
    meta: `${fmtDate(item.date)} · ${item.place || "地点未填"}`,
  }));
  const threshold = getDarkThreshold();
  const candidates = shootNightCandidates();
  const outings = candidates.filter((item) => item.kind === "outing");
  const busy = candidates.filter((item) => item.kind === "busy");
  const only = candidates.filter((item) => item.kind === "candidate");
  const ranked = [...candidates].sort((a, b) => a.date.localeCompare(b.date));
  const hasShifts = state.shifts.length > 0;
  const loc = getAstroLocation();
  const listHtml = ranked.length
    ? ranked
        .map((item) => {
          const weekday = parseIsoDate(item.date).toLocaleDateString("zh-CN", { weekday: "short" });
          const shiftHint =
            item.shift === "休息"
              ? "休息"
              : item.shift
                ? `上班 ${item.shift}`
                : hasShifts
                  ? "无排班"
                  : "未导入排班";
          return `<div class="card item outing-card ${item.kind} sky-${item.sky} target-${item.target}">
            <h3>${fmtDate(item.date)} · ${esc(outingKindLabel(item))}</h3>
            <div class="meta">${weekday} · ${esc(item.phase)} · 月照 ${fmtIllum(item.illumination)} · ${esc(skyHint(item))} · ${esc(shiftHint)}</div>
            <button class="twt-link" type="button" data-open-twt>用天文通核对</button>
          </div>`;
        })
        .join("")
    : empty("未来 60 天没有符合当前阈值的暗夜或满月。");
  const cityList =
    citySearching
      ? `<p class="meta">正在搜索地点…</p>`
      : cityHits == null
        ? ""
        : cityHits.length
          ? `<div class="city-hits">${cityHits
              .map(
                (hit, index) =>
                  `<button type="button" class="ghost block" data-pick-city="${index}">${esc(hit.name)}</button>`
              )
              .join("")}</div>`
          : `<p class="meta">没有找到地点。可试「凯里市」或「雷公山 贵州」。</p>`;
  return `
    <header class="top"><div><p class="eyebrow">拍摄记录</p><h1>天文摄影</h1></div></header>
    <section class="card panel">
      <h2>观测点</h2>
      <p class="meta">${loc ? esc(loc.name || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`) : "未设置 · 设置后可自动筛夜间云量"}</p>
      <p class="meta">${cloudStatusLine()}</p>
      <div class="threshold">
        <button type="button" class="ghost" data-map-open>地图选点</button>
        <button type="button" class="ghost" data-cloud-refresh>刷新云量</button>
      </div>
      <form class="city-form" data-city-search>
        <label>地点搜索
          <input name="city" type="search" placeholder="南山区 / 凯里市 / 雷公山风景区" value="${esc(cityQuery)}" autocomplete="off" />
        </label>
        <button class="secondary" type="submit">搜索</button>
      </form>
      ${cityList}
      <p class="meta">城市、景区都可搜。浏览器粗定位常会落到福田，请打开地图选点后再点，或搜「南山区」。云量来自 Open-Meteo（约 16 天）。</p>
    </section>
    <section class="card panel">
      <h2>适合出摊</h2>
      <p class="meta">暗夜拍深空，满月拍月亮。夜间较晴（云量 ≤ ${CLOUD_CLEAR_MAX}%）+ 休息 = 可出摊。</p>
      <div class="threshold">
        <button type="button" class="ghost ${threshold === 0.3 ? "active" : ""}" data-dark-threshold="0.3">月照 ≤ 30%</button>
        <button type="button" class="ghost ${threshold === 0.5 ? "active" : ""}" data-dark-threshold="0.5">月照 ≤ 50%</button>
      </div>
      <p class="meta">${outings.length} 天可出摊 · ${busy.length} 天要上班 · ${only.length} 天仅候选</p>
      ${!hasShifts ? `<p class="meta">还没有排班时只显示候选，请到工作页导入排班表。</p>` : ""}
      <div class="list outing-list">${listHtml}</div>
    </section>
    <div class="toolbar"><span class="meta">${items.length} 条拍摄记录</span></div>
    <button class="primary block" data-add="astro">记一次拍摄</button>
    <div class="list">${
      items.length ? items.map((item) => itemCard(`/astro/${item.id}`, item.title, item.meta)).join("") : empty("还没有拍摄记录。把目标、地点和器材记下来。")
    }</div>
    ${nav("astro")}
  `;
}

function renderWork(tab = "shifts") {
  const tabs = [
    { key: "shifts", label: "排班" },
    { key: "memos", label: "现场备忘" },
    { key: "sites", label: "各家区别" },
  ];
  const maps = {
    shifts: {
      addLabel: "加排班",
      emptyText: "还没有排班。可以手动添加，或导入公司的 xlsm 排班表。",
      items: [...state.shifts].sort(byDateDesc).map((item) => ({
        ...item,
        title: isRest(item.shift) ? "休息" : item.shift,
        meta: fmtDate(item.date),
      })),
      href: (item) => `/work/shifts/${item.id}`,
    },
    memos: {
      addLabel: "加备忘",
      emptyText: "把现场特殊情况和处理办法记在这里。",
      items: [...state.memos].sort(byDateDesc).map((item) => ({
        ...item,
        title: item.title,
        meta: `${fmtDate(item.date)} · ${item.site || "地点未填"}`,
      })),
      href: (item) => `/work/memos/${item.id}`,
    },
    sites: {
      addLabel: "加地点",
      emptyText: "各家作业区别、对接方式和注意事项。",
      items: state.sites.map((item) => ({
        ...item,
        title: item.name,
        meta: item.difference?.slice(0, 36) || "还没写区别",
      })),
      href: (item) => `/work/sites/${item.id}`,
    },
  };
  const current = maps[tab];
  const tabsHtml = `<div class="tabs">${tabs
    .map((item) => `<button data-tab="${item.key}" class="${item.key === tab ? "active" : ""}">${item.label}</button>`)
    .join("")}</div>`;
  if (tab === "shifts") {
    return `
    ${tabsHtml}
    ${renderCalendar(calendarCursor)}
    <button class="secondary block" data-import-shifts>导入排班表</button>
    <input id="shift-file" type="file" accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden />
    <button class="ghost block" data-add="shifts">${current.addLabel}</button>
    ${nav("work")}
  `;
  }
  return `
    <header class="top"><div><p class="eyebrow">工作记录</p><h1>排班备忘</h1></div></header>
    ${tabsHtml}
    <div class="toolbar"><span class="meta">${current.items.length} 条</span></div>
    <button class="primary block" data-add="${tab}">${current.addLabel}</button>
    <div class="list">${
      current.items.length ? current.items.map((item) => itemCard(current.href(item), item.title, item.meta)).join("") : empty(current.emptyText)
    }</div>
    ${nav("work")}
  `;
}

function renderGames(tab = "zomboid") {
  const maps = {
    zomboid: {
      addLabel: "加地图笔记",
      emptyText: "僵尸毁灭工程的地图、刷新点和物资路线可以记在这里。",
      items: state.zomboid.map((item) => ({
        ...item,
        title: item.map,
        meta: item.notes?.slice(0, 36) || "还没写内容",
      })),
      href: (item) => `/games/zomboid/${item.id}`,
    },
    games: {
      addLabel: "加手游进度",
      emptyText: "把各手游当前进度、卡关和日常记下来。",
      items: state.games.map((item) => ({
        ...item,
        title: item.name,
        meta: item.progress || "进度未填",
      })),
      href: (item) => `/games/games/${item.id}`,
    },
  };
  const current = maps[tab];
  return `
    <header class="top"><div><p class="eyebrow">游戏笔记</p><h1>游戏进度</h1></div></header>
    <div class="tabs">
      <button data-tab="zomboid" class="${tab === "zomboid" ? "active" : ""}">僵尸毁灭工程</button>
      <button data-tab="games" class="${tab === "games" ? "active" : ""}">手游</button>
    </div>
    <div class="toolbar"><span class="meta">${current.items.length} 条</span></div>
    <button class="primary block" data-add="${tab}">${current.addLabel}</button>
    <div class="list">${
      current.items.length ? current.items.map((item) => itemCard(current.href(item), item.title, item.meta)).join("") : empty(current.emptyText)
    }</div>
    ${nav("games")}
  `;
}

function renderFitness(tab = "reminders") {
  const maps = {
    reminders: {
      addLabel: "加提醒",
      emptyText: "先加训练提醒，比如 20:00 力量训练。",
      items: state.reminders.map((item) => ({
        ...item,
        title: `${item.time} ${item.title}`,
        meta: `${(item.days || []).map((d) => `周${DAYS[d]}`).join(" ") || "未选日期"} · ${item.enabled === false ? "已关闭" : "开启"}`,
      })),
      href: (item) => `/fitness/reminders/${item.id}`,
    },
    workouts: {
      addLabel: "记一次训练",
      emptyText: "练完把内容记一笔，方便回头看。",
      items: [...state.workouts].sort(byDateDesc).map((item) => ({
        ...item,
        title: item.title,
        meta: fmtDate(item.date),
      })),
      href: (item) => `/fitness/workouts/${item.id}`,
    },
  };
  const current = maps[tab];
  return `
    <header class="top"><div><p class="eyebrow">身体记录</p><h1>健身</h1></div></header>
    <div class="tabs">
      <button data-tab="reminders" class="${tab === "reminders" ? "active" : ""}">提醒</button>
      <button data-tab="workouts" class="${tab === "workouts" ? "active" : ""}">训练记录</button>
    </div>
    <div class="toolbar"><span class="meta">${current.items.length} 条</span></div>
    <button class="primary block" data-add="${tab}">${current.addLabel}</button>
    <div class="list">${
      current.items.length ? current.items.map((item) => itemCard(current.href(item), item.title, item.meta)).join("") : empty(current.emptyText)
    }</div>
    ${nav("fitness")}
  `;
}

function detailPage(item, fields, back) {
  if (!item) {
    return `<header class="top"><h1>找不到这条记录</h1></header><button class="secondary" data-back="${back}">返回</button>${nav("home")}`;
  }
  return `
    <header class="top">
      <div>
        <p class="eyebrow">详情</p>
        <h1>${esc(item.heading)}</h1>
      </div>
    </header>
    <section class="card panel detail">
      ${fields.map((line) => `<p><span class="meta">${esc(line.label)}</span><br>${esc(line.value || "未填")}</p>`).join("")}
    </section>
    <div class="actions">
      <button class="secondary" data-edit>编辑</button>
      <button class="danger" data-delete>删除</button>
    </div>
    ${nav(item.nav)}
  `;
}

function astroFields(item = {}) {
  return [
    { name: "target", label: "目标天体", value: item.target, placeholder: "例如 NGC 7000" },
    { name: "date", label: "日期", type: "date", value: item.date || today() },
    { name: "place", label: "地点", value: item.place, placeholder: "阳台 / 郊外" },
    { name: "gear", label: "器材", value: item.gear, placeholder: "S30 / 赤道仪 / 滤镜" },
    { name: "weather", label: "天气", value: item.weather, placeholder: "通透、薄云、有风" },
    { name: "notes", label: "备注", type: "textarea", value: item.notes },
  ];
}

function shiftFields(item = {}) {
  return [
    { name: "date", label: "日期", type: "date", value: item.date || today() },
    { name: "site", label: "地点 / 客户", value: item.site },
    { name: "shift", label: "班次", value: item.shift || "白班", placeholder: "MM / N4 / 白班 / 休息" },
    { name: "notes", label: "备注", type: "textarea", value: item.notes },
  ];
}

function memoFields(item = {}) {
  return [
    { name: "title", label: "情况", value: item.title, placeholder: "例如 夜间无法进场" },
    { name: "date", label: "日期", type: "date", value: item.date || today() },
    { name: "site", label: "地点", value: item.site },
    { name: "handling", label: "处理办法", type: "textarea", value: item.handling },
  ];
}

function siteFields(item = {}) {
  return [
    { name: "name", label: "地点 / 客户名", value: item.name },
    { name: "difference", label: "和别家的区别", type: "textarea", value: item.difference },
    { name: "notes", label: "现场注意", type: "textarea", value: item.notes },
  ];
}

function zomboidFields(item = {}) {
  return [
    { name: "map", label: "地图 / 区域", value: item.map, placeholder: "例如 Riverside 西侧" },
    { name: "notes", label: "笔记", type: "textarea", value: item.notes, placeholder: "物资、僵尸密度、安全屋" },
  ];
}

function gameFields(item = {}) {
  return [
    { name: "name", label: "游戏名", value: item.name },
    { name: "progress", label: "当前进度", value: item.progress, placeholder: "关卡 / 活动 / 卡关点" },
    { name: "notes", label: "备注", type: "textarea", value: item.notes },
  ];
}

function reminderFields(item = {}) {
  return [
    { name: "title", label: "提醒内容", value: item.title, placeholder: "力量训练 / 拉伸 / 有氧" },
    { name: "time", label: "时间", type: "time", value: item.time || "20:00" },
    { name: "days", label: "重复", type: "week", value: item.days || [1, 2, 3, 4, 5] },
    { name: "enabled", label: "开启提醒", type: "check", value: item.enabled !== false },
  ];
}

function workoutFields(item = {}) {
  return [
    { name: "title", label: "训练内容", value: item.title, placeholder: "卧推 / 跑步 / 徒手" },
    { name: "date", label: "日期", type: "date", value: item.date || today() },
    { name: "notes", label: "记录", type: "textarea", value: item.notes },
  ];
}

const forms = {
  astro: { title: "拍摄记录", fields: astroFields, list: "astro", after: "/astro", map: (d) => ({ target: d.target, date: d.date, place: d.place, gear: d.gear, weather: d.weather, notes: d.notes }) },
  shifts: { title: "排班", fields: shiftFields, list: "shifts", after: "/work", map: (d) => ({ date: d.date, site: d.site, shift: d.shift, notes: d.notes }) },
  memos: { title: "现场备忘", fields: memoFields, list: "memos", after: "/work", map: (d) => ({ title: d.title, date: d.date, site: d.site, handling: d.handling }) },
  sites: { title: "地点区别", fields: siteFields, list: "sites", after: "/work", map: (d) => ({ name: d.name, difference: d.difference, notes: d.notes }) },
  zomboid: { title: "地图笔记", fields: zomboidFields, list: "zomboid", after: "/games", map: (d) => ({ map: d.map, notes: d.notes }) },
  games: { title: "手游进度", fields: gameFields, list: "games", after: "/games", map: (d) => ({ name: d.name, progress: d.progress, notes: d.notes }) },
  reminders: { title: "健身提醒", fields: reminderFields, list: "reminders", after: "/fitness", map: (d) => ({ title: d.title, time: d.time, days: d.days, enabled: d.enabled === true }) },
  workouts: { title: "训练记录", fields: workoutFields, list: "workouts", after: "/fitness", map: (d) => ({ title: d.title, date: d.date, notes: d.notes }) },
};

function startAdd(kind, item) {
  const conf = forms[kind];
  openSheet(item ? `编辑${conf.title}` : conf.title, conf.fields(item || {}), (data) => {
    upsert(conf.list, item?.id, conf.map(data));
    closeSheet();
    go(item ? location.hash.replace(/^#/, "") : conf.after);
  });
}

function renderDetail() {
  const [a, b, c] = parts();
  if (a === "astro" && b) {
    const item = state.astro.find((x) => x.id === b);
    const view = detailPage(
      item && { heading: item.target, nav: "astro" },
      [
        { label: "日期", value: fmtDate(item?.date) },
        { label: "地点", value: item?.place },
        { label: "器材", value: item?.gear },
        { label: "天气", value: item?.weather },
        { label: "备注", value: item?.notes },
      ],
      "/astro"
    );
    return { html: view, item, kind: "astro", back: "/astro" };
  }
  const groups = {
    work: { shifts: "shifts", memos: "memos", sites: "sites" },
    games: { zomboid: "zomboid", games: "games" },
    fitness: { reminders: "reminders", workouts: "workouts" },
  };
  const kind = groups[a]?.[b];
  if (!kind || !c) return { html: renderHome() };
  const item = state[kind].find((x) => x.id === c);
  const heading = kind === "shifts" ? (isRest(item?.shift) ? "休息" : item?.shift) : item?.target || item?.title || item?.name || item?.map || "记录";
  const fieldMap = {
    shifts: [
      { label: "日期", value: fmtDate(item?.date) },
      { label: "班次", value: isRest(item?.shift) ? "休息" : item?.shift },
      ...(item?.notes ? [{ label: "备注", value: item.notes }] : []),
    ],
    memos: [
      { label: "日期", value: fmtDate(item?.date) },
      { label: "地点", value: item?.site },
      { label: "处理办法", value: item?.handling },
    ],
    sites: [
      { label: "区别", value: item?.difference },
      { label: "注意", value: item?.notes },
    ],
    zomboid: [{ label: "笔记", value: item?.notes }],
    games: [
      { label: "进度", value: item?.progress },
      { label: "备注", value: item?.notes },
    ],
    reminders: [
      { label: "时间", value: item?.time },
      { label: "重复", value: (item?.days || []).map((d) => `周${DAYS[d]}`).join(" ") },
      { label: "状态", value: item?.enabled === false ? "已关闭" : "开启" },
    ],
    workouts: [
      { label: "日期", value: fmtDate(item?.date) },
      { label: "记录", value: item?.notes },
    ],
  };
  return {
    html: detailPage(item && { heading, nav: a === "work" ? "work" : a === "games" ? "games" : "fitness" }, fieldMap[kind], `/${a}`),
    item,
    kind,
    back: a === "work" ? "/work" : a === "games" ? "/games" : "/fitness",
  };
}

function sheetHtml() {
  if (!sheet) return "";
  return `
    <div class="sheet">
      <form>
        <div class="toolbar"><h2>${esc(sheet.title)}</h2><button type="button" class="ghost" data-close>关闭</button></div>
        ${sheet.fields.map(fieldHtml).join("")}
        <div class="actions"><button class="primary" type="submit">保存</button></div>
      </form>
    </div>
  `;
}

function render() {
  const { path, tab, id } = route();
  const root = document.getElementById("app");
  let page = renderHome();
  let detail = null;
  if (path === "astro" && !tab) page = renderAstro();
  else if (path === "work" && !id) page = renderWork(["shifts", "memos", "sites"].includes(tab) ? tab : "shifts");
  else if (path === "games" && !id) page = renderGames(tab === "games" ? "games" : "zomboid");
  else if (path === "fitness" && !id) page = renderFitness(tab === "workouts" ? "workouts" : "reminders");
  if ((path === "astro" && tab) || (["work", "games", "fitness"].includes(path) && id)) {
    detail = renderDetail();
    page = detail.html;
  }
  root.innerHTML = page + sheetHtml() + shiftImportHtml() + mapPickerHtml();
  root.dataset.detailKind = detail?.kind || "";
  root.dataset.detailId = detail?.item?.id || "";
  root.dataset.detailBack = detail?.back || "";
  ensureCloudForecast();
  mountAstroMap();
}

document.addEventListener("click", (event) => {
  const cal = event.target.closest("[data-cal]");
  const add = event.target.closest("[data-add]");
  const tab = event.target.closest("[data-tab]");
  const close = event.target.closest("[data-close]");
  const edit = event.target.closest("[data-edit]");
  const del = event.target.closest("[data-delete]");
  const back = event.target.closest("[data-back]");
  const exp = event.target.closest("[data-export]");
  const imp = event.target.closest("[data-import]");
  const impShifts = event.target.closest("[data-import-shifts]");
  const darkThreshold = event.target.closest("[data-dark-threshold]");
  const locate = event.target.closest("[data-astro-locate]");
  const refreshCloud = event.target.closest("[data-cloud-refresh]");
  const pickCity = event.target.closest("[data-pick-city]");
  const mapOpen = event.target.closest("[data-map-open]");
  const mapConfirm = event.target.closest("[data-map-confirm]");
  const mapLocate = event.target.closest("[data-map-locate]");
  const openTwt = event.target.closest("[data-open-twt]");
  if (event.target.classList.contains("sheet")) closeSheet();
  if (cal) {
    moveCalendar(cal.getAttribute("data-cal"));
    render();
    return;
  }
  if (darkThreshold) {
    setDarkThreshold(Number(darkThreshold.getAttribute("data-dark-threshold")));
    render();
    return;
  }
  if (mapOpen) {
    openMapPicker();
    return;
  }
  if (mapConfirm) {
    confirmMapPicker();
    return;
  }
  if (mapLocate) {
    panMapToMe();
    return;
  }
  if (openTwt) {
    openTwtApp(event);
    return;
  }
  if (locate) {
    locateAstro();
    return;
  }
  if (refreshCloud) {
    localStorage.removeItem(CLOUD_CACHE_KEY);
    cloudState = { status: "idle", error: null };
    ensureCloudForecast();
    render();
    return;
  }
  if (pickCity) {
    const hit = cityHits?.[Number(pickCity.getAttribute("data-pick-city"))];
    if (hit) {
      setAstroLocation(hit);
      render();
    }
    return;
  }
  if (add) startAdd(add.getAttribute("data-add") || "astro");
  if (tab) {
    const key = tab.getAttribute("data-tab");
    const { path } = route();
    go(`/${path}/${key}`);
  }
  if (close) closeSheet();
  if (edit) {
    const root = document.getElementById("app");
    const kind = root.dataset.detailKind;
    const item = state[kind]?.find((x) => x.id === root.dataset.detailId);
    startAdd(kind, item);
  }
  if (del) {
    const root = document.getElementById("app");
    if (confirm("删除这条记录？")) {
      remove(root.dataset.detailKind, root.dataset.detailId);
      go(root.dataset.detailBack);
    }
  }
  if (back) go(back.getAttribute("data-back"));
  if (exp) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `personal-hub-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (imp) document.getElementById("import-file")?.click();
  if (impShifts) document.getElementById("shift-file")?.click();
});

document.addEventListener("change", (event) => {
  if (shiftImport && event.target.name === "person") {
    shiftImport.selected = event.target.value;
    render();
    return;
  }
  if (event.target.id === "shift-file" && event.target.files?.[0]) {
    const file = event.target.files[0];
    event.target.value = "";
    handleShiftFile(file);
    return;
  }
  if (event.target.id !== "import-file" || !event.target.files?.[0]) return;
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = { ...emptyState(), ...JSON.parse(String(reader.result)) };
      save();
      render();
    } catch {
      alert("备份文件无法读取。");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
});

document.addEventListener("submit", (event) => {
  const cityForm = event.target.closest("[data-city-search]");
  if (cityForm) {
    event.preventDefault();
    searchCity(new FormData(cityForm).get("city"));
    return;
  }
  const form = event.target.closest(".sheet form");
  if (!form) return;
  event.preventDefault();
  if (form.hasAttribute("data-shift-import") && shiftImport) {
    const records = shiftImport.byName[shiftImport.selected] || [];
    localStorage.setItem(SHIFT_NAME_KEY, shiftImport.selected);
    mergeShifts(records);
    const focus = records.find((item) => item.date.startsWith(today().slice(0, 7))) || records[records.length - 1];
    if (focus) calendarCursor = focus.date.slice(0, 7);
    closeSheet();
    go("/work/shifts");
    return;
  }
  if (!sheet) return;
  sheet.onSubmit(formFrom(form));
});

window.addEventListener("hashchange", render);
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
