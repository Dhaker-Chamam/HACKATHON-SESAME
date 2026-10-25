"use strict";

/* Bionic Passport front end. Plain JS, no build step. All results come from the API. */

// ---------- API ----------

async function request(path, options = {}) {
  const res = await fetch(path, options);
  if (res.status === 204) return null;
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const detail = body && body.detail;
    const msg = Array.isArray(detail)
      ? detail.map((d) => `${(d.loc || []).slice(1).join(" ")}: ${d.msg}`).join("; ")
      : detail || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}
const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  del: (p) => request(p, { method: "DELETE" }),
};

// ---------- small helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const session = {
  get(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const fmtNum = (x, d = 1) => Number(x).toFixed(d).replace(/\.0+$/, "");
const fmtDelay = (s) => (s < 90 ? `${fmtNum(s, 2)} s` : `${fmtNum(s / 60, 1)} min`);

const STATUS_WORD = { green: "Compatible", amber: "Needs action", red: "Not compatible as-is" };
const STATUS_SHORT = { green: "OK", amber: "Needs action", red: "Not as-is" };
const LEVEL_SHORT = { F: "F", E: "E", A: "A", VERIFY: "?", INPUT: "In" };
const LEVEL_LABEL = { F: "Fact", E: "Estimate", A: "Assumption", VERIFY: "Verify", INPUT: "Input" };
const KIND_LABEL = {
  factsheet: "Fact sheet", paper: "Paper", standard: "Standard or guideline", ifu: "Manufacturer instructions",
  regulation: "Regulation", news: "News report", press: "Press release", report: "Technical report",
  derivation: "Derived value", assumption: "Team assumption", placeholder: "Source still to attach",
};

function icon(status) {
  if (status === "green") return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.5 10.5l3 3 6-7" fill="none" stroke="#fff" stroke-width="2.2"/></svg>';
  if (status === "amber") return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l9 16.5H1z" fill="currentColor"/><path d="M10 7v5.5M10 14.6v1.6" stroke="#fff" stroke-width="2.2"/></svg>';
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.3 1h7.4L19 6.3v7.4L13.7 19H6.3L1 13.7V6.3z" fill="currentColor"/><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="#fff" stroke-width="2.2"/></svg>';
}
const statusMark = (s, short = false) => `<span class="status ${s}">${icon(s)}${short ? STATUS_SHORT[s] : STATUS_WORD[s]}</span>`;

function badge(level, source, note = "") {
  if (level === "INPUT") return `<span class="ev ev-INPUT" title="Entered by you">${LEVEL_SHORT.INPUT}</span>`;
  return `<button type="button" class="ev ev-${esc(level)}" data-src="${esc(source)}" data-level="${esc(level)}" data-note="${esc(note)}" aria-label="${esc(LEVEL_LABEL[level])}: show source">${LEVEL_SHORT[level]}</button>`;
}
const legend = () => `<div class="legend" aria-label="Evidence marks">Evidence:
  <span>${badge("F", "")} Fact</span><span>${badge("E", "")} Estimate</span><span>${badge("A", "")} Assumption</span>
  <span>${badge("VERIFY", "")} Verify</span><span>${badge("INPUT", "")} Your input</span></div>`;

// ---------- state ----------

const ref = { envs: [], envById: {}, devices: [], devById: {}, sources: {}, rules: null, health: null };
const DEMO = [
  { device_id: "powered_ankle", inputs: {} },
  { device_id: "mpk_knee", inputs: {} },
  { device_id: "insulin_pump", inputs: {} },
  { device_id: "pacemaker", inputs: { pacing_dependent: true } },
  { device_id: "icd", inputs: {} },
  { device_id: "cochlear_implant", inputs: {} },
  { device_id: "endoprosthesis", inputs: {} },
];
const saved = session.get("bp-state") || {};
const state = {
  ack: Boolean(saved.ack),
  envId: saved.envId || "moon_habitat",
  days: saved.days || 30,
  selected: saved.selected || [],
  open: new Set(saved.open || ["powered_ankle"]),
  settingsOpen: new Set(saved.settingsOpen || []),
  report: null,
  seq: 0,
};
function persist() {
  session.set("bp-state", { ack: state.ack, envId: state.envId, days: state.days, selected: state.selected,
    open: [...state.open], settingsOpen: [...state.settingsOpen] });
}
function inputsFor(sel) {
  const dev = ref.devById[sel.device_id];
  const out = {};
  for (const spec of dev.inputs) out[spec.key] = sel.inputs[spec.key] ?? spec.default;
  return out;
}

// ---------- popover (sources and evidence) ----------

const pop = () => $("#popover");
function openPopover(anchor) {
  const id = anchor.dataset.src;
  const level = anchor.dataset.level;
  const note = anchor.dataset.note;
  const s = ref.sources[id];
  const meaning = level && ref.rules ? (ref.rules.evidence_legend.find((l) => l.level === level) || {}).meaning : "";
  const parts = [];
  if (level) parts.push(`<p class="pop-title">${badge(level, "")} ${esc(LEVEL_LABEL[level])}</p><p>${esc(meaning)}</p>`);
  if (note) parts.push(`<p class="pop-note">${esc(note)}</p>`);
  if (s) {
    parts.push(`<p class="pop-title">${esc(s.author_org)}${s.year ? ` (${s.year})` : ""}</p><p>${esc(s.title)}</p>`);
    parts.push(`<p class="pop-meta">${esc(KIND_LABEL[s.kind] || s.kind)}. ${s.verified ? "Checked against the document during preparation." : "Not yet confirmed against the original document."}${s.note ? " " + esc(s.note) : ""}</p>`);
    if (s.url) parts.push(`<p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open source in a new tab</a></p>`);
  } else if (!level) {
    return;
  }
  const el = pop();
  el.innerHTML = `<button type="button" class="btn btn-quiet close" aria-label="Close">✕</button>${parts.join("")}`;
  el.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.top = `${r.bottom + window.scrollY + 6}px`;
  el.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8))}px`;
  el.dataset.anchor = id;
  $(".close", el).focus();
  closePopover.anchor = anchor;
}
function closePopover() {
  const el = pop();
  if (el.hidden) return;
  el.hidden = true;
  if (closePopover.anchor && document.body.contains(closePopover.anchor)) closePopover.anchor.focus();
}
document.addEventListener("click", (e) => {
  const trigger = e.target.closest(".ev[data-src], .src");
  if (trigger && trigger.dataset.src !== undefined && (trigger.dataset.src || trigger.dataset.level)) {
    e.preventDefault();
    openPopover(trigger);
    return;
  }
  if (e.target.closest(".popover .close") || !e.target.closest(".popover")) closePopover();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); });

// ---------- shared renderers ----------

function factValue(key, p, env) {
  switch (key) {
    case "gravity_ms2": return p.value === 0 ? "Microgravity" : `${p.value} m/s²`;
    case "p_kpa": return `${p.value} kPa`;
    case "o2_fraction": return `${fmtNum(p.value * 100, 1)}%`;
    case "temp_c": return `${p.min} to ${p.max} °C`;
    case "h_rate_msv_day": return p.min != null && p.max != null && p.min !== p.max ? `${p.min} to ${p.max} mSv/day` : `${p.value ?? p.max} mSv/day`;
    case "delay_s": return `${fmtDelay(p.min)} to ${fmtDelay(p.max)}`;
    default: return String(p.value);
  }
}
const FACTS = [["gravity_ms2", "Gravity"], ["p_kpa", "Pressure at the device"], ["o2_fraction", "Oxygen in the air"],
  ["temp_c", "Temperature at the device"], ["h_rate_msv_day", "Radiation (dose equivalent)"], ["delay_s", "One-way light delay to Earth"]];

function envHeader(env) {
  const facts = FACTS.map(([k, label]) => {
    const p = env.params[k];
    const extra = k === "gravity_ms2" && p.value > 0 ? `<span class="fact-sub">${fmtNum(env.g_ratio, 3)} of Earth</span>` : "";
    return `<div><dt>${label}</dt><dd><span class="fact-val">${esc(factValue(k, p, env))}</span> ${badge(p.level, p.source, p.note)}${extra}</dd></div>`;
  }).join("");
  return `<header class="env-head">
    <h1>${esc(env.name)}</h1>
    <p class="summary">${esc(env.summary)}</p>
    <dl class="env-facts">${facts}</dl>
    ${legend()}
  </header>`;
}

function valueChips(values) {
  return values.map((v) => `<span class="v">${esc(v.label)}: <b>${esc(v.display)}</b> ${badge(v.level, v.source, v.note)}</span>`).join("");
}
const sourceLinks = (ids) => ids.map((id) => `<button type="button" class="src" data-src="${esc(id)}">${esc(id === "DERIVED" ? "derivation" : id === "TEAM" ? "team assumption" : id)}</button>`).join(" ");

function findingHtml(f) {
  const todo = f.status === "green" && /^None needed/.test(f.mitigation) ? "" : `<p class="todo"><strong>What to do:</strong> ${esc(f.mitigation)}</p>`;
  return `<article class="finding">
    <div class="rule">${statusMark(f.status, true)}${esc(f.rule_id)} ${esc(f.rule_name)}</div>
    <div class="finding-main">
      <h4>${esc(f.title)}</h4>
      <p class="why">${esc(f.explanation)}</p>
      ${todo}
      <div class="values">${valueChips(f.values)}</div>
      <div class="srcs">Sources: ${sourceLinks(f.sources)}</div>
    </div>
  </article>`;
}

function recalChart(param, envShort) {
  const W = 640, x0 = 150, right = 230, barH = 26;
  const scale = (v) => ((W - x0 - right) * v) / param.earth;
  const [lo, hi] = param.band;
  const y1 = 10, y2 = 56;
  const unit = param.unit === "%" ? "%" : ` ${param.unit}`;
  const banded = hi - lo > 1e-9;
  const bandRect = banded ? `<rect class="bar-band" x="${x0 + scale(lo)}" y="${y2}" width="${scale(hi) - scale(lo)}" height="${barH}" rx="3"/>` : "";
  const labelX = x0 + Math.max(scale(param.start), banded ? scale(hi) : 0) + 8;
  const label = banded ? `start ${fmtNum(param.start, 1)}${unit}, range to ${fmtNum(hi, 1)}${unit}` : `start ${fmtNum(param.start, 1)}${unit}`;
  return `<svg class="chart" viewBox="0 0 ${W} 96" role="img" aria-label="${esc(param.name)}: Earth ${fmtNum(param.earth, 1)}${esc(unit)}, start ${fmtNum(param.start, 1)}${esc(unit)} at ${esc(envShort)}">
    <text x="0" y="${y1 + 18}">Earth (1 g)</text>
    <rect class="bar-earth" x="${x0}" y="${y1}" width="${scale(param.earth)}" height="${barH}" rx="3"/>
    <text x="${x0 + scale(param.earth) + 8}" y="${y1 + 18}">${fmtNum(param.earth, 1)}${esc(unit)}</text>
    <text x="0" y="${y2 + 18}">${esc(envShort)}</text>
    ${bandRect}
    <rect class="bar-start" x="${x0}" y="${y2}" width="${Math.max(2, scale(param.start))}" height="${barH}" rx="3"/>
    <text x="${labelX}" y="${y2 + 18}">${esc(label)}</text>
  </svg>`;
}

function recalHtml(rc, env) {
  const banded = rc.k_hi - rc.k_lo > 1e-9;
  const k = banded ? `${fmtNum(rc.k_lo, 3)}× to ${fmtNum(rc.k_hi, 3)}×` : `${fmtNum(rc.k_lo, 3)}×`;
  const suit = rc.suited ? ` The suit (${fmtNum(rc.m_carried_kg, 1)} kg) may carry 0 to 100% of its own weight, so the result is a band.` : "";
  const rows = rc.parameters.map((p) => {
    const num = (x) => (x == null ? "not scaled" : `${fmtNum(x, 1)}${p.unit === "%" ? "%" : " " + p.unit}`);
    const band = p.band ? (p.band[1] - p.band[0] > 1e-9 ? `${num(p.band[0])} to ${num(p.band[1])}` : num(p.band[0])) : "not scaled";
    return `<tr><td>${esc(p.name)}</td><td class="num">${p.earth == null ? "" : esc(num(p.earth))}</td><td class="num">${p.start == null ? (p.band ? "recalibrate in place" : "") : esc(num(p.start))}</td><td class="num">${esc(band)}</td><td class="basis">${esc(p.basis)}</td></tr>`;
  }).join("");
  const w = rc.walking;
  const chartParam = rc.parameters.find((p) => p.start != null);
  return `<section class="recal" aria-label="Gravity recalibration">
    <h4>Gravity recalibration: starting values ${badge("A", "TEAM", "Output of our stance-load model. Starting points for a prosthetist, not final settings.")}</h4>
    <p class="formula">Weight-driven stance load at ${esc(env.short)}: <b>${k}</b> Earth.${esc(suit)}</p>
    ${chartParam ? recalChart(chartParam, env.short) : ""}
    <div class="table-wrap"><table>
      <thead><tr><th>Setting</th><th>Earth</th><th>Start here</th><th>Range</th><th>Why</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="walk">
      <p>Dynamically similar walking speed: <b>${fmtNum(w.froude_equivalent_speed_ms, 2)} m/s</b> ${badge("A", "TEAM", "Same Froude number as the Earth walking speed you entered.")}</p>
      <p>Expected switch from walking to running near <b>${fmtNum(w.walk_run_speed_ms, 2)} m/s</b> (Earth ${fmtNum(w.walk_run_speed_earth_ms, 2)} m/s, Froude number ${w.transition_froude}) ${badge(w.transition_froude_level, w.transition_froude_source, w.transition_froude_note)}</p>
      <p>${esc(w.caveat)}</p>
    </div>
    <ul class="limits">${rc.limits.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  </section>`;
}

function deviceHtml(d, env, interactive = true) {
  const open = !interactive || state.open.has(d.device_id);
  const count = d.findings.length;
  return `<section class="device ${d.status}" data-device="${esc(d.device_id)}">
    <h3 class="device-title"><button type="button" class="device-toggle" aria-expanded="${open}" aria-controls="body-${esc(d.device_id)}">
      <span><span class="name">${esc(d.name)}</span><span class="cat">${esc(d.category)}</span></span>
      <span class="chev">${statusMark(d.status)}<span class="more">${open ? "Hide" : "Show"} ${count} checks</span></span>
      <span class="headline">${esc(d.headline)}</span>
    </button></h3>
    <div class="device-body" id="body-${esc(d.device_id)}" ${open ? "" : "hidden"}>
      ${d.recalibration ? recalHtml(d.recalibration, env) : ""}
      ${d.findings.map(findingHtml).join("")}
    </div>
  </section>`;
}

function reportHtml(report, { interactive = true, savedInfo = "" } = {}) {
  const env = ref.envById[report.env_id];
  const tallyWord = (s, n) => ({ green: "compatible", amber: n === 1 ? "needs action" : "need action", red: "not compatible as-is" }[s]);
  const tally = ["red", "amber", "green"].filter((s) => report.counts[s]).map((s) =>
    `<span class="status ${s}">${icon(s)}${report.counts[s]} ${tallyWord(s, report.counts[s])}</span>`).join("");
  const tools = interactive ? `<div class="report-tools">
      <button type="button" class="btn" id="print-btn">Print for the flight surgeon</button>
      <button type="button" class="btn" id="save-btn">Save a link for 7 days</button>
    </div>` : `<div class="report-tools"><button type="button" class="btn" id="print-btn">Print for the flight surgeon</button></div>`;
  return `${envHeader(env)}
    <div class="tally"><span>Stay: <b>${report.duration_days} days</b>${env.transit_legs.length ? " plus cruise" : ""}</span>${tally}${tools}</div>
    <div class="save-note" id="save-note" aria-live="polite">${savedInfo}</div>
    <div class="devices">${report.devices.map((d) => deviceHtml(d, env, interactive)).join("")}</div>`;
}

function matrixHtml(m, { clickable = true } = {}) {
  const head = m.rows.map((r) => `<th scope="col">${esc(r.short)}</th>`).join("");
  const body = m.devices.map((dev, i) => {
    const cells = m.rows.map((r) => {
      const c = r.cells[i];
      const label = `${dev.short} at ${r.short}: ${STATUS_WORD[c.status]}. ${c.headline}`;
      return `<td><button type="button" class="cell ${c.status}" data-env="${esc(r.env_id)}" data-device="${esc(dev.device_id)}" data-detail="${esc(label)}" aria-label="${esc(label)}"${clickable ? "" : " disabled"}>${icon(c.status)}${STATUS_SHORT[c.status]}</button></td>`;
    }).join("");
    return `<tr><th scope="row">${esc(dev.short)}</th>${cells}</tr>`;
  }).join("");
  return `<table class="matrix"><thead><tr><th scope="col">Device</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function wireMatrix(root) {
  const detail = $("#matrix-detail", root);
  root.addEventListener("focusin", (e) => { const c = e.target.closest(".cell"); if (c && detail) detail.textContent = c.dataset.detail; });
  root.addEventListener("mouseover", (e) => { const c = e.target.closest(".cell"); if (c && detail) detail.textContent = c.dataset.detail; });
  root.addEventListener("click", (e) => {
    const c = e.target.closest(".cell");
    if (!c) return;
    if (!state.ack) { if (detail) detail.textContent = "Tick the box first to confirm you understand this is decision support."; $("#ack")?.focus(); return; }
    state.envId = c.dataset.env;
    if (!state.selected.some((s) => s.device_id === c.dataset.device)) state.selected = structuredClone(DEMO);
    state.open.add(c.dataset.device);
    persist();
    location.hash = "#/assess";
  });
}

// ---------- views ----------

async function viewStart(root) {
  root.innerHTML = `<section class="intro">
    <div>
      <h1>Will your implant work off Earth?</h1>
      <p class="lead">Check pacemakers, insulin pumps, cochlear implants and prostheses against space habitats and spacesuits. See every reason, its source, and what has to change.</p>
      <div class="ack">
        <p>This tool supports travelers and flight surgeons. It is not medical advice and not a clearance to fly. Every value shows how certain it is.</p>
        <label class="check"><input type="checkbox" id="ack" ${state.ack ? "checked" : ""}><span>I understand that results support a clinician's decision and do not replace it.</span></label>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="start-demo" ${state.ack ? "" : "disabled"}>Open the demo set (7 devices)</button>
          <button type="button" class="btn" id="start-empty" ${state.ack ? "" : "disabled"}>Start with no devices</button>
        </div>
      </div>
      <ul class="precedents">
        <li>2021: Hayley Arceneaux reached orbit with an internal leg prosthesis. ${sourceLinks(["S38"])}</li>
        <li>2025: ESA medically cleared John McFall, a lower-limb amputee, for long ISS missions. ${sourceLinks(["S39"])}</li>
        <li>2025: Glucose monitors and insulin pens were tested on the ISS. ${sourceLinks(["S41"])}</li>
        <li>2025: Michaela Benthaus became the first wheelchair user in space. ${sourceLinks(["S40"])}</li>
      </ul>
    </div>
    <div class="matrix-wrap" id="preview">
      <h2>Seven devices, five destinations</h2>
      <p>Live results from the rules engine for a 30-day stay. Select a result to open it.</p>
      <p class="loading">Running the rules…</p>
    </div>
  </section>`;
  const ack = $("#ack", root);
  ack.addEventListener("change", () => {
    state.ack = ack.checked; persist();
    $("#start-demo", root).disabled = $("#start-empty", root).disabled = !ack.checked;
  });
  $("#start-demo", root).addEventListener("click", () => { state.selected = structuredClone(DEMO); state.envId = "moon_habitat"; state.days = 30; state.open = new Set(["powered_ankle"]); persist(); location.hash = "#/assess"; });
  $("#start-empty", root).addEventListener("click", () => { state.selected = []; persist(); location.hash = "#/assess"; });
  const preview = $("#preview", root);
  try {
    const m = await api.post("/api/matrix", { duration_days: 30, devices: DEMO });
    preview.querySelector(".loading").outerHTML = `${matrixHtml(m)}<p class="matrix-detail" id="matrix-detail"></p>`;
    wireMatrix(preview);
  } catch (err) {
    preview.querySelector(".loading").textContent = `The rules engine did not answer: ${err.message}. Check that the server is running.`;
  }
}

function setupHtml() {
  const dests = ref.envs.map((env) => {
    const g = env.params.gravity_ms2.value === 0 ? "microgravity" : `${env.params.gravity_ms2.value} m/s²`;
    return `<label class="dest"><input type="radio" name="dest" value="${esc(env.id)}" ${env.id === state.envId ? "checked" : ""}>
      <strong>${esc(env.name)}</strong>
      <span class="facts">${g}, ${env.params.p_kpa.value} kPa, ${fmtNum(env.params.o2_fraction.value * 100, 1)}% oxygen</span></label>`;
  }).join("");
  const chosen = new Set(state.selected.map((s) => s.device_id));
  const options = ref.devices.filter((d) => !chosen.has(d.id)).map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
  const selected = state.selected.map((sel, idx) => {
    const dev = ref.devById[sel.device_id];
    const vals = inputsFor(sel);
    const open = state.settingsOpen.has(sel.device_id);
    const inputs = dev.inputs.map((spec) => {
      const id = `in-${sel.device_id}-${spec.key}`;
      if (spec.type === "bool") {
        return `<label class="check"><input type="checkbox" id="${id}" data-idx="${idx}" data-key="${esc(spec.key)}" ${vals[spec.key] ? "checked" : ""}><span>${esc(spec.label)}${spec.help ? `<br><span class="hint">${esc(spec.help)}</span>` : ""}</span></label>`;
      }
      const step = spec.max <= 3 ? 0.05 : 1;
      return `<div class="field"><label for="${id}">${esc(spec.label)}</label>
        <div class="range-row"><input type="range" id="${id}" min="${spec.min}" max="${spec.max}" step="${step}" value="${vals[spec.key]}" data-idx="${idx}" data-key="${esc(spec.key)}" data-unit="${esc(spec.unit)}">
        <output for="${id}">${fmtNum(vals[spec.key], 2)} ${esc(spec.unit)}</output></div></div>`;
    }).join("");
    const toggle = dev.inputs.length ? `<button type="button" class="btn btn-quiet" data-settings="${esc(sel.device_id)}" aria-expanded="${open}">${open ? "Hide settings" : "Settings"}</button>` : "";
    return `<div class="sel"><div class="sel-head"><span>${esc(dev.short)}</span><span>${toggle}<button type="button" class="btn btn-quiet" data-remove="${idx}" aria-label="Remove ${esc(dev.short)}">Remove</button></span></div>
      ${dev.inputs.length ? `<div class="sel-inputs" ${open ? "" : "hidden"}>${inputs}</div>` : ""}</div>`;
  }).join("");
  return `<fieldset class="dest-list"><legend>Destination</legend>${dests}</fieldset>
    <div class="field"><label for="days">Stay length</label>
      <div class="range-row"><input type="range" id="days" min="1" max="1000" step="1" value="${state.days}"><output for="days">${state.days} days</output></div>
      <span class="hint">Mars profiles add 180 days of cruise each way for radiation.</span></div>
    <section aria-label="Devices"><h2>Devices</h2>
      ${options ? `<div class="device-picker field"><select id="add-device" aria-label="Device to add">${options}</select><button type="button" class="btn" id="add-btn">Add</button></div>` : `<p class="hint">All seven device types are added.</p>`}
      <div class="selected-devices">${selected || '<p class="hint">No devices yet. Add one above.</p>'}</div>
    </section>`;
}

async function runAssessment() {
  const target = $("#report");
  if (!target) return;
  if (!state.selected.length) {
    state.report = null;
    target.innerHTML = `${envHeader(ref.envById[state.envId])}<p class="empty">Add a device on the left to see what changes at this destination.</p>`;
    return;
  }
  const seq = ++state.seq;
  try {
    const report = await api.post("/api/assess", { env_id: state.envId, duration_days: state.days,
      devices: state.selected.map((s) => ({ device_id: s.device_id, inputs: inputsFor(s) })) });
    if (seq !== state.seq) return; // a newer request is in flight
    state.report = report;
    target.innerHTML = reportHtml(report);
  } catch (err) {
    if (seq !== state.seq) return;
    target.innerHTML = `<p class="empty">The rules engine rejected this input: ${esc(err.message)}</p>`;
  }
}
const runSoon = debounce(runAssessment, 120);

function viewAssess(root) {
  if (!state.ack) { location.hash = "#/"; return; }
  root.innerHTML = `<div class="workspace"><aside class="setup" id="setup" aria-label="Assessment setup">${setupHtml()}</aside>
    <section class="report" id="report" aria-live="polite"><p class="loading">Running the rules…</p></section></div>`;
  const setup = $("#setup", root);
  const rerenderSetup = () => { setup.innerHTML = setupHtml(); };

  setup.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "dest") { state.envId = t.value; persist(); runAssessment(); return; }
    if (t.type === "checkbox" && t.dataset.key) { state.selected[t.dataset.idx].inputs[t.dataset.key] = t.checked; persist(); runAssessment(); }
  });
  setup.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "days") { state.days = Number(t.value); t.nextElementSibling.textContent = `${t.value} days`; persist(); runSoon(); return; }
    if (t.type === "range" && t.dataset.key) {
      state.selected[t.dataset.idx].inputs[t.dataset.key] = Number(t.value);
      t.nextElementSibling.textContent = `${fmtNum(t.value, 2)} ${t.dataset.unit}`;
      persist(); runSoon();
    }
  });
  setup.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "add-btn") {
      const id = $("#add-device", setup).value;
      state.selected.push({ device_id: id, inputs: {} });
      state.open.add(id);
    } else if (t.dataset.remove !== undefined) {
      state.selected.splice(Number(t.dataset.remove), 1);
    } else if (t.dataset.settings) {
      const id = t.dataset.settings;
      state.settingsOpen.has(id) ? state.settingsOpen.delete(id) : state.settingsOpen.add(id);
    } else return;
    persist(); rerenderSetup(); runAssessment();
  });

  const report = $("#report", root);
  report.addEventListener("click", async (e) => {
    const toggle = e.target.closest(".device-toggle");
    if (toggle) {
      const sec = toggle.closest(".device");
      const id = sec.dataset.device;
      const body = $(".device-body", sec);
      const open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      $(".more", sec).textContent = `${open ? "Hide" : "Show"} ${sec.querySelectorAll(".finding").length} checks`;
      open ? state.open.add(id) : state.open.delete(id);
      persist();
      return;
    }
    if (e.target.closest("#print-btn")) { window.print(); return; }
    if (e.target.closest("#save-btn")) {
      const note = $("#save-note", report);
      try {
        const rep = await api.post("/api/assess", { env_id: state.envId, duration_days: state.days, save: true,
          devices: state.selected.map((s) => ({ device_id: s.device_id, inputs: inputsFor(s) })) });
        const url = `${location.origin}/#/report/${rep.report_id}`;
        note.innerHTML = `Saved. Anyone with this link can open the report until it is deleted automatically in 7 days: <code>${esc(url)}</code>
          <button type="button" class="btn btn-quiet" data-copy="${esc(url)}">Copy link</button>
          <button type="button" class="btn btn-quiet" data-delete="${esc(rep.report_id)}">Delete now</button>`;
      } catch (err) { note.textContent = `Not saved: ${err.message}`; }
      return;
    }
    const copy = e.target.closest("[data-copy]");
    if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = "Copied"; } catch { copy.textContent = "Copy failed: select the link"; } return; }
    const del = e.target.closest("[data-delete]");
    if (del) { try { await api.del(`/api/reports/${del.dataset.delete}`); $("#save-note", report).textContent = "Deleted. The link no longer works."; } catch (err) { $("#save-note", report).textContent = `Not deleted: ${err.message}`; } }
  });
  runAssessment();
}

async function viewCompare(root) {
  if (!state.ack) { location.hash = "#/"; return; }
  const devices = state.selected.length ? state.selected : DEMO;
  root.innerHTML = `<div class="matrix-wrap" id="cmp"><h2>Compare destinations</h2>
    <p>${state.selected.length ? "Your devices" : "Demo set"} for a ${state.days}-day stay. Select a result to open its full reasons.</p>
    <p class="loading">Running the rules…</p></div>`;
  const wrap = $("#cmp", root);
  try {
    const m = await api.post("/api/matrix", { duration_days: state.days, devices: devices.map((s) => ({ device_id: s.device_id, inputs: inputsFor(s) })) });
    $(".loading", wrap).outerHTML = `${matrixHtml(m)}<p class="matrix-detail" id="matrix-detail"></p>`;
    wireMatrix(wrap);
  } catch (err) { $(".loading", wrap).textContent = `The rules engine did not answer: ${err.message}`; }
}

function viewMethods(root) {
  const r = ref.rules;
  const legendRows = r.evidence_legend.map((l) => `<tr><td>${badge(l.level, "")}</td><td><b>${esc(l.label)}</b></td><td>${esc(l.meaning)}</td></tr>`).join("");
  const ruleRows = r.rules.map((x) => `<tr><td class="id">${esc(x.id)}</td><td><b>${esc(x.name)}</b><br>${esc(x.checks)}</td><td>${esc(x.decision)}</td><td>${sourceLinks(x.sources)}</td></tr>`).join("");
  const polRows = r.policies.map((p) => `<tr><td>${esc(p.label)}</td><td class="id">${esc(String(p.value))} ${esc(p.unit)}</td><td>${badge(p.level, p.source, p.note)}</td><td>${esc(p.note)}</td></tr>`).join("");
  const srcRows = Object.values(ref.sources).filter((s) => !["DERIVED", "TEAM"].includes(s.id)).map((s) =>
    `<tr><td class="id">${esc(s.id)}</td><td>${esc(s.author_org)}${s.year ? ` (${s.year})` : ""}. ${esc(s.title)}.${s.note ? ` <i>${esc(s.note)}</i>` : ""}</td><td>${esc(KIND_LABEL[s.kind] || s.kind)}</td>
      <td>${s.verified ? "Checked" : "To verify"}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Link</a>` : ""}</td></tr>`).join("");
  root.innerHTML = `<div class="methods">
    <section class="prose"><h1>Methods and sources</h1>
      <p>Every result comes from nine fixed rules applied to sourced data. The same input always gives the same output. No AI model takes part in any decision: the reasoning has to be checkable by a clinician.</p>
      <p>Unknown is never shown as compatible. A missing rating or an assumed value gives at least "needs action".</p></section>
    <section><h2>How to read the evidence marks</h2><div class="table-wrap"><table class="table legend-table"><tbody>${legendRows}</tbody></table></div></section>
    <section><h2>The nine rules</h2><div class="table-wrap"><table class="table"><thead><tr><th>Rule</th><th>What it checks</th><th>Decision</th><th>Sources</th></tr></thead><tbody>${ruleRows}</tbody></table></div></section>
    <section><h2>Thresholds and constants</h2><p class="prose">Values marked Assumption are our policy choices. They can be challenged and changed in one place.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Threshold</th><th>Value</th><th>Evidence</th><th>Reason</th></tr></thead><tbody>${polRows}</tbody></table></div></section>
    <section class="prose"><h2>Gravity recalibration model</h2>
      <p>Over one steady step cycle, the average vertical force from the ground equals the weight being carried. Stance-phase joint moments are mostly that force times a lever arm, and lever arms change only modestly in reduced gravity. So we scale weight-driven stance settings by:</p>
      <p><b>k = ((body mass + f × suit mass) / body mass) × (g destination / 9.80665)</b></p>
      <p>f is the share of suit weight carried by the legs. Pressurized suits partly or completely carry their own weight, so f runs from 0 to 1 and the result is a band. Swing-phase settings are not scaled because swing is driven by leg inertia. The model never raises a setting above its Earth value.</p>
      <p>For push-off assist we start at the low end of the band (too much push-off in low gravity can launch the user). For knee stance resistance we start at the high end (too little risks buckling).</p></section>
    <section class="prose"><h2>What this tool does not do</h2>
      <ul><li>No device was tested in low pressure, pure oxygen or reduced gravity for this project.</li>
      <li>Devices are archetypes built from public manufacturer instructions, not specific models or firmware.</li>
      <li>Memory upsets from radiation are flagged, not quantified.</li>
      <li>The gait model is quasi-static and ignores suit joint torques and changes in walking strategy.</li>
      <li>No clinician has reviewed the rules yet.</li></ul></section>
    <section><h2>Sources</h2><div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>Reference</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${srcRows}</tbody></table></div></section>
    <section class="prose"><h2>Credits and AI use</h2>
      <p>Built with Python, FastAPI, Starlette, Pydantic, Uvicorn, SQLite and pytest. Typeface: Atkinson Hyperlegible Next by the Braille Institute (SIL Open Font License).</p>
      <p>We used Claude (Anthropic) to help plan the product, search the literature and write code. Every numeric value was checked against its linked source or is marked Assumption or Verify. The product uses no AI at runtime.</p></section>
  </div>`;
}

async function viewSavedReport(root, id) {
  root.innerHTML = `<p class="loading">Opening saved report…</p>`;
  try {
    const rep = await api.get(`/api/reports/${encodeURIComponent(id)}`);
    const until = new Date(rep.expires_at).toLocaleString();
    root.innerHTML = `<section class="report">${reportHtml(rep, { interactive: false, savedInfo: `Saved report, deleted automatically on ${esc(until)}. Engine ${esc(rep.engine_version)}, data ${esc(rep.data_version)}.` })}</section>`;
    root.addEventListener("click", (e) => { if (e.target.closest("#print-btn")) window.print(); });
  } catch (err) {
    root.innerHTML = `<p class="empty">This report is not available: ${esc(err.message)}. Saved reports are deleted after 7 days.</p>`;
  }
}

// ---------- router ----------

async function route() {
  closePopover();
  const root = $("#app");
  const old = root.cloneNode(false);  // drop listeners from the previous view
  root.replaceWith(old);
  const hash = location.hash || "#/";
  const [, view, arg] = hash.split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === view));
  document.querySelectorAll("[data-nav][aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  if (view === "assess") viewAssess(old);
  else if (view === "compare") await viewCompare(old);
  else if (view === "methods") viewMethods(old);
  else if (view === "report" && arg) await viewSavedReport(old, arg);
  else await viewStart(old);
  old.focus({ preventScroll: true });
}

async function boot() {
  try {
    const [envs, devices, sources, rules, health] = await Promise.all([
      api.get("/api/destinations"), api.get("/api/devices"), api.get("/api/sources"), api.get("/api/rules"), api.get("/api/health")]);
    Object.assign(ref, { envs, devices, rules, health });
    envs.forEach((e) => { ref.envById[e.id] = e; });
    devices.forEach((d) => { ref.devById[d.id] = d; });
    sources.forEach((s) => { ref.sources[s.id] = s; });
    state.selected = state.selected.filter((s) => ref.devById[s.device_id]);
    if (!ref.envById[state.envId]) state.envId = "moon_habitat";
    $("#versions").textContent = `Engine ${health.engine_version}, data ${health.data_version}`;
  } catch (err) {
    $("#app").innerHTML = `<p class="empty">Could not load reference data: ${esc(err.message)}. Start the server with run.ps1 and reload.</p>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
}
boot();
