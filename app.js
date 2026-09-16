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
  return `
    <header class="top">
      <div>
        <p class="eyebrow">${new Date().toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1>旭的工作台</h1>
        <p class="lead">天文、排班、游戏、健身，一手掌握。</p>
      </div>
      <div class="top-actions">
        <button class="ghost" data-import>导入</button>
        <button class="ghost" data-export>导出</button>
        <input id="import-file" type="file" accept="application/json" hidden />
      </div>
    </header>
    <div class="grid">
      <a class="tile" href="#/astro"><i class="dot astro"></i><strong>天文摄影</strong><span>${state.astro.length} 条拍摄记录</span></a>
      <a class="tile" href="#/work"><i class="dot work"></i><strong>排班备忘</strong><span>${state.shifts.length} 个班次 · ${state.memos.length} 条现场</span></a>
      <a class="tile" href="#/games"><i class="dot games"></i><strong>游戏进度</strong><span>僵尸地图 ${state.zomboid.length} · 手游 ${state.games.length}</span></a>
      <a class="tile" href="#/fitness"><i class="dot fit"></i><strong>健身</strong><span>${reminders.length} 项今日提醒</span></a>
    </div>
    <section class="card panel">
      <h2>今日安排</h2>
      <div class="peek">
        ${shift ? `<div>班次：<b>${esc(shift.site || "未填地点")} · ${esc(shift.shift)}</b></div>` : "<div>今天暂无排班。</div>"}
        ${
          reminders.length
            ? reminders.map((item) => `<div>健身：<b>${esc(item.time)} ${esc(item.title)}</b></div>`).join("")
            : "<div>今天暂无健身提醒。</div>"
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
      emptyText: "还没有排班。先记下今天去哪家、上什么班。",
      items: [...state.shifts].sort(byDateDesc).map((item) => ({
        ...item,
        title: `${item.site || "未填地点"} · ${item.shift}`,
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
  return `
    <header class="top"><div><p class="eyebrow">工作记录</p><h1>排班备忘</h1></div></header>
    <div class="tabs">${tabs
      .map((item) => `<button data-tab="${item.key}" class="${item.key === tab ? "active" : ""}">${item.label}</button>`)
      .join("")}</div>
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
    { name: "shift", label: "班次", type: "select", value: item.shift || "白班", options: ["白班", "夜班", "早班", "中班", "休息", "加班"] },
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
  const heading = item?.target || item?.title || item?.name || item?.map || "记录";
  const fieldMap = {
    shifts: [
      { label: "日期", value: fmtDate(item?.date) },
      { label: "班次", value: item?.shift },
      { label: "地点", value: item?.site },
      { label: "备注", value: item?.notes },
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
  root.innerHTML = page + sheetHtml();
  root.dataset.detailKind = detail?.kind || "";
  root.dataset.detailId = detail?.item?.id || "";
  root.dataset.detailBack = detail?.back || "";
}

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  const tab = event.target.closest("[data-tab]");
  const close = event.target.closest("[data-close]");
  const edit = event.target.closest("[data-edit]");
  const del = event.target.closest("[data-delete]");
  const back = event.target.closest("[data-back]");
  const exp = event.target.closest("[data-export]");
  const imp = event.target.closest("[data-import]");
  if (event.target.classList.contains("sheet")) closeSheet();
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
});

document.addEventListener("change", (event) => {
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
  if (!form || !sheet) return;
  event.preventDefault();
  sheet.onSubmit(formFrom(form));
});

window.addEventListener("hashchange", render);
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
