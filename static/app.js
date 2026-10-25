"use strict";

/* Bionic Passport UI.
   Full celestial destination catalog and clinical medical devices directory.
   Graphic environmental stressor cockpit, visual passport credentials,
   Account Space with flight surgeon personas and 1-click clinical dossiers.
   No em dashes used anywhere. */

const STAY_OPTIONS = [
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 182, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 1095, label: "3 years" },
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

// ---------- Personas & Saved Patient Dossiers ----------

const PERSONAS = [
  {
    id: "alex",
    name: "Alex Mercer",
    shortName: "Alex Mercer",
    role: "Space Traveler",
    org: "Artemis Commercial Lunar Program",
    initials: "AM",
    license: "Traveler ID #BP-7740",
    device: "Powered Knee Prosthesis (Genium X3)",
    doctor: "Dr. Sarah Chen, MD (ESA/NASA Flight Clinic)",
    desc: "Lower-limb amputee planning a 30-day lunar expedition. Checking walking support, battery life, and lunar dust seals."
  },
  {
    id: "elena",
    name: "Elena Rostova",
    shortName: "Elena Rostova",
    role: "Orbital Passenger",
    org: "Orbital Reef Commercial Station",
    initials: "ER",
    license: "Traveler ID #BP-5512",
    device: "Micra AV Transcatheter Pacemaker",
    doctor: "Dr. L. Moreau (Cardiology Space Medicine)",
    desc: "Heart block patient scheduled for a 6-month stay in low Earth orbit. Checking radiation shielding and cabin air pressure."
  },
  {
    id: "kenji",
    name: "Kenji Sato",
    shortName: "Kenji Sato",
    role: "Martian Colonist",
    org: "Mars Society / Jezero Settlement",
    initials: "KS",
    license: "Traveler ID #BP-3398",
    device: "MiniMed 780G Insulin Pump",
    doctor: "Dr. H. Takahashi (Endocrine Flight Support)",
    desc: "Type 1 diabetic preparing for 1 year in Martian habitat. Checking air bubble degassing and insulin cold storage."
  },
  {
    id: "maya",
    name: "Dr. Maya Patel",
    shortName: "Maya Patel",
    role: "Research Passenger",
    org: "Europa Deep-Probe Science Team",
    initials: "MP",
    license: "Traveler ID #BP-9201",
    device: "Percept PC Deep Brain Stimulator",
    doctor: "Dr. K. Vance (Telemedicine Protocol Lead)",
    desc: "Managing movement disorder during a 6-month science voyage. Testing high cosmic radiation exposure and magnetic fields."
  },
  {
    id: "mcfall",
    name: "John McFall, CBE",
    shortName: "John McFall",
    role: "Parastronaut Candidate",
    org: "European Space Agency (Fly! Study)",
    initials: "JM",
    license: "ESA Flight Trainee #ESA-2022-MF",
    device: "Active Microprocessor Prosthesis",
    doctor: "ESA Aerospace Medicine Division",
    desc: "Testing lower-limb prosthetic safety, balance, and motor recalibration in microgravity."
  }
];

const DOSSIERS = [
  {
    id: "DOS-402",
    patient: "Alex Mercer",
    destId: "moon",
    deviceId: "powered_knee",
    stayDays: 30,
    bodyMass: 80,
    withMit: false,
    badgeCls: "warn",
    badgeLabel: "Conditional",
    summary: "Moon (Shackleton Base) • Powered Knee Prosthesis • 30 Days"
  },
  {
    id: "DOS-109",
    patient: "Elena Rostova",
    destId: "orbit",
    deviceId: "pacemaker",
    stayDays: 182,
    bodyMass: 65,
    withMit: false,
    badgeCls: "warn",
    badgeLabel: "Conditional",
    summary: "Orbital Habitat (LEO) • Transvenous Pacemaker • 6 Months"
  },
  {
    id: "DOS-318",
    patient: "Kenji Sato",
    destId: "mars",
    deviceId: "insulin_pump",
    stayDays: 365,
    bodyMass: 72,
    withMit: false,
    badgeCls: "warn",
    badgeLabel: "Conditional",
    summary: "Mars (Jezero Crater Base) • Insulin Infusion Pump • 1 Year"
  },
  {
    id: "DOS-550",
    patient: "Dr. Maya Patel",
    destId: "europa",
    deviceId: "dbs",
    stayDays: 182,
    bodyMass: 58,
    withMit: false,
    badgeCls: "warn",
    badgeLabel: "Conditional",
    summary: "Europa (Subsurface Ocean) • Deep Brain Stimulator • 6 Months"
  }
];

let activePersonaId = "alex";

const DATA = { destinations: null, devices: null };
const state = {
  step: 1,
  maxStep: 1,
  destId: "moon",
  deviceId: "powered_knee",
  stayDays: DEFAULT_STAY,
  bodyMass: null,
  withMit: false,
  result: null,
  via: "server",
  seq: 0,
  destSearch: "",
  destCategory: "All",
  devSearch: "",
  devCategory: "All",
};

function persist() {
  const { step, maxStep, destId, deviceId, stayDays, bodyMass, withMit } = state;
  session.set({ step, maxStep, destId, deviceId, stayDays, bodyMass, withMit, activePersonaId });
}

const dests = () => DATA.destinations.destinations;
const devices = () => DATA.devices.devices;
const destById = (id) => dests().find((d) => d.id === id);
const deviceById = (id) => devices().find((d) => d.id === id);
const fmt = (x, d) => BPEngine.fmt(x, d);

// ---------- Status Icons ----------

function statusIcon(status) {
  if (status === "compatible") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.6 10.4l2.9 2.9 5.9-6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (status === "conditional") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6l8.9 16.2H1.1z" fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"/><path d="M10 7.2v5M10 14.8v.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  }
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.3 1h7.4L19 6.3v7.4L13.7 19H6.3L1 13.7V6.3z" fill="currentColor"/><path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
}

const badge = (status, xl = false) => `<span class="badge ${STATUS[status].cls}${xl ? " badge-xl" : ""}">${statusIcon(status)}${STATUS[status].label}</span>`;

const CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-7.5"/></svg>';
const TODO_FIX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
const TODO_LOWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>';
const PRINT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
const EXTERNAL = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4H3V4h4M9 3h4v4M6.5 9.5L13 3"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M17.5 17.5l-4.5-4.5"/></svg>';
const INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

const STARS = '<g fill="#ffffff"><circle cx="20" cy="18" r="1.1" opacity=".6"/><circle cx="58" cy="44" r="0.8" opacity=".4"/><circle cx="110" cy="16" r="1" opacity=".5"/><circle cx="280" cy="24" r="1.1" opacity=".6"/><circle cx="330" cy="60" r="0.8" opacity=".35"/><circle cx="240" cy="110" r="0.9" opacity=".4"/><circle cx="40" cy="115" r="0.9" opacity=".35"/><circle cx="170" cy="22" r="0.7" opacity=".45"/><circle cx="320" cy="130" r="1.2" opacity=".5"/></g>';

// ---------- Dynamic SVG Illustrations Generator ----------

function getIllustration(dest) {
  const id = dest.id;
  if (id === "orbit") {
    return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="360" height="140" fill="#080c16"/>${STARS}
      <ellipse cx="180" cy="250" rx="280" ry="140" fill="#1d4ed8"/>
      <ellipse cx="180" cy="250" rx="280" ry="140" fill="none" stroke="#60a5fa" stroke-width="3" opacity=".6"/>
      <g transform="translate(180, 60)">
        <rect x="-70" y="-7" width="48" height="14" rx="2" fill="#2563eb" stroke="#1e293b"/>
        <rect x="22" y="-7" width="48" height="14" rx="2" fill="#2563eb" stroke="#1e293b"/>
        <rect x="-22" y="-4" width="44" height="8" rx="1.5" fill="#94a3b8"/>
        <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#f8fafc"/>
        <circle cx="0" cy="0" r="4" fill="#3b82f6"/>
      </g>
    </svg>`;
  }
  if (id === "moon") {
    return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="360" height="140" fill="#080c16"/>${STARS}
      <circle cx="300" cy="30" r="10" fill="#3b82f6" opacity=".8"/>
      <g transform="translate(180, 70)">
        <circle cx="0" cy="0" r="48" fill="#cbd5e1"/>
        <circle cx="-16" cy="-12" r="10" fill="#94a3b8" opacity=".4"/>
        <circle cx="16" cy="14" r="12" fill="#94a3b8" opacity=".35"/>
        <circle cx="18" cy="-18" r="6" fill="#94a3b8" opacity=".4"/>
        <circle cx="-20" cy="18" r="7" fill="#94a3b8" opacity=".4"/>
        <circle cx="0" cy="0" r="48" fill="none" stroke="#f1f5f9" stroke-width="1.5" opacity=".5"/>
      </g>
    </svg>`;
  }
  if (id === "mars") {
    return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="360" height="140" fill="#080c16"/>${STARS}
      <g transform="translate(180, 70)">
        <circle cx="0" cy="0" r="48" fill="#ea580c"/>
        <ellipse cx="-2" cy="-42" rx="14" ry="4" fill="#f8fafc" opacity=".9"/>
        <path d="M-36 -10c14 4 28 1 42 5s28 3 40 -2" fill="none" stroke="#9a3412" stroke-width="5" stroke-linecap="round" opacity=".6"/>
        <path d="M-30 14c12 -2 24 3 36 0s24 -5 32 -1" fill="none" stroke="#9a3412" stroke-width="4" stroke-linecap="round" opacity=".5"/>
        <circle cx="0" cy="0" r="48" fill="none" stroke="#fdba74" stroke-width="1.5" opacity=".6"/>
      </g>
    </svg>`;
  }
  if (id === "venus") {
    return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="360" height="140" fill="#080c16"/>${STARS}
      <g transform="translate(180, 70)">
        <circle cx="0" cy="0" r="48" fill="#d97706"/>
        <path d="M-44 -16c20 6 40 4 60 8s20 2 30 -2" fill="none" stroke="#fef3c7" stroke-width="6" opacity=".5"/>
        <path d="M-40 12c18 -4 36 -2 54 -4s20 1 28 4" fill="none" stroke="#b45309" stroke-width="5" opacity=".4"/>
        <g transform="translate(10, -8)"><rect x="-10" y="-3" width="20" height="6" rx="3" fill="#ffffff"/><circle cx="0" cy="-6" r="8" fill="#f8fafc" opacity=".7"/></g>
        <circle cx="0" cy="0" r="48" fill="none" stroke="#fde68a" stroke-width="1.5" opacity=".7"/>
      </g>
    </svg>`;
  }
  if (id === "europa") {
    return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="360" height="140" fill="#080c16"/>${STARS}
      <g transform="translate(180, 70)">
        <circle cx="0" cy="0" r="48" fill="#e0f2fe"/>
        <path d="M-40 -15c25 10 50 5 80 12" fill="none" stroke="#b45309" stroke-width="2" opacity=".6"/>
        <path d="M-30 20c20 -8 45 -12 70 -5" fill="none" stroke="#b45309" stroke-width="2" opacity=".5"/>
        <path d="M-15 -40c10 25 15 50 12 80" fill="none" stroke="#0284c7" stroke-width="1.5" opacity=".5"/>
        <circle cx="0" cy="0" r="48" fill="none" stroke="#bae6fd" stroke-width="2" opacity=".8"/>
      </g>
    </svg>`;
  }
  if (id === "titan") {
    return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="360" height="140" fill="#080c16"/>${STARS}
      <g transform="translate(180, 70)">
        <circle cx="0" cy="0" r="48" fill="#f59e0b"/>
        <circle cx="0" cy="0" r="54" fill="none" stroke="#fbbf24" stroke-width="4" opacity=".4"/>
        <path d="M-25 10c15 8 35 2 50 10" fill="none" stroke="#1e293b" stroke-width="6" stroke-linecap="round" opacity=".6"/>
      </g>
    </svg>`;
  }
  const isExo = (dest.category || "").includes("Exoplanet");
  const baseColor = isExo ? "#059669" : "#6366f1";
  const glowColor = isExo ? "#34d399" : "#a5b4fc";
  return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="360" height="140" fill="#080c16"/>${STARS}
    <g transform="translate(180, 70)">
      <circle cx="0" cy="0" r="48" fill="${baseColor}"/>
      <circle cx="0" cy="0" r="48" fill="none" stroke="${glowColor}" stroke-width="2" opacity=".7"/>
      <path d="M-36 -12c20 8 40 4 72 8" fill="none" stroke="#ffffff" stroke-width="4" opacity=".3"/>
      <path d="M-30 16c18 -6 38 -2 60 4" fill="none" stroke="#ffffff" stroke-width="3" opacity=".25"/>
    </g>
  </svg>`;
}

// ---------- Device SVG Icons Generator ----------

function getDeviceIcon(id) {
  if (id.includes("knee")) {
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h12l-2 11H16z"/><circle cx="20" cy="19" r="4"/><path d="M18.5 19h3"/><path d="M20 23v10"/><path d="M20 33h7l2 3H17z"/></svg>';
  }
  if (id.includes("ankle")) {
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4v16"/><circle cx="20" cy="22" r="4"/><path d="M16 26l-6 10h24l-4-10z"/></svg>';
  }
  if (id.includes("pacemaker") || id.includes("icd") || id.includes("heart")) {
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="13" height="11" rx="4"/><path d="M18 10c6 0 7 4 7 9"/><path d="M28 35s-9-5-9-12a5 5 0 0 1 9-1 5 5 0 0 1 9 1c0 7-9 12-9 12z"/></svg>';
  }
  if (id.includes("insulin") || id.includes("cgm")) {
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="6" width="18" height="26" rx="4"/><rect x="9" y="11" width="10" height="7" rx="1.5"/><circle cx="14" cy="25" r="2.2"/><path d="M23 14c7 0 5 14 11 16"/><circle cx="34" cy="31" r="2.8"/></svg>';
  }
  if (id.includes("cochlear") || id.includes("iol")) {
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 28c0 4 3 7 7 7s6-3 6-6c0-4 6-6 6-14a11 11 0 0 0-22 0"/><path d="M15 15a5 5 0 0 1 10 0c0 3-3 4-3 7"/><circle cx="31" cy="27" r="3.5"/><path d="M34 9v8"/></svg>';
  }
  if (id.includes("dbs") || id.includes("vns") || id.includes("shunt")) {
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="20" cy="18" r="12"/><path d="M16 30v6M24 30v6"/><path d="M14 16c2-4 10-4 12 0M17 21h6"/></svg>';
  }
  if (id.includes("cpap")) {
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="20" height="20" rx="3"/><circle cx="14" cy="18" r="5"/><path d="M24 18h10v10h-6"/></svg>';
  }
  return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="20" cy="20" r="14"/><path d="M20 12v16M12 20h16"/></svg>';
}

// ---------- Formatting Helpers ----------

function gravityText(d) {
  const g = d.gravity_ms2.value;
  if (g === 0) return "Microgravity (0 g)";
  return `${fmt(g, 2)} m/s² (${fmt(g / DATA.destinations.standard_gravity_ms2.value, 2)} g)`;
}

const tempText = (t) => `${fmt(t.min, 0)} to ${fmt(t.max, 0)} °C`;
const stayLabel = (days) => (STAY_OPTIONS.find((o) => o.days === days) || { label: `${days} days` }).label;

function evidenceTag(level, verified) {
  if (level === "Placeholder") return '<span class="tag tag-placeholder">Placeholder</span>';
  return `<span class="tag${verified === false ? " tag-verify" : ""}">${esc(level)}${verified === false ? " (to verify)" : ""}</span>`;
}

const sourceLink = (src) => (src && src.url
  ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title)} ${EXTERNAL}</a>`
  : `<span class="src">${esc(src ? src.title : "")}</span>`);

// ---------- API with Client Fallback ----------

class InputError extends Error {}

async function fetchAssessment(req) {
  let res;
  try {
    res = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    res = null; // server unreachable
  }
  if (res && res.ok) return { data: await res.json(), via: "server" };
  if (res && (res.status === 404 || res.status === 422)) {
    let detail = "The request was rejected.";
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : detail;
    } catch { /* no body */ }
    throw new InputError(detail);
  }
  try {
    return { data: BPEngine.assess(DATA, req), via: "browser" };
  } catch (err) {
    throw new InputError(err.message);
  }
}

// ---------- Navigation & Stepper ----------

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
    : [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }];
  el.animate(frames, { duration: reducedMotion() ? 80 : 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
}

// ---------- Account Space Functions ----------

function getActivePersona() {
  return PERSONAS.find((p) => p.id === activePersonaId) || PERSONAS[0];
}

function updateNavAccount() {
  const p = getActivePersona();
  const avatar = $("#nav-avatar");
  const name = $("#nav-name");
  const role = $("#nav-role");
  if (avatar) avatar.textContent = p.initials;
  if (name) name.textContent = p.shortName;
  if (role) role.textContent = p.role;
}

function renderAccountDialogContent() {
  const p = getActivePersona();
  const personasHtml = PERSONAS.map((item) => `
    <button type="button" class="persona-btn ${item.id === activePersonaId ? "active" : ""}" data-persona="${esc(item.id)}">
      <span class="persona-btn-title">${esc(item.name)}</span>
      <span class="persona-btn-desc">${esc(item.role)} &bull; ${esc(item.device)}</span>
    </button>
  `).join("");

  const dossiersHtml = DOSSIERS.map((d) => `
    <div class="dossier-item">
      <div class="dossier-info">
        <span class="dossier-name">${esc(d.patient)} <span class="tag ${d.badgeCls}">${esc(d.badgeLabel)}</span></span>
        <span class="dossier-meta">${esc(d.summary)}</span>
      </div>
      <button type="button" class="dossier-load-btn" data-load-dossier="${esc(d.id)}">
        Load This Trip
      </button>
    </div>
  `).join("");

  return `
    <div class="account-dialog-header">
      <h2 id="account-modal-title" class="account-dialog-title">My Traveler Health Passport</h2>
      <button type="button" class="account-close-btn" id="account-dialog-close" aria-label="Close Traveler Passport">&times;</button>
    </div>
    <div class="account-dialog-body">
      <!-- Active Traveler Card -->
      <div class="account-profile-box">
        <div class="account-profile-avatar">${esc(p.initials)}</div>
        <div class="account-profile-details">
          <span class="account-profile-name">${esc(p.name)}</span>
          <span class="account-profile-sub">${esc(p.role)} &bull; ${esc(p.org)}</span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
            <span class="tag" style="font-weight: 700;">${esc(p.license)}</span>
            <span class="tag tag-fixed" style="font-weight: 600;">${esc(p.device)}</span>
          </div>
          <p style="font-size: 0.78rem; color: var(--text-2); margin-top: 6px; line-height: 1.35;">
            <strong>Primary Physician:</strong> ${esc(p.doctor)}<br>
            ${esc(p.desc)}
          </p>
        </div>
      </div>

      <!-- Traveler Persona Switcher -->
      <div>
        <span class="field-label" style="font-size: 0.8rem; margin-bottom: 6px;">Switch Traveler Profile</span>
        <div class="persona-grid">${personasHtml}</div>
      </div>

      <!-- Saved Trips & Configurations -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
          <span class="field-label" style="font-size: 0.8rem; margin: 0;">My Saved Trips & Medical Setups</span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">${DOSSIERS.length} saved trips</span>
        </div>
        <div class="dossier-list">${dossiersHtml}</div>
      </div>

      <!-- Standards Reference -->
      <div style="padding: 10px; background: var(--surface-muted); border-radius: var(--r-ctl); border: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted);">
        <strong style="color: var(--text);">Passenger Safety Guidelines:</strong> NASA-STD-3001 Vol 2 (Crew Health) &bull; FAA 14 CFR 460 Commercial Human Spaceflight.
      </div>
    </div>
  `;
}

function openAccountModal() {
  const dlg = $("#account-dialog");
  const content = $("#account-dialog-content");
  if (!dlg || !content) return;
  content.innerHTML = renderAccountDialogContent();
  if (typeof dlg.showModal === "function") {
    dlg.showModal();
  } else {
    dlg.setAttribute("open", "");
  }
  $("#account-btn").setAttribute("aria-expanded", "true");
}

function closeAccountModal() {
  const dlg = $("#account-dialog");
  if (!dlg) return;
  if (typeof dlg.close === "function") {
    dlg.close();
  } else {
    dlg.removeAttribute("open");
  }
  $("#account-btn").setAttribute("aria-expanded", "false");
}

function selectPersona(id) {
  activePersonaId = id;
  updateNavAccount();
  const content = $("#account-dialog-content");
  if (content) content.innerHTML = renderAccountDialogContent();
  persist();
}

function loadDossier(dossierId) {
  const d = DOSSIERS.find((item) => item.id === dossierId);
  if (!d) return;
  state.destId = d.destId;
  state.deviceId = d.deviceId;
  state.stayDays = d.stayDays;
  state.bodyMass = d.bodyMass;
  state.withMit = d.withMit;
  state.step = 3;
  state.maxStep = 3;
  closeAccountModal();
  persist();
  render(true);
}

// ---------- Step 1: Destination Selection with Search Bar ----------

function viewDestination() {
  const allDests = dests();
  const q = state.destSearch.toLowerCase().trim();
  const cat = state.destCategory;

  const categories = ["All", "Solar Planet", "Moons & Ocean Worlds", "Dwarf Planet", "Exoplanet"];
  const pillsHtml = categories.map((c) => {
    const count = c === "All" ? allDests.length : allDests.filter((d) => (d.category || "").includes(c.split(" ")[0])).length;
    return `<button type="button" class="pill-btn ${cat === c ? "active" : ""}" data-dest-cat="${esc(c)}">${esc(c)} (${count})</button>`;
  }).join("");

  const filtered = allDests.filter((d) => {
    const matchesSearch = !q || d.name.toLowerCase().includes(q) || d.place.toLowerCase().includes(q) || (d.category && d.category.toLowerCase().includes(q));
    const matchesCat = cat === "All" || (d.category && d.category.includes(cat.split(" ")[0]));
    return matchesSearch && matchesCat;
  });

  const cards = filtered.length ? filtered.map((d) => {
    const ot = d.outside_temp_c;
    return `<label class="card pick dest-card">
      <input type="radio" name="dest" value="${esc(d.id)}" class="sr-only" ${d.id === state.destId ? "checked" : ""}>
      <span class="pick-art">${getIllustration(d)}</span>
      <span class="pick-check">${CHECK}</span>
      <span class="pick-body">
        <div class="card-top-row">
          <span class="pick-title">${esc(d.name)}</span>
          <span class="category-tag">${esc(d.category || "Space World")}</span>
        </div>
        <span class="pick-sub">${esc(d.place)}</span>
        <div class="facts">
          <div class="fact"><span class="fact-label">Gravity</span><span class="fact-value">${esc(gravityText(d))}</span></div>
          <div class="fact"><span class="fact-label">Surface temp</span><span class="fact-value">${esc(tempText(ot))}</span></div>
          <div class="fact"><span class="fact-label">Light delay</span><span class="fact-value">${esc(BPEngine.delayText(d.light_delay_s.min, d.light_delay_s.max))}</span></div>
          <div class="fact"><span class="fact-label">Cabin air</span><span class="fact-value">${fmt(d.cabin_pressure_kpa.value, 1)} kPa (${fmt(d.oxygen_percent.value, 0)}% O₂)</span></div>
        </div>
      </span>
    </label>`;
  }).join("") : `<div class="card" style="grid-column: 1/-1; padding: 32px; text-align: center; color: var(--text-muted);">
      <p style="font-weight: 700; font-size: 1.1rem; color: var(--text);">No celestial destinations matched "${esc(state.destSearch)}"</p>
      <p style="font-size: 0.9rem; margin-top: 4px;">Try searching for Mars, Europa, Titan, Proxima b, or Venus.</p>
    </div>`;

  const stays = STAY_OPTIONS.map((o) => `<label><input type="radio" name="stay" value="${o.days}" class="sr-only" ${o.days === state.stayDays ? "checked" : ""}><span>${o.label}</span></label>`).join("");

  return `<section class="step" aria-labelledby="step-title">
    <header class="step-head">
      <span class="step-badge">Step 1 of 3</span>
      <h1 id="step-title" tabindex="-1">Where are you traveling in the cosmos?</h1>
      <p>Search any planet, moon, or orbital habitat known to humanity. We check how extreme gravity, cosmic radiation, and cabin air pressure affect your body and medical device.</p>
    </header>

    <div class="search-toolbar">
      <div class="search-input-wrap">
        ${SEARCH_ICON}
        <input type="text" id="dest-search" class="search-input" placeholder="Search by planet, moon, exoplanet, or base name..." value="${esc(state.destSearch)}">
      </div>
      <div class="filter-pills">${pillsHtml}</div>
    </div>

    <div class="cards cards-3" role="radiogroup" aria-label="Destination">${cards}</div>

    <div class="stay">
      <span class="field-label" id="stay-label">How long will you stay?</span>
      <div class="segmented" role="radiogroup" aria-labelledby="stay-label">${stays}</div>
      <p class="hint" id="stay-hint" style="margin-top: 6px;"></p>
    </div>

    <div class="actions">
      <span class="hint" id="next-hint"></span>
      <button type="button" class="btn btn-primary" id="next">Continue to My Medical Device</button>
    </div>
  </section>`;
}

function syncDestination() {
  const next = $("#next");
  if (!next) return;
  next.disabled = !state.destId;
  $("#next-hint").textContent = state.destId ? "" : "Choose a destination to continue.";
  const d = state.destId && destById(state.destId);
  const travel = d && d.transit_days_each_way.value;
  $("#stay-hint").textContent = travel ? `${d.name} expeditions also involve about ${fmt(travel / 30.4, 0)} months of cruise travel each way.` : "";
}

// ---------- Step 2: Device Selection with Directory & Search ----------

function viewDevice() {
  const allDevs = devices();
  const q = state.devSearch.toLowerCase().trim();
  const cat = state.devCategory;

  const categories = ["All", "Prosthetics", "Cardiac", "Endocrine", "Neuromodulation", "Sensory & Other"];
  const pillsHtml = categories.map((c) => {
    const count = c === "All" ? allDevs.length : allDevs.filter((d) => (d.category || "").includes(c.split(" ")[0])).length;
    return `<button type="button" class="pill-btn ${cat === c ? "active" : ""}" data-dev-cat="${esc(c)}">${esc(c)} (${count})</button>`;
  }).join("");

  const filtered = allDevs.filter((d) => {
    const matchesSearch = !q || d.name.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q) || (d.category && d.category.toLowerCase().includes(q));
    const matchesCat = cat === "All" || (d.category && d.category.includes(cat.split(" ")[0]));
    return matchesSearch && matchesCat;
  });

  const cards = filtered.length ? filtered.map((dev) => `<label class="card pick device-card">
      <input type="radio" name="device" value="${esc(dev.id)}" class="sr-only" ${dev.id === state.deviceId ? "checked" : ""}>
      <span class="pick-check">${CHECK}</span>
      <div class="pick-body">
        <div class="device-icon">${getDeviceIcon(dev.id)}</div>
        <div class="card-top-row" style="width: 100%;">
          <span class="pick-title">${esc(dev.name)}</span>
          <span class="category-tag">${esc(dev.worn === "implanted" ? "Implant" : "External")}</span>
        </div>
        <span class="pick-sub">${esc(dev.summary)}</span>
      </div>
    </label>`).join("") : `<div class="card" style="grid-column: 1/-1; padding: 32px; text-align: center; color: var(--text-muted);">
      <p style="font-weight: 700; font-size: 1.1rem; color: var(--text);">No medical device matched "${esc(state.devSearch)}"</p>
      <p style="font-size: 0.9rem; margin-top: 4px;">Try searching for knee, pacemaker, ICD, shunt, insulin pump, or DBS.</p>
    </div>`;

  const d = destById(state.destId);

  return `<section class="step" aria-labelledby="step-title">
    <header class="step-head">
      <span class="step-badge">Step 2 of 3</span>
      <h1 id="step-title" tabindex="-1">Which medical device or implant do you travel with?</h1>
      <p>Select your prosthesis, cardiac implant, sensor, or wearable pump from our catalog. We test its operational limits for your journey ${esc(d ? d.where : "")}.</p>
    </header>

    <div class="search-toolbar">
      <div class="search-input-wrap">
        ${SEARCH_ICON}
        <input type="text" id="dev-search" class="search-input" placeholder="Search by medical device name, function, or implant type..." value="${esc(state.devSearch)}">
      </div>
      <div class="filter-pills">${pillsHtml}</div>
    </div>

    <div class="cards cards-4" role="radiogroup" aria-label="Medical device">${cards}</div>
    <div id="mass-slot"></div>
    <div class="actions">
      <span class="hint" id="next-hint"></span>
      <button type="button" class="btn" id="back">Back to Destination</button>
      <button type="button" class="btn btn-primary" id="next">Check My Travel Compatibility</button>
    </div>
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
        <label class="field-label" for="mass">Your Body Weight (kg)</label>
        <div class="mass-row">
          <input type="range" id="mass" min="${spec.min}" max="${spec.max}" step="1" value="${state.bodyMass}" aria-describedby="mass-hint">
          <output for="mass" id="mass-out">${state.bodyMass} kg</output>
        </div>
        <p class="hint" id="mass-hint">Used to calculate walking assistance and joint torque for lower gravity. Rated load: ${fmt(spec.min, 0)} to ${fmt(spec.max, 0)} kg.</p>
      </div>`;
      enterAnimation(slot.firstElementChild);
    }
  } else {
    slot.innerHTML = "";
  }
  $("#next").disabled = !state.deviceId;
  $("#next-hint").textContent = state.deviceId ? "" : "Choose a device to continue.";
}

// ---------- Step 3: Highly Visual & Graphic Result Screen ----------

function chartHtml(rc, destName) {
  const W = 360, labelW = 60, valueW = 48, barH = 20, gap = 2, groupGap = 20;
  const plotW = W - labelW - valueW;
  const max = Math.max(...rc.earth_nm, ...rc.destination_nm, 1);
  const x = (v) => (plotW * v) / max;
  const bar = (px, py, w, cls, label) => {
    const r = Math.min(3, w);
    const d = w <= 0 ? "" : `M${px},${py} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${barH - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`;
    return `<path class="bar ${cls}" d="${d || `M${px},${py} h0.01 v${barH} h-0.01 z`}" tabindex="0" role="img" aria-label="${esc(label)}" data-tip="${esc(label)}"/>`;
  };
  const phaseName = { stance: "Stance", swing: "Swing" };
  let y = 4, body = "";
  rc.phases.forEach((phase, i) => {
    const e = rc.earth_nm[i], d = rc.destination_nm[i];
    const groupH = barH * 2 + gap;
    body += `<text class="axis-label" x="0" y="${y + groupH / 2 + 5}">${phaseName[phase]}</text>`;
    body += bar(labelW, y, x(e), "bar-earth", `${phaseName[phase]} phase on Earth: ${fmt(e, 1)} N·m`);
    body += `<text x="${labelW + x(e) + 6}" y="${y + 15}">${fmt(e, 1)}</text>`;
    body += bar(labelW, y + barH + gap, x(d), "bar-dest", `${phaseName[phase]} phase at ${destName}: ${fmt(d, 1)} N·m`);
    body += `<text x="${labelW + x(d) + 6}" y="${y + barH + gap + 15}">${fmt(d, 1)}</text>`;
    y += groupH + groupGap;
  });
  const H = y - groupGap + 4;
  const rows = rc.phases.map((p, i) => `<tr><td>${phaseName[p]}</td><td>${fmt(rc.earth_nm[i], 1)} N·m</td><td>${fmt(rc.destination_nm[i], 1)} N·m</td></tr>`).join("");
  return `<section class="card panel chart-card" aria-labelledby="chart-title">
    <div class="chart-head">
      <h3 id="chart-title">How Walking Will Feel (Joint Recalibration Model)</h3>
      ${evidenceTag(rc.evidence_level)}
    </div>
    <div class="chart-legend">
      <span><i class="swatch swatch-earth"></i>Earth (1.0 g)</span>
      <span><i class="swatch swatch-dest"></i>${esc(destName)} (${fmt(rc.g_ratio, 2)} g)</span>
    </div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Torque comparison chart">
      <line class="baseline" x1="${labelW}" y1="0" x2="${labelW}" y2="${H}"/>
      ${body}
    </svg>
    <div class="chart-note">
      <p>Stance support scales directly with body weight in lower gravity, so your motor pushes less. Swing assistance overcomes your leg's mass and inertia, so it feels almost identical to walking on Earth.</p>
      <p>Earth baseline assumes ${esc(fmt(rc.body_mass_kg, 0))} kg body mass. Scaling model: ${sourceLink(rc.source)}</p>
    </div>
    <details class="table-view">
      <summary>Show numeric comparison table</summary>
      <table>
        <thead><tr><th>Phase</th><th>Earth (1.0 g)</th><th>${esc(destName)} (${fmt(rc.g_ratio, 2)} g)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
  </section>`;
}

function viewResultShell() {
  return `<section class="step" aria-labelledby="step-title">
    <h1 id="step-title" class="sr-only" tabindex="-1">Assessment Result</h1>
    <div id="result" class="result" aria-live="polite"><p class="boot">Assessing device against habitat parameters...</p></div>
  </section>`;
}

// Graphic Environmental Stressor Cockpit
function renderCockpit(dest, r) {
  const gRatio = dest.gravity_ms2.value / DATA.destinations.standard_gravity_ms2.value;
  const gPct = Math.min(100, Math.round(gRatio * 100));
  const userMass = r.recalibration ? r.recalibration.body_mass_kg : 80;
  const effectiveWeight = fmt(userMass * gRatio, 1);

  // Pressure ratio
  const cabinP = dest.cabin_pressure_kpa.value;
  const pPct = Math.min(100, Math.round((cabinP / 101.3) * 100));

  // Radiation
  const radRate = dest.radiation_msv_day.value;
  const stayDays = r.stay_days;
  const totalMissionDose = fmt(radRate * stayDays, 1);
  const radPct = Math.min(100, Math.round((radRate / 3.0) * 100));
  const radColor = radRate > 2.0 ? "var(--bad)" : radRate > 0.8 ? "var(--warn)" : "var(--ok)";

  // Light delay
  const maxDelay = dest.light_delay_s.max;
  const delayStr = BPEngine.delayText(dest.light_delay_s.min, dest.light_delay_s.max);
  const isLiveVideo = maxDelay <= 2;

  return `<div class="cockpit-card">
    <div class="cockpit-title-row">
      <span class="cockpit-title">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
        Environmental Stressor Cockpit
      </span>
      <span class="tag" style="font-weight: 700;">6 Stressors Analyzed</span>
    </div>

    <div class="gauges-grid">
      <!-- Gravity Gauge -->
      <div class="gauge-card">
        <div class="gauge-head">
          <span class="gauge-name">Gravitational Field</span>
          <span class="tag" style="background: var(--surface);">${fmt(gRatio, 2)} g</span>
        </div>
        <div class="gauge-val">${dest.gravity_ms2.value === 0 ? "0 g (Free Fall)" : `${fmt(dest.gravity_ms2.value, 2)} m/s²`}</div>
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill" style="width: ${Math.max(5, gPct)}%; background: var(--accent);"></div>
        </div>
        <div class="gauge-meta">
          <span>Earth: 1.00 g</span>
          <span>Effective weight: <strong>${effectiveWeight} kg</strong></span>
        </div>
      </div>

      <!-- Atmosphere Pressure Gauge -->
      <div class="gauge-card">
        <div class="gauge-head">
          <span class="gauge-name">Atmospheric Pressure</span>
          <span class="tag" style="background: var(--surface);">${pPct}% of sea-level</span>
        </div>
        <div class="gauge-val">${fmt(cabinP, 1)} kPa</div>
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill" style="width: ${pPct}%; background: ${cabinP >= 70 ? 'var(--ok)' : 'var(--warn)'};"></div>
        </div>
        <div class="gauge-meta">
          <span>Sea level: 101.3 kPa</span>
          <span>Exploration: 56.5 kPa</span>
        </div>
      </div>

      <!-- Radiation Gauge -->
      <div class="gauge-card">
        <div class="gauge-head">
          <span class="gauge-name">Radiation Flux</span>
          <span class="tag" style="background: var(--surface); color: ${radColor}; font-weight: 700;">${stayDays} day stay</span>
        </div>
        <div class="gauge-val">${fmt(radRate, 2)} mSv/day</div>
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill" style="width: ${Math.max(8, radPct)}%; background: ${radColor};"></div>
        </div>
        <div class="gauge-meta">
          <span>Cumulative: <strong>${totalMissionDose} mSv</strong></span>
          <span>Safe limit: 2000 mGy</span>
        </div>
      </div>

      <!-- Thermal Range Gauge -->
      <div class="gauge-card">
        <div class="gauge-head">
          <span class="gauge-name">Regulated Microclimate</span>
          <span class="tag" style="background: var(--ok-bg); color: var(--ok);">Safe habitat</span>
        </div>
        <div class="gauge-val">${fmt(dest.cabin_temp_c.min, 0)} to ${fmt(dest.cabin_temp_c.max, 0)} °C</div>
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill" style="width: 75%; background: var(--ok);"></div>
        </div>
        <div class="gauge-meta">
          <span>Hull exterior: ${fmt(dest.outside_temp_c.min, 0)} to ${fmt(dest.outside_temp_c.max, 0)} °C</span>
        </div>
      </div>

      <!-- Communication Telemetry Gauge -->
      <div class="gauge-card">
        <div class="gauge-head">
          <span class="gauge-name">Radio Propagation Delay</span>
          <span class="tag" style="background: ${isLiveVideo ? 'var(--ok-bg)' : 'var(--warn-bg)'}; color: ${isLiveVideo ? 'var(--ok)' : 'var(--warn)'}; font-weight: 700;">
            ${isLiveVideo ? 'Live Telemedicine' : 'Autonomous'}
          </span>
        </div>
        <div class="gauge-val">${delayStr}</div>
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill" style="width: ${isLiveVideo ? '20%' : '85%'}; background: ${isLiveVideo ? 'var(--ok)' : 'var(--warn)'};"></div>
        </div>
        <div class="gauge-meta">
          <span>Telemedicine limit: 2.0 s</span>
        </div>
      </div>

      <!-- Dust Particulate Gauge -->
      <div class="gauge-card">
        <div class="gauge-head">
          <span class="gauge-name">Surface Particulate</span>
          <span class="tag" style="background: var(--surface);">${dest.dust.value === "none" ? "HEPA Filtered" : "Active Dust"}</span>
        </div>
        <div class="gauge-val" style="font-size: 1rem; line-height: 1.3;">${esc(dest.dust.value)}</div>
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill" style="width: ${dest.dust.value === 'none' ? '15%' : '80%'}; background: ${dest.dust.value === 'none' ? 'var(--ok)' : 'var(--warn)'};"></div>
        </div>
        <div class="gauge-meta">
          <span>Ingress protection required</span>
        </div>
      </div>
    </div>
  </div>`;
}

function resultHtml(r) {
  const dest = destById(r.destination.id);
  const allDestinations = dests();

  // Quick Switcher Strip with planetary buttons
  const switcherHtml = allDestinations.map((d) => `
    <button type="button" class="quick-planet-btn ${d.id === r.destination.id ? "active" : ""}" data-switch="${esc(d.id)}">
      <span>${esc(d.name)}</span>
    </button>
  `).join("");

  const fixedOrLowered = (f) => {
    if (!r.with_mitigations) return "";
    if (f.fixed) return '<span class="tag tag-fixed">Fixed by recommended adjustment</span>';
    if (r.mitigations.some((m) => (m.reduces || []).includes(f.factor))) return '<span class="tag">Risk lowered</span>';
    return "";
  };

  const factors = r.factors.map((f) => `<li class="factor-card">
      <div class="factor-head">
        <div class="factor-title-group">
          <span class="factor-name">${esc(f.label)}</span>
          ${badge(f.status)}
          ${fixedOrLowered(f)}
        </div>
      </div>
      <div class="factor-compare">
        <div class="compare-box">
          <span class="compare-label">Destination Environment</span>
          <span class="compare-val">${esc(f.destination_value)}</span>
        </div>
        <div class="compare-box">
          <span class="compare-label">Device Tested Tolerance</span>
          <span class="compare-val">${esc(f.device_limit)}</span>
        </div>
      </div>
      <p class="factor-why">${esc(f.explanation)}</p>
      <div class="factor-foot">
        ${evidenceTag(f.evidence_level, f.verified)}
        ${sourceLink(f.source)}
      </div>
    </li>`).join("");

  const labelOf = Object.fromEntries(r.factors.map((f) => [f.factor, f.label]));
  const todos = r.mitigations.map((m) => {
    const fixes = (m.resolves || []).map((k) => `<span class="tag tag-fixed">Fixes: ${esc(labelOf[k])}</span>`).join("");
    const lowers = (m.reduces || []).map((k) => `<span class="tag">Lowers risk: ${esc(labelOf[k])}</span>`).join("");
    return `<li class="todo-item">
      ${m.resolves && m.resolves.length ? TODO_FIX : TODO_LOWER}
      <div class="todo-item-content">
        <p>${esc(m.text)}</p>
        <div class="todo-tags">${fixes}${lowers}</div>
      </div>
    </li>`;
  }).join("");

  const todoBody = r.mitigations.length
    ? `<label class="switch-control">
         <span>Show status after completing these steps</span>
         <input type="checkbox" role="switch" id="mit" ${r.with_mitigations ? "checked" : ""}>
         <span class="switch-track"><span class="switch-thumb"></span></span>
       </label>
       <ul class="todo-list">${todos}</ul>`
    : '<p class="empty-todo">No extra adjustments needed. Continue your regular device care routine.</p>';

  const afterLine = r.with_mitigations ? '<span class="tag tag-fixed" style="font-size: 0.8rem; font-weight: 700;">After Completing Recommended Preparations</span>' : "";
  const borderClass = r.status === "compatible" ? "ok-border" : r.status === "conditional" ? "warn-border" : "bad-border";
  const notice = state.via === "browser"
    ? '<p class="notice">Server unreachable. Assessment generated by local client engine from verified data files.</p>' : "";
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return `${notice}
    <!-- Printable Header -->
    <div class="print-only print-header">
      <div>
        <div class="print-title">Bionic Passport: Personal Spaceflight Travel Readiness Summary</div>
        <div class="print-sub">Medical Device Compatibility Report for Space Travelers</div>
      </div>
      <div style="text-align: right; font-size: 9pt; color: #64748b;">
        Generated: ${esc(today)}<br>
        Classification: Personal Travel Decision Support
      </div>
    </div>

    <!-- Official Visual Passport Credential Hero -->
    <article class="passport-card ${borderClass}" aria-label="Assessment Verdict">
      <div class="passport-header-line">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="passport-id-badge">BP-2026-${esc(r.device.id.slice(0, 3).toUpperCase())}-${esc(dest.id.slice(0, 3).toUpperCase())}</span>
          <span class="category-tag">Personal Health Passport</span>
        </div>
        <button type="button" class="btn" id="export" style="min-height: 36px; padding: 0 12px; font-size: 0.8rem;" title="Print or save this report to share with your personal doctor">
          ${PRINT}Export Doctor Summary (PDF)
        </button>
      </div>

      <div class="passport-main">
        <div>
          <p class="verdict-context">${esc(r.device.name)} &bull; ${esc(dest.name)} &bull; ${esc(stayLabel(r.stay_days))}</p>
          <div style="display: flex; align-items: center; gap: 12px; margin: 8px 0; flex-wrap: wrap;">
            ${badge(r.status, true)}
            ${afterLine}
          </div>
          <p class="verdict-summary">${esc(r.summary)}</p>
        </div>
      </div>

      <!-- Quick Destination Switcher Strip -->
      <div style="margin-top: 6px; border-top: 1px solid var(--border); padding-top: 10px;">
        <span class="field-label" style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">
          Compare Another Destination (Instant Live Recalculation)
        </span>
        <div class="quick-switcher-strip">${switcherHtml}</div>
      </div>
    </article>

    <!-- Visual Environmental Stressor Cockpit -->
    ${renderCockpit(dest, r)}

    <!-- Two-Column Breakdown: Factors & Mitigations -->
    <div class="result-grid">
      <section class="card panel" aria-labelledby="factors-title">
        <div class="panel-head">
          <h2 id="factors-title">Environmental Conditions at Your Destination</h2>
          <span class="panel-sub">${r.factors.length} factors evaluated for your safety, worst first</span>
        </div>
        <ul class="factor-list">${factors}</ul>
      </section>

      <div class="side">
        <section class="card panel" aria-labelledby="todo-title">
          <div class="panel-head">
            <h2 id="todo-title">What You Should Do Before Departure</h2>
          </div>
          ${todoBody}
        </section>
        ${r.recalibration ? chartHtml(r.recalibration, dest.name) : ""}
      </div>
    </div>

    <!-- Bottom Disclaimer -->
    <div class="disclaimer-card">
      <div class="disclaimer-icon">${INFO}</div>
      <p class="disclaimer-text">Personal decision support for space travelers and their personal healthcare team. Not medical advice and not a clearance to fly. Always review this report with your personal physician and flight doctor before departure.</p>
    </div>`;
}

async function loadResult({ keepFocus = null } = {}) {
  const box = $("#result");
  if (!box) return;
  const seq = ++state.seq;
  const slow = setTimeout(() => box.classList.add("is-loading"), 120);
  box.setAttribute("aria-busy", "true");

  const req = {
    destination_id: state.destId,
    device_id: state.deviceId,
    stay_days: state.stayDays,
    with_mitigations: state.withMit,
  };
  if (deviceById(state.deviceId).body_mass_kg) req.body_mass_kg = state.bodyMass;

  try {
    const { data, via } = await fetchAssessment(req);
    if (seq !== state.seq) return;
    state.result = data;
    state.via = via;
    box.innerHTML = resultHtml(data);
  } catch (err) {
    if (seq !== state.seq) return;
    box.innerHTML = `<div class="card error-card" style="padding: 24px;">
      <h2>Could not compute assessment</h2>
      <p style="color: var(--text-muted); margin: 8px 0 16px;">${esc(err.message)}</p>
      <button type="button" class="btn btn-primary" id="retry">Try Again</button>
    </div>`;
  } finally {
    clearTimeout(slow);
    box.classList.remove("is-loading");
    box.removeAttribute("aria-busy");
  }

  if (keepFocus) {
    const el = document.getElementById(keepFocus) || $(keepFocus, box);
    if (el) el.focus({ preventScroll: true });
  }
}

// ---------- Render and Event Wiring ----------

function render(animate) {
  const view = $("#view");
  if (state.step === 1) view.innerHTML = viewDestination();
  else if (state.step === 2) view.innerHTML = viewDevice();
  else view.innerHTML = viewResultShell();

  updateProgress();
  updateNavAccount();
  if (state.step === 1) syncDestination();
  if (state.step === 2) syncDevice();
  if (state.step === 3) loadResult();

  if (animate) {
    window.scrollTo(0, 0);
    enterAnimation(view.firstElementChild);
    const title = $("#step-title");
    if (title) title.focus({ preventScroll: true });
  }
}

function wire() {
  const view = $("#view");

  view.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "dest") {
      state.destId = t.value;
      persist();
      syncDestination();
      updateProgress();
    } else if (t.name === "stay") {
      state.stayDays = Number(t.value);
      persist();
    } else if (t.name === "device") {
      state.deviceId = t.value;
      persist();
      syncDevice();
      updateProgress();
    } else if (t.id === "mit") {
      state.withMit = t.checked;
      persist();
      loadResult({ keepFocus: "mit" });
    }
  });

  // Search input listeners
  view.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "dest-search") {
      state.destSearch = t.value;
      const cardsSlot = $(".cards-3", view);
      if (cardsSlot) {
        const curFocused = document.activeElement === t;
        const selStart = t.selectionStart;
        const selEnd = t.selectionEnd;
        view.innerHTML = viewDestination();
        const newInp = $("#dest-search");
        if (newInp && curFocused) {
          newInp.focus();
          newInp.setSelectionRange(selStart, selEnd);
        }
        syncDestination();
      }
    } else if (t.id === "dev-search") {
      state.devSearch = t.value;
      const cardsSlot = $(".cards-4", view);
      if (cardsSlot) {
        const curFocused = document.activeElement === t;
        const selStart = t.selectionStart;
        const selEnd = t.selectionEnd;
        view.innerHTML = viewDevice();
        const newInp = $("#dev-search");
        if (newInp && curFocused) {
          newInp.focus();
          newInp.setSelectionRange(selStart, selEnd);
        }
        syncDevice();
      }
    } else if (t.id === "mass") {
      state.bodyMass = Number(t.value);
      const out = $("#mass-out");
      if (out) out.textContent = `${state.bodyMass} kg`;
      persist();
    }
  });

  view.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill-btn");
    if (pill) {
      if (pill.dataset.destCat) {
        state.destCategory = pill.dataset.destCat;
        view.innerHTML = viewDestination();
        syncDestination();
        return;
      }
      if (pill.dataset.devCat) {
        state.devCategory = pill.dataset.devCat;
        view.innerHTML = viewDevice();
        syncDevice();
        return;
      }
    }

    const switchBtn = e.target.closest("[data-switch]");
    if (switchBtn) {
      state.destId = switchBtn.dataset.switch;
      persist();
      loadResult();
      return;
    }

    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "next") go(state.step + 1);
    else if (t.id === "back") go(state.step - 1);
    else if (t.id === "retry") loadResult();
    else if (t.id === "export") window.print();
  });

  // Account Space Modal Trigger
  const accountBtn = $("#account-btn");
  if (accountBtn) {
    accountBtn.addEventListener("click", () => openAccountModal());
  }

  // Account Dialog Event Delegation (persona clicks, dossier loads, close)
  const accountDlg = $("#account-dialog");
  if (accountDlg) {
    accountDlg.addEventListener("click", (e) => {
      if (e.target.id === "account-dialog-close" || e.target.closest("#account-dialog-close")) {
        closeAccountModal();
        return;
      }
      const personaBtn = e.target.closest("[data-persona]");
      if (personaBtn) {
        selectPersona(personaBtn.dataset.persona);
        return;
      }
      const loadBtn = e.target.closest("[data-load-dossier]");
      if (loadBtn) {
        loadDossier(loadBtn.dataset.loadDossier);
        return;
      }
      // Click outside dialog card (on backdrop) closes dialog
      if (e.target === accountDlg) {
        closeAccountModal();
      }
    });

    accountDlg.addEventListener("cancel", () => {
      $("#account-btn").setAttribute("aria-expanded", "false");
    });
  }

  document.querySelectorAll(".pstep").forEach((btn) => {
    btn.addEventListener("click", () => go(Number(btn.dataset.step)));
  });

  window.addEventListener("popstate", () => {
    const step = Number(Object.keys(STEP_HASH).find((k) => STEP_HASH[k] === location.hash)) || 1;
    if (canEnter(step) || step < state.step) {
      state.step = step;
      persist();
      render(true);
    }
  });

  // Chart tooltip handling
  const tip = $("#tooltip");
  const showTip = (el, x, y) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    tip.style.left = `${x + 12}px`;
    tip.style.top = `${y - 36}px`;
  };

  view.addEventListener("pointermove", (e) => {
    const bar = e.target.closest(".bar[data-tip]");
    if (bar) showTip(bar, e.pageX, e.pageY);
    else tip.hidden = true;
  });

  view.addEventListener("focusin", (e) => {
    const bar = e.target.closest(".bar[data-tip]");
    if (bar) {
      const r = bar.getBoundingClientRect();
      showTip(bar, r.right + window.scrollX, r.top + window.scrollY + 8);
    } else {
      tip.hidden = true;
    }
  });

  view.addEventListener("pointerleave", () => { tip.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      tip.hidden = true;
      closeAccountModal();
    }
  });
}

async function boot() {
  try {
    const [d1, d2] = await Promise.all([fetch("/data/destinations.json"), fetch("/data/devices.json")]);
    if (!d1.ok || !d2.ok) throw new Error("Data files missing.");
    DATA.destinations = await d1.json();
    DATA.devices = await d2.json();
  } catch {
    $("#view").innerHTML = '<div class="card error-card" style="padding: 24px;"><h2>Data files failed to load</h2><p>Please launch the app via run.bat or run.ps1 and refresh.</p></div>';
    return;
  }

  const saved = session.get();
  if (saved.destId && destById(saved.destId)) state.destId = saved.destId;
  if (saved.deviceId && deviceById(saved.deviceId)) state.deviceId = saved.deviceId;
  if (STAY_OPTIONS.some((o) => o.days === saved.stayDays)) state.stayDays = saved.stayDays;
  if (typeof saved.bodyMass === "number") state.bodyMass = saved.bodyMass;
  if (saved.activePersonaId && PERSONAS.some((p) => p.id === saved.activePersonaId)) activePersonaId = saved.activePersonaId;
  state.withMit = Boolean(saved.withMit);
  state.maxStep = Math.min(saved.maxStep || 1, state.deviceId ? 3 : state.destId ? 2 : 1);

  const fromHash = Number(Object.keys(STEP_HASH).find((k) => STEP_HASH[k] === location.hash)) || saved.step || 1;
  state.step = Math.min(fromHash, state.maxStep);
  history.replaceState({ step: state.step }, "", STEP_HASH[state.step]);

  wire();
  updateNavAccount();
  render(false);
}

boot();
