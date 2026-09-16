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
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(`<div class="cal-cell pad"></div>`);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = isoDate(year, month, day);
    const rec = state.shifts.find((item) => item.date === date);
    const todayCls = date === today() ? " today" : "";
    if (!rec) {
      cells.push(`<div class="cal-cell${todayCls}"><span class="cal-num">${day}</span></div>`);
      continue;
    }
    const rest = isRest(rec.shift);
    const tag = rest ? "休" : "班";
    const code = rest ? "" : `<span class="cal-code">${esc(rec.shift)}</span>`;
    cells.push(
      `<a class="cal-cell${todayCls}${rest ? " rest" : " work"}" href="#/work/shifts/${rec.id}"><span class="cal-num">${day}</span><span class="cal-tag">${tag}</span>${code}</a>`
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

function renderHome() {
  const shift = todayShift();
  const reminders = todayReminders();
  const shiftLine = !shift
    ? "<div>今天还没有排班。</div>"
    : isRest(shift.shift)
      ? "<div>今天休息。</div>"
      : `<div>今天上班：<b>${esc(shift.shift)}</b></div>`;
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
      <a class="tile" href="#/astro"><i class="dot astro"></i><strong>天文摄影</strong><span>${state.astro.length} 条拍摄记录</span></a>
      <a class="tile" href="#/work"><i class="dot work"></i><strong>排班日历</strong><span>${state.shifts.filter((item) => !isRest(item.shift) && item.date.startsWith(today().slice(0, 7))).length} 天本月要上班</span></a>
      <a class="tile" href="#/games"><i class="dot games"></i><strong>游戏进度</strong><span>僵尸地图 ${state.zomboid.length} · 手游 ${state.games.length}</span></a>
      <a class="tile" href="#/fitness"><i class="dot fit"></i><strong>健身提醒</strong><span>${reminders.length} 项今天要做</span></a>
    </div>
    <section class="card panel">
      <h2>今天</h2>
      <div class="peek">
        ${shiftLine}
        ${
          reminders.length
            ? reminders.map((item) => `<div>健身：<b>${esc(item.time)} ${esc(item.title)}</b></div>`).join("")
            : "<div>今天没有开启的健身提醒。</div>"
        }
      </div>
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
  return `
    <header class="top"><div><p class="eyebrow">拍摄记录</p><h1>天文摄影</h1></div></header>
    <div class="toolbar"><span class="meta">${items.length} 条</span></div>
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
  root.innerHTML = page + sheetHtml() + shiftImportHtml();
  root.dataset.detailKind = detail?.kind || "";
  root.dataset.detailId = detail?.item?.id || "";
  root.dataset.detailBack = detail?.back || "";
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
  if (event.target.classList.contains("sheet")) closeSheet();
  if (cal) {
    moveCalendar(cal.getAttribute("data-cal"));
    render();
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
