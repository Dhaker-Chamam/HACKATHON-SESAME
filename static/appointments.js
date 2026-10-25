"use strict";

/* Bionic Passport: sign-in, "Book appointment" and the Appointments tab.
   The browser talks to Supabase directly with the publishable key. Row Level Security and the
   book_slot / cancel_appointment database functions decide what each user can read and change.
   Integration with static/app.js: it exposes window.BPApp and dispatches bp:ready and bp:result;
   this module exposes window.BPAccount and dispatches bp:auth. */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = () => window.BPApp;

  // Demo accounts seeded by supabase/seed_booking.sql (fictional people).
  const DEMO_ACCOUNTS = [
    { email: "traveler@demo.test", password: "BionicTraveler-2030", label: "Traveler: Alex Mercer" },
    { email: "surgeon@demo.test", password: "BionicSurgeon-2030", label: "Flight surgeon: Dr. Lina Okafor" },
  ];
  const ROLE_LABEL = { traveler: "Traveler", surgeon: "Flight surgeon", provider: "Provider" };
  const TYPE_LABEL = { flight_surgeon: "Flight surgeon", manufacturer_service: "Manufacturer service" };
  const STATUS = {
    requested: { label: "Requested", cls: "st-requested" },
    confirmed: { label: "Confirmed", cls: "st-confirmed" },
    cancelled: { label: "Cancelled", cls: "st-cancelled" },
    completed: { label: "Completed", cls: "st-completed" },
  };

  const fmtDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const fmtDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const fmtShort = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  const when = (iso) => `${fmtDate.format(new Date(iso))}, ${fmtTime.format(new Date(iso))} UTC`;
  const whenRange = (a, b) => `${fmtDate.format(new Date(a))}, ${fmtTime.format(new Date(a))} to ${fmtTime.format(new Date(b))} UTC`;
  const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);
  const initials = (name) => String(name || "?").replace(/^Dr\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  };

  const S = {
    client: null,
    configError: null,
    ready: false,
    authGate: false,
    session: null,
    profile: null,
    services: null, // id -> service row
    rules: {}, // device_id -> [{ factor, service_id }]
    pendingBooking: null,
    lastResult: null,
    ctaSeq: 0,
    appts: { status: "idle", items: [], error: null, highlight: null, confirming: null, message: null },
  };

  // ---------- errors ----------

  const isNetworkError = (err) => Boolean(err && /failed to fetch|networkerror|network request failed|load failed/i.test(String(err.message || err)));
  function friendlyError(err) {
    if (!err) return "Something went wrong. Please try again.";
    if (isNetworkError(err)) return "Could not reach the booking service. Check the internet connection and try again.";
    if (err.hint === "not_authenticated" || err.code === "42501" || err.code === "PGRST301") return "Please sign in first.";
    return err.message || "Something went wrong. Please try again.";
  }

  // ---------- Supabase client and session ----------

  async function connect() {
    try {
      if (!window.supabase || typeof window.supabase.createClient !== "function") throw new Error("supabase-js missing");
      const res = await fetch("/api/config", { cache: "no-store" });
      if (!res.ok) throw new Error(`config ${res.status}`);
      const cfg = await res.json();
      if (!cfg.supabase_url || !cfg.supabase_publishable_key) throw new Error("not configured");
      S.client = window.supabase.createClient(cfg.supabase_url, cfg.supabase_publishable_key, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "bp-auth" },
      });
      S.configError = null;
      const { data } = await S.client.auth.getSession();
      await applySession(data.session);
      S.client.auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        // Never await Supabase calls inside this callback; defer them.
        setTimeout(() => applySession(session), 0);
      });
    } catch {
      S.client = null;
      S.configError = "Booking is offline: the Supabase connection is not configured or cannot be reached.";
      setAuthGate(true);
    }
  }

  function fallbackProfile(session) {
    if (!session || !session.user) return null;
    const meta = session.user.user_metadata || {};
    const email = session.user.email || "";
    const fullName = meta.full_name || meta.name || meta.display_name || (email ? email.split("@")[0] : "Traveler");
    return {
      id: session.user.id,
      full_name: fullName,
      role: meta.role || "traveler",
      persona_id: meta.persona_id || null,
    };
  }

  async function applySession(session) {
    const sameUser = S.session && session && S.session.user.id === session.user.id && S.profile;
    S.session = session;
    if (!session) {
      S.profile = null;
    } else if (session && !sameUser) {
      try {
        const { data, error } = await S.client.from("profiles").select("id, full_name, role, persona_id").eq("id", session.user.id).maybeSingle();
        if (error && error.code !== "PGRST116") throw error;
        S.profile = data || fallbackProfile(session);
      } catch {
        S.profile = fallbackProfile(session);
      }
    }
    if (!session) S.appts = { status: "idle", items: [], error: null, highlight: null, confirming: null, message: null };
    if (S.profile && S.profile.persona_id && app() && app().setPersona) app().setPersona(S.profile.persona_id);
    setAuthGate(!session);
    updateNav();
    refreshAccountDialog();
    document.dispatchEvent(new CustomEvent("bp:auth", { detail: { user: session ? session.user : null, profile: S.profile } }));
    if (currentTab() === "appointments") loadAppointments();
  }

  async function signIn(form) {
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const errBox = $("[data-bp-login-error]", form);
    const btn = $("button[type=submit]", form);
    const fail = (msg) => { errBox.textContent = msg; errBox.hidden = false; };
    errBox.hidden = true;
    if (!email || !password) return fail("Enter your email and password.");
    btn.disabled = true;
    btn.textContent = "Signing in...";
    let error = null;
    try {
      ({ error } = await S.client.auth.signInWithPassword({ email, password }));
    } catch (err) {
      error = err;
    }
    btn.disabled = false;
    btn.textContent = "Sign in";
    if (error) return fail(/invalid login credentials/i.test(error.message || "") ? "That email and password do not match an account." : friendlyError(error));
    const { data } = await S.client.auth.getSession();
    await applySession(data.session);
    closeDialog($("#account-dialog"));
    if (S.pendingBooking) {
      const prefill = S.pendingBooking;
      S.pendingBooking = null;
      openBooking(prefill);
      return;
    }
    if (currentTab() !== "config") showTab("config", { push: false });
  }

  async function signOut() {
    try { await S.client.auth.signOut(); } catch { /* the local session is cleared either way */ }
    await applySession(null);
  }

  // ---------- navbar and account dialog ----------

  function updateNav() {
    const avatar = $("#nav-avatar");
    const name = $("#nav-name");
    const role = $("#nav-role");
    if (!avatar || !name || !role) return;
    if (S.profile) {
      avatar.textContent = initials(S.profile.full_name);
      name.textContent = S.profile.full_name;
      role.textContent = ROLE_LABEL[S.profile.role] || "Signed in";
    } else {
      avatar.textContent = "?";
      name.textContent = S.client ? "Sign in" : "Guest";
      role.textContent = S.client ? "Not signed in" : "Booking offline";
    }
  }

  function loginFormHtml(prefix, message = "") {
    return `<form class="bk-login" data-bp-login novalidate>
      ${message ? `<p class="notice">${esc(message)}</p>` : ""}
      <div class="bk-field"><label for="${prefix}-email">Email</label>
        <input id="${prefix}-email" name="email" type="email" class="bk-input" autocomplete="username" required></div>
      <div class="bk-field"><label for="${prefix}-password">Password</label>
        <input id="${prefix}-password" name="password" type="password" class="bk-input" autocomplete="current-password" required></div>
      <p class="bk-alert bk-alert-error" data-bp-login-error role="alert" hidden></p>
      <button type="submit" class="btn btn-primary">Sign in</button>
      <div class="bk-demo"><span class="hint">Demo accounts:</span>
        ${DEMO_ACCOUNTS.map((a) => `<button type="button" class="pill-btn" data-bp-demo="${esc(a.email)}">${esc(a.label)}</button>`).join("")}
      </div>
    </form>`;
  }

  function accountDialogHtml(message = "") {
    const head = (title) => `<div class="account-dialog-header">
        <h2 id="account-modal-title" class="account-dialog-title">${esc(title)}</h2>
        <button type="button" class="account-close-btn" id="account-dialog-close" aria-label="Close">&times;</button>
      </div>`;
    if (!S.client) return `${head("Account")}<div class="account-dialog-body"><p class="bk-alert bk-alert-error">${esc(S.configError)}</p></div>`;
    if (!S.profile) return `${head("Sign in")}<div class="account-dialog-body">${loginFormHtml("acct", message)}</div>`;
    const dossiers = (app() && app().dossiers && app().dossiers()) || [];
    const trips = dossiers.map((d) => `<div class="dossier-item">
        <div class="dossier-info">
          <span class="dossier-name">${esc(d.patient)} <span class="tag ${esc(d.badgeCls)}">${esc(d.badgeLabel)}</span></span>
          <span class="dossier-meta">${esc(d.summary)}</span>
        </div>
        <button type="button" class="dossier-load-btn" data-load-dossier="${esc(d.id)}">Load this trip</button>
      </div>`).join("");
    return `${head("My account")}
      <div class="account-dialog-body">
        <div class="account-profile-box">
          <div class="account-profile-avatar">${esc(initials(S.profile.full_name))}</div>
          <div class="account-profile-details">
            <span class="account-profile-name">${esc(S.profile.full_name)}</span>
            <span class="account-profile-sub">${esc(ROLE_LABEL[S.profile.role] || S.profile.role)}, ${esc(S.session.user.email)}</span>
          </div>
        </div>
        <div class="bk-row">
          <button type="button" class="btn" data-bp-open-appts>${ICON.calendar}My appointments</button>
          <button type="button" class="btn" data-bp-signout>Sign out</button>
        </div>
        ${trips ? `<div><span class="field-label">Saved trips</span><div class="dossier-list">${trips}</div></div>` : ""}
      </div>`;
  }

  function openAccountDialog(message = "") {
    const dlg = $("#account-dialog");
    if (!dlg) return;
    $("#account-dialog-content").innerHTML = accountDialogHtml(message);
    if (!dlg.open) dlg.showModal();
    const btn = $("#account-btn");
    if (btn) btn.setAttribute("aria-expanded", "true");
    const first = $("input[name=email]", dlg);
    if (first) first.focus();
  }

  function refreshAccountDialog() {
    const dlg = $("#account-dialog");
    if (dlg && dlg.open && $("#account-dialog-content")) $("#account-dialog-content").innerHTML = accountDialogHtml();
  }

  function closeDialog(dlg) {
    if (dlg && dlg.open) dlg.close();
    if (dlg && dlg.id === "account-dialog" && $("#account-btn")) $("#account-btn").setAttribute("aria-expanded", "false");
  }

  function authGateHtml() {
    const message = S.configError
      ? `<p class="bk-alert bk-alert-error">${esc(S.configError)}</p>`
      : `<p class="auth-gate-lead">Sign in to access your medical device dashboard and appointments.</p>`;
    const form = S.client
      ? loginFormHtml("gate")
      : `<button type="button" class="btn btn-primary" data-bp-retry-auth>Try again</button>`;
    return `<section class="auth-gate-card" aria-labelledby="auth-gate-title">
      <div class="auth-gate-mark" aria-hidden="true">BP</div>
      <p class="eyebrow">Bionic Passport</p>
      <h1 id="auth-gate-title">Welcome back</h1>
      ${message}
      ${form}
    </section>`;
  }

  function setAuthGate(show) {
    const view = $("#view");
    if (!view) return;
    let gate = $("#auth-gate");
    if (show) {
      if (!gate) {
        gate = document.createElement("main");
        gate.id = "auth-gate";
        gate.className = "auth-gate";
        view.before(gate);
      }
      gate.innerHTML = authGateHtml();
      gate.hidden = false;
      view.hidden = true;
      $("#appointments-view").hidden = true;
      document.querySelector(".progress").hidden = true;
      document.querySelector(".tabs").hidden = true;
      $("#account-btn").hidden = true;
      $("#chat-fab").hidden = true;
      S.authGate = true;
      return;
    }
    if (gate) gate.remove();
    view.hidden = false;
    document.querySelector(".progress").hidden = false;
    document.querySelector(".tabs").hidden = false;
    $("#account-btn").hidden = false;
    $("#chat-fab").hidden = false;
    S.authGate = false;
  }

  // ---------- reference data ----------

  async function getServices() {
    if (S.services) return S.services;
    const { data, error } = await S.client.from("services").select("id, name, description, sort_order").order("sort_order");
    if (error) throw error;
    S.services = Object.fromEntries(data.map((s) => [s.id, s]));
    return S.services;
  }

  async function getRules(deviceId) {
    if (S.rules[deviceId]) return S.rules[deviceId];
    const { data, error } = await S.client.from("service_rules").select("factor, service_id").eq("device_id", deviceId);
    if (error) throw error;
    S.rules[deviceId] = data;
    return data;
  }

  const serviceName = (id) => (S.services && S.services[id] ? S.services[id].name : id);
  const deviceName = (id) => (id && app() && app().deviceName ? app().deviceName(id) : id || "");
  const destName = (id) => (id && app() && app().destName ? app().destName(id) : id || "");

  // ---------- "Book appointment" call to action on the result screen ----------

  async function renderCta() {
    const seq = ++S.ctaSeq;
    const slot = $("#book-cta");
    const r = S.lastResult;
    if (!slot || !r) return;
    if (!S.client) { slot.innerHTML = ""; return; }
    const result = r.result;
    let needed = [];
    try {
      const [rules] = await Promise.all([getRules(result.device.id), getServices()]);
      const byService = new Map();
      for (const m of result.mitigations) {
        for (const factor of [...(m.resolves || []), ...(m.reduces || [])]) {
          for (const rule of rules.filter((x) => x.factor === factor)) {
            if (!byService.has(rule.service_id)) byService.set(rule.service_id, { id: rule.service_id, reason: m.text });
          }
        }
      }
      needed = [...byService.values()]
        .filter((n) => S.services[n.id])
        .sort((a, b) => S.services[a.id].sort_order - S.services[b.id].sort_order)
        .map((n) => ({ ...n, name: S.services[n.id].name }));
    } catch {
      needed = [];
    }
    if (seq !== S.ctaSeq || !slot.isConnected) return;
    if (!needed.length) { slot.innerHTML = ""; return; }
    slot.innerHTML = `<div class="book-cta">
      <div class="book-cta-text">
        <strong>${needed.length === 1 ? "One of these fixes needs" : "Some of these fixes need"} a service visit</strong>
        <span>${needed.map((n) => esc(n.name)).join(", ")}</span>
      </div>
      <button type="button" class="btn btn-primary" data-bp-book>${ICON.calendar}Book appointment</button>
    </div>`;
    slot.querySelector("[data-bp-book]").addEventListener("click", () => openBooking({
      type: "manufacturer_service",
      destinationId: result.destination.id,
      deviceId: result.device.id,
      serviceOptions: needed,
      serviceId: needed[0].id,
    }));
  }

  // ---------- booking dialog: center, then time, then confirm ----------

  const B = {};
  function resetBooking(prefill) {
    Object.assign(B, {
      prefill,
      type: prefill.type,
      destinationId: prefill.destinationId,
      deviceId: prefill.deviceId || null,
      serviceOptions: prefill.serviceOptions || [],
      serviceId: prefill.serviceId || null,
      reason: prefill.reason || "",
      step: 1,
      destOptions: [],
      bases: [],
      baseId: null,
      providers: [],
      providerStatus: "loading",
      providerError: null,
      providerId: null,
      slots: [],
      slotStatus: "idle",
      slotError: null,
      slotId: null,
      notes: "",
      submitting: false,
      submitError: null,
      success: null,
    });
    const option = B.serviceOptions.find((o) => o.id === B.serviceId);
    if (option && !B.reason) B.reason = option.reason;
  }

  async function openBooking(prefill) {
    if (!S.client) { openAccountDialog(); return; }
    if (!S.profile) {
      S.pendingBooking = prefill;
      openAccountDialog(prefill.type === "flight_surgeon" ? "Sign in to book a flight surgeon." : "Sign in to book a service appointment.");
      return;
    }
    resetBooking(prefill);
    const dlg = $("#booking-dialog");
    renderBooking();
    if (!dlg.open) dlg.showModal();
    await getServices().catch(() => null);
    if (B.type === "flight_surgeon") await loadDestOptions();
    await loadBases();
  }

  async function loadDestOptions() {
    const { data, error } = await S.client.from("sites").select("destination_id");
    if (error) { B.providerStatus = "error"; B.providerError = friendlyError(error); renderBooking(); return; }
    const ids = [...new Set(data.map((s) => s.destination_id))];
    const order = (app() && app().destinationIds ? app().destinationIds() : ids);
    B.destOptions = order.filter((id) => ids.includes(id));
    if (!B.destOptions.includes(B.destinationId)) B.destinationId = B.destOptions[0] || B.destinationId;
  }

  async function loadBases() {
    B.providerStatus = "loading";
    renderBooking();
    const { data, error } = await S.client.from("sites").select("id, name, kind").eq("destination_id", B.destinationId).order("sort_order");
    if (error) { B.providerStatus = "error"; B.providerError = friendlyError(error); renderBooking(); return; }
    B.bases = data;
    B.baseId = data.length ? data[0].id : null;
    await loadProviders();
  }

  async function loadProviders() {
    B.providerId = null;
    if (!B.baseId) { B.providers = []; B.providerStatus = "ready"; renderBooking(); return; }
    B.providerStatus = "loading";
    renderBooking();
    const args = { p_destination_id: B.destinationId, p_type: B.type, p_base_site_id: B.baseId };
    if (B.type === "manufacturer_service") Object.assign(args, { p_device_id: B.deviceId, p_service_id: B.serviceId });
    const { data, error } = await S.client.rpc("find_providers", args);
    if (error) { B.providerStatus = "error"; B.providerError = friendlyError(error); renderBooking(); return; }
    B.providers = data;
    B.providerStatus = "ready";
    renderBooking();
  }

  async function loadSlots() {
    B.slotId = null;
    B.slotStatus = "loading";
    renderBooking();
    const { data, error } = await S.client.from("slots").select("id, starts_at, ends_at")
      .eq("provider_id", B.providerId).eq("is_booked", false).gt("starts_at", new Date().toISOString())
      .order("starts_at").limit(56);
    if (error) { B.slotStatus = "error"; B.slotError = friendlyError(error); renderBooking(); return; }
    B.slots = data;
    B.slotStatus = "ready";
    renderBooking();
  }

  async function confirmBooking() {
    const provider = B.providers.find((p) => p.provider_id === B.providerId);
    B.submitting = true;
    B.submitError = null;
    renderBooking();
    let res;
    try {
      res = await S.client.rpc("book_slot", {
        p_slot_id: B.slotId,
        p_device_id: B.deviceId,
        p_reason: B.reason.trim() || (B.type === "flight_surgeon" ? "Pre-flight medical review" : serviceName(B.serviceId)),
        p_notes: B.notes.trim() || null,
        p_service_id: B.type === "manufacturer_service" ? B.serviceId : null,
      });
    } catch (err) {
      res = { error: err };
    }
    B.submitting = false;
    if (res.error) {
      if (res.error.hint === "slot_taken") {
        // Someone else got there first: go back to the times, refreshed.
        B.step = 2;
        await loadSlots();
        B.slotError = friendlyError(res.error);
        renderBooking();
        return;
      }
      if (res.error.hint === "not_authenticated") {
        S.pendingBooking = B.prefill;
        closeDialog($("#booking-dialog"));
        openAccountDialog("Your session ended. Sign in again to book.");
        return;
      }
      B.submitError = friendlyError(res.error);
      renderBooking();
      return;
    }
    B.success = { ...res.data, site_name: provider ? provider.site_name : "" };
    S.appts.highlight = res.data.id;
    renderBooking();
    if (currentTab() === "appointments") loadAppointments();
  }

  function distanceLabel(p) {
    if (p.transfer_hours !== null && p.transfer_hours !== undefined) {
      return Number(p.transfer_hours) === 0 ? "Same station" : `${Number(p.transfer_hours).toFixed(1)} h transfer`;
    }
    if (p.distance_km !== null && p.distance_km !== undefined) {
      return p.distance_km < 1 ? "At your base" : `${Math.round(p.distance_km).toLocaleString("en-US")} km away`;
    }
    return "Distance unknown";
  }

  function stepsHtml() {
    const names = B.type === "flight_surgeon" ? ["Doctor", "Time", "Confirm"] : ["Center", "Time", "Confirm"];
    return `<ol class="bk-steps" aria-label="Booking steps">${names.map((n, i) => {
      const k = i + 1;
      const state = B.success ? "done" : k < B.step ? "done" : k === B.step ? "current" : "todo";
      return `<li class="bk-step ${state}"${k === B.step && !B.success ? ' aria-current="step"' : ""}><span class="bk-step-dot">${state === "done" ? ICON.check : k}</span>${n}</li>`;
    }).join("")}</ol>`;
  }

  function summaryHtml() {
    const chips = [];
    // Choices can change only on the first step; later steps show them as plain labels.
    if (B.type === "flight_surgeon") {
      const opts = B.destOptions.map((id) => `<option value="${esc(id)}"${id === B.destinationId ? " selected" : ""}>${esc(destName(id))}</option>`).join("");
      chips.push(B.step === 1 && B.destOptions.length > 1
        ? `<label class="bk-chip-field">Destination <select name="bk-dest" class="bk-select">${opts}</select></label>`
        : `<span class="tag">Destination: ${esc(destName(B.destinationId))}</span>`);
      if (B.deviceId) chips.push(`<span class="tag">Device: ${esc(deviceName(B.deviceId))}</span>`);
    } else {
      chips.push(`<span class="tag">Device: ${esc(deviceName(B.deviceId))}</span>`);
      chips.push(`<span class="tag">Destination: ${esc(destName(B.destinationId))}</span>`);
      if (B.serviceOptions.length > 1 && B.step === 1) {
        const opts = B.serviceOptions.map((o) => `<option value="${esc(o.id)}"${o.id === B.serviceId ? " selected" : ""}>${esc(o.name)}</option>`).join("");
        chips.push(`<label class="bk-chip-field">Service <select name="bk-service" class="bk-select">${opts}</select></label>`);
      } else {
        chips.push(`<span class="tag tag-fixed">Service: ${esc(serviceName(B.serviceId))}</span>`);
      }
    }
    return `<div class="bk-summary">${chips.join("")}</div>`;
  }

  function providersHtml() {
    const bases = B.bases.map((b) => `<option value="${esc(b.id)}"${b.id === B.baseId ? " selected" : ""}>${esc(b.name)}</option>`).join("");
    const baseField = B.bases.length
      ? `<label class="bk-base">${ICON.pin}<span>Your base</span><select name="bk-base" class="bk-select">${bases}</select></label>`
      : "";
    let list;
    if (B.providerStatus === "loading") {
      list = `<div class="bk-state" role="status">Finding the nearest ${B.type === "flight_surgeon" ? "flight surgeons" : "service centers"}...</div>`;
    } else if (B.providerStatus === "error") {
      list = `<div class="bk-state bk-state-error" role="alert"><p>${esc(B.providerError)}</p><button type="button" class="btn" data-bk="retry-providers">Try again</button></div>`;
    } else if (!B.providers.length) {
      list = `<div class="bk-state"><p><strong>${B.bases.length ? "No match at this destination" : `No ${B.type === "flight_surgeon" ? "flight surgeons" : "service centers"} at ${esc(destName(B.destinationId))} yet`}</strong></p>
        <p class="hint">${B.bases.length && B.type === "manufacturer_service"
          ? `No center here supports the ${esc(deviceName(B.deviceId).toLowerCase())} for ${esc(serviceName(B.serviceId).toLowerCase())}.${B.serviceOptions.length > 1 ? " Try another service above." : ""}`
          : "Demo providers are listed for the Orbital Habitat, the Moon and Mars."}</p></div>`;
    } else {
      list = `<div class="bk-centers" role="radiogroup" aria-label="${B.type === "flight_surgeon" ? "Flight surgeons" : "Service centers"}">${B.providers.map((p) => {
        const devices = p.supported_devices.map(deviceName);
        const shownDevices = devices.slice(0, 3).map((d) => `<span class="tag">${esc(d)}</span>`).join("") + (devices.length > 3 ? `<span class="tag">+${devices.length - 3} more</span>` : "");
        const services = p.services.map((s) => `<span class="tag${s === B.serviceId ? " tag-fixed" : ""}">${esc(serviceName(s))}</span>`).join("");
        return `<label class="card pick bk-center">
          <input type="radio" name="bk-provider" value="${esc(p.provider_id)}" class="sr-only"${p.provider_id === B.providerId ? " checked" : ""}>
          <span class="pick-check">${ICON.check}</span>
          <span class="bk-center-main">
            <span class="bk-center-name">${esc(p.name)}</span>
            <span class="bk-center-site">${esc(p.organization ? `${p.organization}, ` : "")}${esc(p.site_name)}</span>
          </span>
          <span class="bk-center-distance">${esc(distanceLabel(p))}</span>
          ${devices.length ? `<span class="bk-center-row"><span class="bk-center-label">Devices</span>${shownDevices}</span>` : ""}
          <span class="bk-center-row"><span class="bk-center-label">${B.type === "flight_surgeon" ? "Offers" : "Services"}</span>${services}</span>
          <span class="bk-center-next">${p.next_slot_at ? `Next free: <strong>${esc(when(p.next_slot_at))}</strong>` : "No free times in the next 14 days"}</span>
        </label>`;
      }).join("")}</div>`;
    }
    return `<div class="bk-toolbar">${baseField}<span class="demo-label">Demo data: fictional providers</span></div>${list}`;
  }

  function slotsHtml() {
    const provider = B.providers.find((p) => p.provider_id === B.providerId);
    const head = `<p class="bk-lead">Free times at <strong>${esc(provider ? provider.name : "")}</strong>, ${esc(provider ? provider.site_name : "")}. All times are UTC.</p>`;
    const alert = B.slotError ? `<p class="bk-alert bk-alert-error" role="alert">${esc(B.slotError)}</p>` : "";
    if (B.slotStatus === "loading") return `${head}${alert}<div class="bk-state" role="status">Loading free times...</div>`;
    if (B.slotStatus === "error" && !B.slots.length) return `${head}<div class="bk-state bk-state-error" role="alert"><p>${esc(B.slotError)}</p><button type="button" class="btn" data-bk="retry-slots">Try again</button></div>`;
    if (!B.slots.length) return `${head}${alert}<div class="bk-state"><p><strong>No free times in the next 14 days.</strong></p><p class="hint">Go back and pick another ${B.type === "flight_surgeon" ? "doctor" : "center"}.</p></div>`;
    const days = new Map();
    for (const s of B.slots) {
      const k = dayKey(s.starts_at);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(s);
    }
    const groups = [...days.values()].map((list) => `<div class="bk-day">
        <span class="bk-day-name">${esc(fmtDay.format(new Date(list[0].starts_at)))}</span>
        <div class="bk-times" role="radiogroup" aria-label="${esc(fmtDay.format(new Date(list[0].starts_at)))}">${list.map((s) => `<label class="bk-time">
          <input type="radio" name="bk-slot" value="${esc(s.id)}" class="sr-only"${s.id === B.slotId ? " checked" : ""}>
          <span>${esc(fmtTime.format(new Date(s.starts_at)))}</span></label>`).join("")}</div>
      </div>`).join("");
    return `${head}${alert}<div class="bk-days">${groups}</div>`;
  }

  function confirmHtml() {
    const provider = B.providers.find((p) => p.provider_id === B.providerId);
    const slot = B.slots.find((s) => s.id === B.slotId);
    const rows = [
      [B.type === "flight_surgeon" ? "Doctor" : "Service center", provider ? `${provider.name}${provider.organization ? `, ${provider.organization}` : ""}` : ""],
      ["Where", `${provider ? provider.site_name : ""}, ${destName(B.destinationId)}`],
      ["When", slot ? whenRange(slot.starts_at, slot.ends_at) : ""],
      ["Device", deviceName(B.deviceId) || "Not specified"],
    ];
    if (B.type === "manufacturer_service") rows.push(["Service", serviceName(B.serviceId)]);
    const reasonField = B.type === "flight_surgeon"
      ? `<div class="bk-field"><label for="bk-reason">Reason</label><input id="bk-reason" name="bk-reason" class="bk-input" maxlength="500" value="${esc(B.reason || "Pre-flight medical review")}"></div>`
      : `<div class="bk-reason"><span class="bk-center-label">Reason (from your result)</span><p>${esc(B.reason)}</p></div>`;
    return `<dl class="bk-confirm">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      ${reasonField}
      <div class="bk-field"><label for="bk-notes">Note for the ${B.type === "flight_surgeon" ? "doctor" : "service team"} <span class="hint">(optional)</span></label>
        <textarea id="bk-notes" name="bk-notes" class="bk-input" rows="3" maxlength="500" placeholder="For example: bring the spare battery">${esc(B.notes)}</textarea></div>
      ${B.submitError ? `<p class="bk-alert bk-alert-error" role="alert">${esc(B.submitError)}</p>` : ""}`;
  }

  function successHtml() {
    const s = B.success;
    return `<div class="bk-success" role="status">
      <span class="bk-success-icon">${ICON.check}</span>
      <h3>${s.status === "confirmed" ? "Appointment confirmed" : "Appointment requested"}</h3>
      <p>${esc(s.provider_name)}${s.site_name ? `, ${esc(s.site_name)}` : ""}<br>${esc(whenRange(s.starts_at, s.ends_at))}</p>
      <p class="hint">${s.status === "confirmed" ? "The time slot is now reserved for you." : "The clinic will confirm the time."}</p>
    </div>`;
  }

  function renderBooking() {
    const card = $("#bk-card");
    if (!card || !B.type) return;
    const title = B.type === "flight_surgeon" ? "Book a flight surgeon" : "Book a service appointment";
    let body;
    let footer;
    if (B.success) {
      body = successHtml();
      footer = `<button type="button" class="btn" data-bk="close">Close</button>
        <button type="button" class="btn btn-primary" data-bk="view-appt">View in Appointments</button>`;
    } else if (B.step === 1) {
      body = providersHtml();
      footer = `<button type="button" class="btn" data-bk="close">Cancel</button>
        <button type="button" class="btn btn-primary" data-bk="next"${B.providerId ? "" : " disabled"}>Choose a time</button>`;
    } else if (B.step === 2) {
      body = slotsHtml();
      footer = `<button type="button" class="btn" data-bk="back">Back</button>
        <button type="button" class="btn btn-primary" data-bk="next"${B.slotId ? "" : " disabled"}>Continue</button>`;
    } else {
      body = confirmHtml();
      footer = `<button type="button" class="btn" data-bk="back"${B.submitting ? " disabled" : ""}>Back</button>
        <button type="button" class="btn btn-primary" data-bk="confirm"${B.submitting ? " disabled" : ""}>${B.submitting ? "Booking..." : "Confirm booking"}</button>`;
    }
    const focused = document.activeElement && card.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? focused.getAttribute("name") || focused.dataset.bk : null;
    card.innerHTML = `<div class="account-dialog-header">
        <h2 id="bk-title" class="account-dialog-title">${title}</h2>
        <button type="button" class="account-close-btn" data-bk="close" aria-label="Close">&times;</button>
      </div>
      <div class="bk-head">${stepsHtml()}${B.success ? "" : summaryHtml()}</div>
      <div class="account-dialog-body bk-body">${body}</div>
      <div class="bk-footer">${footer}</div>`;
    if (focusKey) {
      const again = card.querySelector(`[name="${focusKey}"]:checked`) || card.querySelector(`[name="${focusKey}"]`) || card.querySelector(`[data-bk="${focusKey}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function wireBooking() {
    const dlg = $("#booking-dialog");
    dlg.addEventListener("change", (e) => {
      const t = e.target;
      if (t.name === "bk-provider") { B.providerId = t.value; renderBooking(); }
      else if (t.name === "bk-slot") { B.slotId = t.value; B.slotError = null; renderBooking(); }
      else if (t.name === "bk-base") { B.baseId = t.value; loadProviders(); }
      else if (t.name === "bk-service") {
        B.serviceId = t.value;
        const option = B.serviceOptions.find((o) => o.id === B.serviceId);
        B.reason = option ? option.reason : B.reason;
        loadProviders();
      } else if (t.name === "bk-dest") { B.destinationId = t.value; loadBases(); }
    });
    dlg.addEventListener("input", (e) => {
      if (e.target.name === "bk-notes") B.notes = e.target.value;
      if (e.target.name === "bk-reason") B.reason = e.target.value;
    });
    dlg.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bk]");
      if (!btn) { if (e.target === dlg) closeDialog(dlg); return; }
      const action = btn.dataset.bk;
      if (action === "close") closeDialog(dlg);
      else if (action === "retry-providers") loadBases();
      else if (action === "retry-slots") loadSlots();
      else if (action === "back") { B.step -= 1; B.submitError = null; renderBooking(); }
      else if (action === "next") {
        B.step += 1;
        if (B.step === 2) loadSlots(); else renderBooking();
      } else if (action === "confirm") confirmBooking();
      else if (action === "view-appt") { closeDialog(dlg); showTab("appointments"); }
    });
  }

  // ---------- Appointments tab ----------

  function currentTab() {
    const panel = $("#appointments-view");
    return panel && !panel.hidden ? "appointments" : "config";
  }

  function showTab(tab, { push = true } = {}) {
    const panel = $("#appointments-view");
    const configView = $("#view");
    if (!panel || !configView) return;
    const appts = tab === "appointments";
    configView.hidden = appts;
    panel.hidden = !appts;
    const progress = document.querySelector(".progress");
    if (progress) progress.hidden = appts;
    for (const [id, selected] of [["tab-config", !appts], ["tab-appts", appts]]) {
      const el = document.getElementById(id);
      if (el) { el.setAttribute("aria-selected", String(selected)); el.tabIndex = selected ? 0 : -1; }
    }
    if (push) {
      const hash = appts ? "#appointments" : (app() && app().stepHash ? app().stepHash() : "#destination");
      if (location.hash !== hash) history.pushState({ tab }, "", hash);
    }
    if (appts) {
      window.scrollTo(0, 0);
      renderAppointments();
      loadAppointments();
      panel.focus({ preventScroll: true });
    }
  }

  async function loadAppointments() {
    if (!S.client || !S.profile) { renderAppointments(); return; }
    S.appts.status = S.appts.items.length ? "refreshing" : "loading";
    renderAppointments();
    const { data, error } = await S.client.from("appointments")
      .select("id, type, status, reason, notes, created_at, cancelled_at, device_id, destination_id, service_id, provider:providers(id, name, organization, site:sites(name)), slot:slots(starts_at, ends_at), destination:destinations(name)")
      .order("created_at", { ascending: false });
    if (error) {
      S.appts.status = "error";
      S.appts.error = friendlyError(error);
    } else {
      S.appts.status = "ready";
      S.appts.items = data;
      S.appts.error = null;
    }
    renderAppointments();
  }

  function splitAppointments(items) {
    const now = Date.now();
    const upcoming = [];
    const past = [];
    for (const a of items) {
      const start = a.slot ? Date.parse(a.slot.starts_at) : 0;
      ((a.status === "requested" || a.status === "confirmed") && start > now ? upcoming : past).push(a);
    }
    upcoming.sort((a, b) => Date.parse(a.slot.starts_at) - Date.parse(b.slot.starts_at));
    past.sort((a, b) => Date.parse(b.slot ? b.slot.starts_at : 0) - Date.parse(a.slot ? a.slot.starts_at : 0));
    return { upcoming, past };
  }

  function apptCardHtml(a, canCancel) {
    const st = STATUS[a.status] || { label: a.status, cls: "" };
    const site = a.provider && a.provider.site ? a.provider.site.name : "";
    const destination = a.destination ? a.destination.name : destName(a.destination_id);
    const confirming = S.appts.confirming === a.id;
    return `<article class="card appt-card${S.appts.highlight === a.id ? " is-new" : ""}${a.status === "cancelled" ? " is-cancelled" : ""}" id="appt-${esc(a.id)}">
      <div class="appt-top">
        <span class="tag appt-type">${a.type === "flight_surgeon" ? ICON.calendar : ICON.wrench}${esc(TYPE_LABEL[a.type] || a.type)}</span>
        <span class="appt-status ${st.cls}">${esc(st.label)}</span>
      </div>
      <h3 class="appt-provider">${esc(a.provider ? a.provider.name : "Unknown provider")}</h3>
      <p class="appt-org">${esc(a.provider && a.provider.organization ? a.provider.organization : "")}</p>
      <dl class="appt-meta">
        <div><dt>When (UTC)</dt><dd>${a.slot ? esc(whenRange(a.slot.starts_at, a.slot.ends_at)) : ""}</dd></div>
        <div><dt>Where</dt><dd>${esc(site)}, ${esc(destination)}</dd></div>
        <div><dt>Device</dt><dd>${esc(deviceName(a.device_id) || "Not specified")}</dd></div>
        <div><dt>Reason</dt><dd>${esc(a.reason)}</dd></div>
      </dl>
      ${a.notes ? `<p class="appt-notes"><strong>Notes:</strong> ${esc(a.notes)}</p>` : ""}
      ${confirming
        ? `<div class="appt-confirm" role="group" aria-label="Confirm cancellation">
            <span>Cancel this appointment? The time slot is released for others.</span>
            <button type="button" class="btn btn-danger" data-appt-cancel-yes="${esc(a.id)}">Yes, cancel</button>
            <button type="button" class="btn" data-appt-cancel-no>Keep it</button>
          </div>`
        : `<div class="appt-actions">
            <button type="button" class="btn" data-appt-details="${esc(a.id)}">View details</button>
            ${canCancel ? `<button type="button" class="btn btn-danger-ghost" data-appt-cancel="${esc(a.id)}">Cancel</button>` : ""}
          </div>`}
    </article>`;
  }

  function renderAppointments() {
    const panel = $("#appointments-view");
    if (!panel || panel.hidden) return;
    const head = `<header class="step-head appts-head">
        <div><h1 id="appts-title" tabindex="-1">Appointments</h1>
          <p>Flight surgeon visits and manufacturer service bookings. All times are in UTC.</p></div>
        ${S.profile ? `<button type="button" class="btn btn-primary" data-bp-book-surgeon>${ICON.calendar}Book a flight surgeon</button>` : ""}
      </header>`;
    let body;
    if (!S.client) {
      body = `<div class="card bk-panel"><p class="bk-alert bk-alert-error">${esc(S.configError || "Connecting to the booking service...")}</p></div>`;
    } else if (!S.profile) {
      body = `<div class="card bk-panel appts-login"><h2>Sign in to see your appointments</h2>
        <p class="hint">Each account only ever sees its own appointments.</p>${loginFormHtml("appts")}</div>`;
    } else if (S.appts.status === "loading") {
      body = '<div class="bk-state" role="status">Loading your appointments...</div>';
    } else if (S.appts.status === "error") {
      body = `<div class="bk-state bk-state-error" role="alert"><p>${esc(S.appts.error)}</p><button type="button" class="btn" data-appts-retry>Try again</button></div>`;
    } else {
      const { upcoming, past } = splitAppointments(S.appts.items);
      const message = S.appts.message ? `<p class="bk-alert bk-alert-ok" role="status">${esc(S.appts.message)}</p>` : "";
      const section = (title, list, empty, canCancel) => `<section class="appts-section" aria-labelledby="appts-${title.toLowerCase()}">
          <h2 id="appts-${title.toLowerCase()}">${title} <span class="appts-count">${list.length}</span></h2>
          ${list.length ? `<div class="appts-grid">${list.map((a) => apptCardHtml(a, canCancel)).join("")}</div>` : `<div class="bk-state"><p>${empty}</p></div>`}
        </section>`;
      body = `${message}<p class="demo-label">Demo data: fictional providers</p>
        ${section("Upcoming", upcoming, "No upcoming appointments. Book a service from a compatibility result, or book a flight surgeon.", true)}
        ${section("Past", past, "No past appointments yet.", false)}`;
    }
    panel.innerHTML = `<section class="appts" aria-labelledby="appts-title">${head}${body}</section>`;
    if (S.appts.highlight) {
      const el = document.getElementById(`appt-${S.appts.highlight}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "auto" });
        setTimeout(() => { S.appts.highlight = null; el.classList.remove("is-new"); }, 2400);
      }
    }
  }

  async function cancelAppointment(id) {
    const btn = document.querySelector(`[data-appt-cancel-yes="${CSS.escape(id)}"]`);
    if (btn) { btn.disabled = true; btn.textContent = "Cancelling..."; }
    let res;
    try {
      res = await S.client.rpc("cancel_appointment", { p_appointment_id: id });
    } catch (err) {
      res = { error: err };
    }
    S.appts.confirming = null;
    S.appts.message = res.error ? null : "Appointment cancelled. The time slot is free again.";
    if (res.error) {
      S.appts.status = "ready";
      renderAppointments();
      const card = document.getElementById(`appt-${id}`);
      if (card) card.insertAdjacentHTML("beforeend", `<p class="bk-alert bk-alert-error" role="alert">${esc(friendlyError(res.error))}</p>`);
      return;
    }
    await loadAppointments();
  }

  function detailsHtml(a) {
    const st = STATUS[a.status] || { label: a.status };
    const rows = [
      ["Type", TYPE_LABEL[a.type] || a.type],
      ["Status", st.label],
      [a.type === "flight_surgeon" ? "Doctor" : "Service center", a.provider ? a.provider.name : ""],
      ["Organization", a.provider && a.provider.organization ? a.provider.organization : ""],
      ["Where", `${a.provider && a.provider.site ? a.provider.site.name : ""}, ${a.destination ? a.destination.name : destName(a.destination_id)}`],
      ["When", a.slot ? whenRange(a.slot.starts_at, a.slot.ends_at) : ""],
      ["Device", deviceName(a.device_id) || "Not specified"],
      ["Service", a.service_id ? serviceName(a.service_id) : ""],
      ["Reason", a.reason],
      ["Notes", a.notes || ""],
      ["Booked on", when(a.created_at)],
      ["Cancelled on", a.cancelled_at ? when(a.cancelled_at) : ""],
      ["Reference", a.id.slice(0, 8).toUpperCase()],
    ].filter(([, v]) => v);
    return `<div class="account-dialog-header"><h2 class="account-dialog-title" id="appt-dialog-title">Appointment details</h2>
        <button type="button" class="account-close-btn" data-appt-close aria-label="Close">&times;</button></div>
      <div class="account-dialog-body"><p class="demo-label">Demo data: fictional providers</p>
        <dl class="bk-confirm">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>`;
  }

  function wireAppointments() {
    const panel = $("#appointments-view");
    panel.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.dataset.apptCancel) { S.appts.confirming = t.dataset.apptCancel; S.appts.message = null; renderAppointments(); $("[data-appt-cancel-yes]", panel).focus(); }
      else if ("apptCancelNo" in t.dataset) { S.appts.confirming = null; renderAppointments(); }
      else if (t.dataset.apptCancelYes) cancelAppointment(t.dataset.apptCancelYes);
      else if (t.dataset.apptDetails) {
        const a = S.appts.items.find((x) => x.id === t.dataset.apptDetails);
        if (!a) return;
        const dlg = $("#appt-dialog");
        $("#appt-dialog-card").innerHTML = detailsHtml(a);
        dlg.showModal();
      } else if ("apptsRetry" in t.dataset) loadAppointments();
      else if ("bpBookSurgeon" in t.dataset) {
        const st = app() && app().state ? app().state() : {};
        openBooking({ type: "flight_surgeon", destinationId: st.destId || "moon", deviceId: st.deviceId || null, reason: "Pre-flight medical review" });
      }
    });
    const details = $("#appt-dialog");
    details.addEventListener("click", (e) => { if (e.target === details || e.target.closest("[data-appt-close]")) details.close(); });
  }

  // ---------- shell, tabs and global events ----------

  function injectShell() {
    if (!$("#appointments-view")) {
      const panel = document.createElement("main");
      panel.id = "appointments-view";
      panel.className = "view appts-view";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "tab-appts");
      panel.tabIndex = -1;
      panel.hidden = true;
      $("#view").after(panel);
    }
    for (const [id, cardId, label] of [["booking-dialog", "bk-card", "bk-title"], ["appt-dialog", "appt-dialog-card", "appt-dialog-title"]]) {
      if (document.getElementById(id)) continue;
      const dlg = document.createElement("dialog");
      dlg.id = id;
      dlg.className = `account-dialog ${id === "booking-dialog" ? "bk-dialog" : ""}`;
      dlg.setAttribute("aria-labelledby", label);
      dlg.innerHTML = `<div class="account-dialog-card" id="${cardId}"></div>`;
      document.body.appendChild(dlg);
    }
  }

  function wireGlobal() {
    const tabs = [document.getElementById("tab-config"), document.getElementById("tab-appts")].filter(Boolean);
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => showTab(i === 1 ? "appointments" : "config"));
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        next.click();
      });
    });
    window.addEventListener("popstate", () => showTab(location.hash.startsWith("#appointments") ? "appointments" : "config", { push: false }));

    // Sign-in forms (account dialog and Appointments tab) and account actions.
    document.addEventListener("submit", (e) => {
      const form = e.target.closest("[data-bp-login]");
      if (!form) return;
      e.preventDefault();
      signIn(form);
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-bp-retry-auth]")) {
        connect();
        return;
      }
      const demo = e.target.closest("[data-bp-demo]");
      if (demo) {
        const form = demo.closest("[data-bp-login]");
        const account = DEMO_ACCOUNTS.find((a) => a.email === demo.dataset.bpDemo);
        if (form && account) { form.elements.email.value = account.email; form.elements.password.value = account.password; $("button[type=submit]", form).focus(); }
        return;
      }
      if (e.target.closest("[data-bp-signout]")) { signOut(); return; }
      if (e.target.closest("[data-load-dossier]")) { showTab("config"); return; } // app.js loads the trip
      if (e.target.closest("[data-bp-open-appts]")) { closeDialog($("#account-dialog")); showTab("appointments"); }
    });
    $("#account-dialog").addEventListener("close", () => { S.pendingBooking = null; });

    document.addEventListener("bp:result", (e) => { S.lastResult = e.detail; renderCta(); });
  }

  async function init() {
    injectShell();
    wireGlobal();
    wireBooking();
    wireAppointments();
    await connect();
    S.ready = true;
    updateNav();
    if (location.hash.startsWith("#appointments")) showTab("appointments", { push: false });
    if (S.lastResult) renderCta();
  }

  window.BPAccount = {
    get ready() { return S.ready; },
    get profile() { return S.profile; },
    get user() { return S.session ? S.session.user : null; },
    accessToken: () => (S.session ? S.session.access_token : null),
    updateNav,
    openAccountDialog: () => openAccountDialog(),
    showTab,
  };

  if (window.BPApp) init();
  else document.addEventListener("bp:ready", () => init(), { once: true });
})();
