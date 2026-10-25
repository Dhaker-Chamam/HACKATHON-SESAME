"use strict";

/* Bionic Passport UI. Every number on screen comes from data/*.json or from POST /api/assess.
 * If the API cannot be reached, results come from static/engine.js, which reads the same data files. */

const STAY_OPTIONS = [
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 182, label: "6 months" },
  { days: 365, label: "1 year" },
];
const DEFAULT_STAY = 30;
const STATUS = {
  compatible: { label: "Compatible", cls: "ok" },
  conditional: { label: "Conditional", cls: "warn" },
  not_compatible: { label: "Not compatible", cls: "bad" },
};
const STEP_HASH = { 1: "#destination", 2: "#device", 3: "#result" };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem("bp-flow")) || {}; } catch { return {}; } },
  set(v) { try { sessionStorage.setItem("bp-flow", JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const DATA = { destinations: null, devices: null };
const state = { step: 1, maxStep: 1, destId: null, deviceId: null, stayDays: DEFAULT_STAY, bodyMass: null, withMit: false, result: null, via: "server", seq: 0 };

function persist() {
  const { step, maxStep, destId, deviceId, stayDays, bodyMass, withMit } = state;
  session.set({ step, maxStep, destId, deviceId, stayDays, bodyMass, withMit });
}
const dests = () => DATA.destinations.destinations;
const devices = () => DATA.devices.devices;
const destById = (id) => dests().find((d) => d.id === id);
const deviceById = (id) => devices().find((d) => d.id === id);
const fmt = (x, d) => BPEngine.fmt(x, d);

// ---------- icons and illustrations ----------

function statusIcon(status) {
  if (status === "compatible") return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.6 10.4l2.9 2.9 5.9-6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (status === "conditional") return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6l8.9 16.2H1.1z" fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"/><path d="M10 7.2v5M10 14.8v.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.3 1h7.4L19 6.3v7.4L13.7 19H6.3L1 13.7V6.3z" fill="currentColor"/><path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
}
const badge = (status, xl = false) => `<span class="badge ${STATUS[status].cls}${xl ? " badge-xl" : ""}">${statusIcon(status)}${STATUS[status].label}</span>`;
const CHECK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TODO_FIX = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TODO_LOWER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v9M8 12.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PRINT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

const STARS = '<g fill="#fff"><circle cx="24" cy="22" r="1.2" opacity=".55"/><circle cx="62" cy="58" r="0.9" opacity=".4"/><circle cx="118" cy="18" r="1" opacity=".5"/><circle cx="300" cy="30" r="1.2" opacity=".5"/><circle cx="340" cy="74" r="0.9" opacity=".35"/><circle cx="270" cy="120" r="1" opacity=".4"/><circle cx="44" cy="128" r="1" opacity=".35"/><circle cx="188" cy="26" r="0.8" opacity=".45"/></g>';
const ILLUSTRATIONS = {
  orbit: `<svg viewBox="0 0 360 168" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${STARS}
    <ellipse cx="180" cy="300" rx="300" ry="170" fill="#2B5CC4"/><ellipse cx="180" cy="300" rx="300" ry="170" fill="none" stroke="#8FB3F2" stroke-width="3" opacity=".7"/>
    <g transform="translate(180 70)"><rect x="-70" y="-7" width="46" height="14" rx="2" fill="#5F7FB8"/><rect x="24" y="-7" width="46" height="14" rx="2" fill="#5F7FB8"/>
    <path d="M-66 -7v14M-56 -7v14M-46 -7v14M-36 -7v14M28 -7v14M38 -7v14M48 -7v14M58 -7v14" stroke="#2C3E66" stroke-width="1.2"/>
    <rect x="-24" y="-3" width="48" height="6" fill="#C9D2E3"/><rect x="-14" y="-11" width="28" height="22" rx="6" fill="#E8EDF6"/><circle cx="0" cy="0" r="4" fill="#9FB0CF"/></g></svg>`,
  moon: `<svg viewBox="0 0 360 168" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${STARS}
    <circle cx="180" cy="84" r="58" fill="#C9CDD4"/><circle cx="160" cy="66" r="12" fill="#B3B9C3"/><circle cx="200" cy="100" r="16" fill="#B3B9C3"/>
    <circle cx="206" cy="58" r="7" fill="#B3B9C3"/><circle cx="152" cy="108" r="6" fill="#B3B9C3"/><circle cx="180" cy="84" r="58" fill="none" stroke="#E6E9EE" stroke-width="2" opacity=".6"/></svg>`,
  mars: `<svg viewBox="0 0 360 168" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${STARS}
    <circle cx="180" cy="84" r="58" fill="#B8644A"/><path d="M128 70c18 6 34 2 52 8s36 4 52-2" fill="none" stroke="#9A4F3A" stroke-width="7" stroke-linecap="round" opacity=".7"/>
    <path d="M136 104c16-4 30 4 46 0s30-6 42-2" fill="none" stroke="#9A4F3A" stroke-width="5" stroke-linecap="round" opacity=".6"/>
    <ellipse cx="180" cy="30" rx="18" ry="5" fill="#F1E4DD" opacity=".9"/></svg>`,
};
const DEVICE_ICONS = {
  powered_knee: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3h14l-2 12H15z"/><circle cx="20" cy="19" r="4"/><path d="M18.5 19h3"/><path d="M20 23v11"/><path d="M20 34h8l2 3H17z"/></svg>',
  pacemaker: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="13" height="10" rx="4"/><path d="M17 9c6 0 7 4 7 9"/><path d="M28 36s-10-6-10-13a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13z"/></svg>',
  insulin_pump: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="18" height="26" rx="4"/><rect x="8" y="11" width="10" height="7" rx="1.5"/><circle cx="13" cy="25" r="2.2"/><path d="M22 14c8 0 6 14 12 16"/><circle cx="34" cy="32" r="3"/></svg>',
  cochlear_implant: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 28c0 4 3 7 7 7s6-3 6-6c0-4 6-6 6-14a11 11 0 0 0-22 0"/><path d="M15 15a5 5 0 0 1 10 0c0 3-3 4-3 7"/><circle cx="31" cy="27" r="3.5"/><path d="M34 9v8"/></svg>',
};

// ---------- formatting helpers built on the data ----------

function gravityText(d) {
  const g = d.gravity_ms2.value;
  if (g === 0) return "Microgravity";
  return `${fmt(g, 2)} m/s² (${fmt(g / DATA.destinations.standard_gravity_ms2.value, 2)} g)`;
}
const tempText = (t) => `${fmt(t.min, 0)} to ${fmt(t.max, 0)} °C`;
const stayLabel = (days) => (STAY_OPTIONS.find((o) => o.days === days) || { label: `${days} days` }).label;

function evidenceTag(level, verified) {
  if (level === "Placeholder") return '<span class="tag tag-placeholder">Placeholder</span>';
  return `<span class="tag${verified === false ? " tag-verify" : ""}">${esc(level)}${verified === false ? " (to verify)" : ""}</span>`;
}
const sourceLink = (src) => (src && src.url
  ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title)}</a>`
  : `<span class="src">${esc(src ? src.title : "")}</span>`);

// ---------- API with local fallback ----------

class InputError extends Error {}

async function fetchAssessment(req) {
  let res;
  try {
    res = await fetch("/api/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  } catch {
    res = null; // server unreachable
  }
  if (res && res.ok) return { data: await res.json(), via: "server" };
  if (res && (res.status === 404 || res.status === 422)) {
    let detail = "The request was rejected.";
    try { const j = await res.json(); detail = typeof j.detail === "string" ? j.detail : detail; } catch { /* no body */ }
    throw new InputError(detail);
  }
  try {
    return { data: BPEngine.assess(DATA, req), via: "browser" };
  } catch (err) {
    throw new InputError(err.message);
  }
}

// ---------- navigation ----------

function canEnter(step) {
  if (step >= 2 && !state.destId) return false;
  if (step >= 3 && !state.deviceId) return false;
  return step <= state.maxStep || step === state.step + 1;
}

function go(step, { push = true } = {}) {
  if (!canEnter(step)) return;
  state.step = step;
  state.maxStep = Math.max(state.maxStep, step);
  persist();
  if (push && location.hash !== STEP_HASH[step]) history.pushState({ step }, "", STEP_HASH[step]);
  render(true);
}

function updateProgress() {
  $("#progress-fill").style.transform = `scaleX(${(state.step - 1) / 2})`;
  document.querySelectorAll(".pstep").forEach((btn) => {
    const n = Number(btn.dataset.step);
    const done = n < state.step;
    btn.classList.toggle("done", done);
    btn.toggleAttribute("aria-current", n === state.step);
    if (n === state.step) btn.setAttribute("aria-current", "step");
    btn.disabled = n !== state.step && !canEnter(n);
    $(".pdot", btn).innerHTML = done ? CHECK : String(n);
    btn.setAttribute("aria-label", `Step ${n}: ${$(".plabel", btn).textContent}${done ? ", completed" : ""}`);
  });
}

function enterAnimation(el) {
  if (!el || !el.animate) return;
  const frames = reducedMotion()
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }];
  el.animate(frames, { duration: reducedMotion() ? 120 : 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
}

// ---------- step 1: destination ----------

function viewDestination() {
  const cards = dests().map((d) => {
    const ot = d.outside_temp_c;
    const otTag = ot.evidence === "Placeholder" ? ' <span class="tag tag-placeholder">Placeholder</span>' : "";
    return `<label class="card pick dest-card">
      <input type="radio" name="dest" value="${esc(d.id)}" class="sr-only" ${d.id === state.destId ? "checked" : ""}>
      <span class="pick-art">${ILLUSTRATIONS[d.id] || ""}</span>
      <span class="pick-check">${CHECK}</span>
      <span class="pick-body">
        <span class="pick-title">${esc(d.name)}</span>
        <span class="pick-sub">${esc(d.place)}</span>
        <span class="facts">
          <span class="fact"><span class="fact-label">Gravity</span><span class="fact-value">${esc(gravityText(d))}</span></span>
          <span class="fact"><span class="fact-label">Outside temperature</span><span class="fact-value">${esc(tempText(ot))}${otTag}</span></span>
          <span class="fact"><span class="fact-label">Light delay to Earth</span><span class="fact-value">${esc(BPEngine.delayText(d.light_delay_s.min, d.light_delay_s.max))}</span></span>
        </span>
      </span>
    </label>`;
  }).join("");
  const stays = STAY_OPTIONS.map((o) => `<label><input type="radio" name="stay" value="${o.days}" class="sr-only" ${o.days === state.stayDays ? "checked" : ""}><span>${o.label}</span></label>`).join("");
  return `<section class="step" aria-labelledby="step-title">
    <header class="step-head"><h1 id="step-title" tabindex="-1">Where are you going?</h1>
      <p>Pick a destination. We check how your device copes with life inside the habitat.</p></header>
    <div class="cards cards-3" role="radiogroup" aria-label="Destination">${cards}</div>
    <div class="stay"><span class="field-label" id="stay-label">How long will you stay?</span>
      <div class="segmented" role="radiogroup" aria-labelledby="stay-label">${stays}</div>
      <p class="hint" id="stay-hint"></p></div>
    <div class="actions"><span class="hint" id="next-hint"></span><button type="button" class="btn btn-primary" id="next">Continue</button></div>
  </section>`;
}

function syncDestination() {
  const next = $("#next");
  next.disabled = !state.destId;
  $("#next-hint").textContent = state.destId ? "" : "Choose a destination to continue.";
  const d = state.destId && destById(state.destId);
  const travel = d && d.transit_days_each_way.value;
  $("#stay-hint").textContent = travel ? `${d.name} trips also include about ${fmt(travel / 30.4, 0)} months of travel each way.` : "";
}

// ---------- step 2: device ----------

function viewDevice() {
  const cards = devices().map((dev) => `<label class="card pick device-card">
      <input type="radio" name="device" value="${esc(dev.id)}" class="sr-only" ${dev.id === state.deviceId ? "checked" : ""}>
      <span class="pick-check">${CHECK}</span>
      <span class="pick-body">
        <span class="device-icon">${DEVICE_ICONS[dev.id] || ""}</span>
        <span class="pick-title">${esc(dev.name)}</span>
        <span class="pick-sub">${esc(dev.summary)}</span>
      </span>
    </label>`).join("");
  return `<section class="step" aria-labelledby="step-title">
    <header class="step-head"><h1 id="step-title" tabindex="-1">Which device do you rely on?</h1>
      <p>Pick one device. We check it for life ${esc(destById(state.destId).where)}.</p></header>
    <div class="cards cards-4" role="radiogroup" aria-label="Medical device">${cards}</div>
    <div id="mass-slot"></div>
    <div class="actions"><span class="hint" id="next-hint"></span>
      <button type="button" class="btn" id="back">Back</button>
      <button type="button" class="btn btn-primary" id="next">See result</button></div>
  </section>`;
}

function syncDevice() {
  const dev = state.deviceId && deviceById(state.deviceId);
  const spec = dev && dev.body_mass_kg;
  const slot = $("#mass-slot");
  if (spec) {
    if (state.bodyMass === null) state.bodyMass = spec.default;
    if (!$("#mass", slot)) {
      slot.innerHTML = `<div class="card mass">
        <label class="field-label" for="mass">Body mass</label>
        <div class="mass-row"><input type="range" id="mass" min="${spec.min}" max="${spec.max}" step="1" value="${state.bodyMass}" aria-describedby="mass-hint">
          <output for="mass" id="mass-out">${state.bodyMass} kg</output></div>
        <p class="hint" id="mass-hint">Used to estimate knee torque. This knee is rated for ${fmt(spec.min, 0)} to ${fmt(spec.max, 0)} kg.</p>
      </div>`;
      enterAnimation(slot.firstElementChild);
    }
  } else {
    slot.innerHTML = "";
  }
  $("#next").disabled = !state.deviceId;
  $("#next-hint").textContent = state.deviceId ? "" : "Choose a device to continue.";
}

// ---------- step 3: result ----------

function chartHtml(rc, destName) {
  const W = 360, labelW = 64, valueW = 52, barH = 22, gap = 2, groupGap = 22;
  const plotW = W - labelW - valueW;
  const max = Math.max(...rc.earth_nm, ...rc.destination_nm, 1);
  const x = (v) => (plotW * v) / max;
  const bar = (px, py, w, cls, label) => {
    const r = Math.min(4, w);
    const d = w <= 0 ? "" : `M${px},${py} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${barH - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`;
    return `<path class="bar ${cls}" d="${d || `M${px},${py} h0.01 v${barH} h-0.01 z`}" tabindex="0" role="img" aria-label="${esc(label)}" data-tip="${esc(label)}"/>`;
  };
  const phaseName = { stance: "Stance", swing: "Swing" };
  let y = 4, body = "";
  rc.phases.forEach((phase, i) => {
    const e = rc.earth_nm[i], d = rc.destination_nm[i];
    const groupH = barH * 2 + gap;
    body += `<text class="axis-label" x="0" y="${y + groupH / 2 + 6}">${phaseName[phase]}</text>`;
    body += bar(labelW, y, x(e), "bar-earth", `${phaseName[phase]} phase on Earth: ${fmt(e, 1)} N·m`);
    body += `<text x="${labelW + x(e) + 6}" y="${y + 17}">${fmt(e, 1)}</text>`;
    body += bar(labelW, y + barH + gap, x(d), "bar-dest", `${phaseName[phase]} phase, ${destName}: ${fmt(d, 1)} N·m`);
    body += `<text x="${labelW + x(d) + 6}" y="${y + barH + gap + 17}">${fmt(d, 1)}</text>`;
    y += groupH + groupGap;
  });
  const H = y - groupGap + 4;
  const rows = rc.phases.map((p, i) => `<tr><td>${phaseName[p]}</td><td>${fmt(rc.earth_nm[i], 1)}</td><td>${fmt(rc.destination_nm[i], 1)}</td></tr>`).join("");
  return `<section class="card panel chart-card" aria-labelledby="chart-title">
    <div class="chart-head"><h2 id="chart-title">Knee assist torque (N·m)</h2>${evidenceTag(rc.evidence_level)}</div>
    <div class="chart-legend"><span><i class="swatch swatch-earth"></i>Earth (1 g)</span><span><i class="swatch swatch-dest"></i>${esc(destName)} (${fmt(rc.g_ratio, 2)} g)</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Knee assist torque on Earth and at ${esc(destName)}">
      <line class="baseline" x1="${labelW}" y1="0" x2="${labelW}" y2="${H}"/>${body}
    </svg>
    <div class="chart-note"><p>Stance support carries your weight, so it shrinks with gravity. Swing is mostly the leg's own momentum, so it barely changes.</p>
      <p>Earth values are placeholders based on ${esc(fmt(rc.body_mass_kg, 0))} kg body mass. Scaling basis: ${sourceLink(rc.source)}</p></div>
    <details class="table-view"><summary>Show values as a table</summary>
      <table><thead><tr><th>Phase</th><th>Earth</th><th>${esc(destName)}</th></tr></thead><tbody>${rows}</tbody></table></details>
  </section>`;
}

function viewResultShell() {
  return `<section class="step" aria-labelledby="step-title">
    <h1 id="step-title" class="sr-only" tabindex="-1">Result</h1>
    <div id="result" class="result" aria-live="polite"><p class="boot">Checking your device…</p></div>
  </section>`;
}

function resultHtml(r) {
  const dest = destById(r.destination.id);
  const dev = deviceById(r.device.id);
  const switcher = dests().map((d) => `<label><input type="radio" name="switch-dest" value="${esc(d.id)}" class="sr-only" ${d.id === r.destination.id ? "checked" : ""}><span>${esc(d.name)}</span></label>`).join("");
  const fixedOrLowered = (f) => {
    if (!r.with_mitigations) return "";
    if (f.fixed) return '<span class="tag tag-fixed">Fixed by a change</span>';
    if (r.mitigations.some((m) => (m.reduces || []).includes(f.factor))) return '<span class="tag">Risk lowered</span>';
    return "";
  };
  const factors = r.factors.map((f) => `<li class="factor">
      <div class="factor-main">
        <div class="factor-head"><span class="factor-name">${esc(f.label)}</span>${badge(f.status)}${fixedOrLowered(f)}</div>
        <p class="factor-why">${esc(f.explanation)}</p>
        <div class="factor-src">${evidenceTag(f.evidence_level, f.verified)}${sourceLink(f.source)}</div>
      </div>
      <div class="factor-values">
        <span><span class="kv-label">At destination</span><span class="kv-value">${esc(f.destination_value)}</span></span>
        <span><span class="kv-label">Device limit</span><span class="kv-value">${esc(f.device_limit)}</span></span>
      </div>
    </li>`).join("");
  const labelOf = Object.fromEntries(r.factors.map((f) => [f.factor, f.label]));
  const todos = r.mitigations.map((m) => {
    const fixes = (m.resolves || []).map((k) => `<span class="tag tag-fixed">Fixes: ${esc(labelOf[k])}</span>`).join("");
    const lowers = (m.reduces || []).map((k) => `<span class="tag">Lowers risk: ${esc(labelOf[k])}</span>`).join("");
    return `<li class="todo-item">${m.resolves && m.resolves.length ? TODO_FIX : TODO_LOWER}<div><p>${esc(m.text)}</p>${fixes}${lowers}</div></li>`;
  }).join("");
  const todoBody = r.mitigations.length
    ? `<label class="switch"><input type="checkbox" role="switch" id="mit" ${r.with_mitigations ? "checked" : ""}><span class="switch-track"><span class="switch-thumb"></span></span><span>Show status after these fixes</span></label>
       <ul class="todo-list">${todos}</ul>`
    : '<p class="empty-todo">Nothing to change. Keep your usual checkups with your clinician.</p>';
  const afterLine = r.with_mitigations ? '<span class="verdict-after">Status after the fixes below</span>' : "";
  const notice = state.via === "browser"
    ? '<p class="notice">The server did not answer, so this result was computed in your browser from the same data files.</p>' : "";
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return `${notice}
    <div class="print-only print-head"><h1>Bionic Passport report</h1>
      <p>${esc(r.device.name)}, ${esc(dest.name)} (${esc(dest.place)}), stay of ${esc(stayLabel(r.stay_days))}${r.recalibration ? `, body mass ${fmt(r.recalibration.body_mass_kg, 0)} kg` : ""}. Generated ${esc(today)}.</p></div>
    <article class="card verdict" aria-label="Verdict">
      <div class="verdict-main">
        <p class="verdict-context">${esc(r.device.name)} ${esc(dest.where)}, ${esc(stayLabel(r.stay_days))}</p>
        ${badge(r.status, true)}${afterLine}
        <p class="verdict-summary">${esc(r.summary)}</p>
      </div>
      <div class="verdict-tools">
        <span class="field-label" id="switch-label">Change destination</span>
        <div class="segmented" role="radiogroup" aria-labelledby="switch-label">${switcher}</div>
        <button type="button" class="btn" id="export">${PRINT}Export report</button>
      </div>
    </article>
    <div class="result-grid">
      <section class="card panel" aria-labelledby="factors-title"><h2 id="factors-title">What we checked</h2><ul class="factor-list">${factors}</ul></section>
      <div class="side">
        <section class="card panel" aria-labelledby="todo-title"><h2 id="todo-title">What to do</h2>${todoBody}</section>
        ${r.recalibration ? chartHtml(r.recalibration, dest.name) : ""}
      </div>
    </div>
    <p class="disclaimer">Decision support only. Not medical advice and not a clearance to fly. Values tagged Placeholder or "to verify" are not yet confirmed.</p>`;
}

async function loadResult({ keepFocus = null } = {}) {
  const box = $("#result");
  if (!box) return;
  const seq = ++state.seq;
  const slow = setTimeout(() => box.classList.add("is-loading"), 150);
  box.setAttribute("aria-busy", "true");
  const req = { destination_id: state.destId, device_id: state.deviceId, stay_days: state.stayDays, with_mitigations: state.withMit };
  if (deviceById(state.deviceId).body_mass_kg) req.body_mass_kg = state.bodyMass;
  try {
    const { data, via } = await fetchAssessment(req);
    if (seq !== state.seq) return;
    state.result = data;
    state.via = via;
    box.innerHTML = resultHtml(data);
  } catch (err) {
    if (seq !== state.seq) return;
    box.innerHTML = `<div class="card error-card"><h2>We could not compute a result</h2><p>${esc(err.message)}</p>
      <button type="button" class="btn btn-primary" id="retry">Try again</button></div>`;
  } finally {
    clearTimeout(slow);
    box.classList.remove("is-loading");
    box.removeAttribute("aria-busy");
  }
  if (keepFocus) { const el = document.getElementById(keepFocus) || $(keepFocus, box); if (el) el.focus({ preventScroll: true }); }
}

// ---------- render and events ----------

function render(animate) {
  const view = $("#view");
  if (state.step === 1) view.innerHTML = viewDestination();
  else if (state.step === 2) view.innerHTML = viewDevice();
  else view.innerHTML = viewResultShell();
  updateProgress();
  if (state.step === 1) syncDestination();
  if (state.step === 2) syncDevice();
  if (state.step === 3) loadResult();
  if (animate) {
    window.scrollTo(0, 0);
    enterAnimation(view.firstElementChild);
    $("#step-title").focus({ preventScroll: true });
  }
}

function wire() {
  const view = $("#view");
  view.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "dest") { state.destId = t.value; persist(); syncDestination(); updateProgress(); }
    else if (t.name === "stay") { state.stayDays = Number(t.value); persist(); }
    else if (t.name === "device") { state.deviceId = t.value; persist(); syncDevice(); updateProgress(); }
    else if (t.name === "switch-dest") { state.destId = t.value; persist(); loadResult({ keepFocus: `input[name="switch-dest"][value="${t.value}"]` }); }
    else if (t.id === "mit") { state.withMit = t.checked; persist(); loadResult({ keepFocus: "mit" }); }
  });
  view.addEventListener("input", (e) => {
    if (e.target.id === "mass") { state.bodyMass = Number(e.target.value); $("#mass-out").textContent = `${state.bodyMass} kg`; persist(); }
  });
  view.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "next") go(state.step + 1);
    else if (t.id === "back") go(state.step - 1);
    else if (t.id === "retry") loadResult();
    else if (t.id === "export") window.print();
  });
  document.querySelectorAll(".pstep").forEach((btn) => btn.addEventListener("click", () => go(Number(btn.dataset.step))));
  window.addEventListener("popstate", () => {
    const step = Number(Object.keys(STEP_HASH).find((k) => STEP_HASH[k] === location.hash)) || 1;
    if (canEnter(step) || step < state.step) { state.step = step; persist(); render(true); }
  });

  // Chart tooltip (hover and keyboard focus)
  const tip = $("#tooltip");
  const showTip = (el, x, y) => { tip.textContent = el.dataset.tip; tip.hidden = false; tip.style.left = `${x + 12}px`; tip.style.top = `${y - 36}px`; };
  view.addEventListener("pointermove", (e) => {
    const bar = e.target.closest(".bar[data-tip]");
    if (bar) showTip(bar, e.pageX, e.pageY); else tip.hidden = true;
  });
  view.addEventListener("focusin", (e) => {
    const bar = e.target.closest(".bar[data-tip]");
    if (bar) { const r = bar.getBoundingClientRect(); showTip(bar, r.right + window.scrollX, r.top + window.scrollY + 8); } else tip.hidden = true;
  });
  view.addEventListener("pointerleave", () => { tip.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") tip.hidden = true; });
}

async function boot() {
  try {
    const [d1, d2] = await Promise.all([fetch("/data/destinations.json"), fetch("/data/devices.json")]);
    if (!d1.ok || !d2.ok) throw new Error("data files missing");
    DATA.destinations = await d1.json();
    DATA.devices = await d2.json();
  } catch {
    $("#view").innerHTML = '<div class="card error-card"><h2>The data files did not load</h2><p>Start the app with run.bat (or run.ps1) and reload this page.</p></div>';
    return;
  }
  const saved = session.get();
  if (saved.destId && destById(saved.destId)) state.destId = saved.destId;
  if (saved.deviceId && deviceById(saved.deviceId)) state.deviceId = saved.deviceId;
  if (STAY_OPTIONS.some((o) => o.days === saved.stayDays)) state.stayDays = saved.stayDays;
  if (typeof saved.bodyMass === "number") state.bodyMass = saved.bodyMass;
  state.withMit = Boolean(saved.withMit);
  state.maxStep = Math.min(saved.maxStep || 1, state.deviceId ? 3 : state.destId ? 2 : 1);
  const fromHash = Number(Object.keys(STEP_HASH).find((k) => STEP_HASH[k] === location.hash)) || saved.step || 1;
  state.step = Math.min(fromHash, state.maxStep);
  history.replaceState({ step: state.step }, "", STEP_HASH[state.step]);
  wire();
  render(false);
}
boot();
