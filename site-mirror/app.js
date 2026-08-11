"use strict";

/* ============================================================
   Gate
   ============================================================ */
const GATE_HASH = "3debfbef8c98fd9a8e9371ccfd02c08de4d9ff420ff7ed68d93bc068c5e114a7";

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function initGate() {
  const gate = document.getElementById("gate");
  const form = document.getElementById("gateForm");
  const input = document.getElementById("gatePassword");
  const error = document.getElementById("gateError");
  if (gate.classList.contains("is-unlocked")) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value.trim());
    if (hash === GATE_HASH) {
      localStorage.setItem("bridgekit_access", "granted");
      gate.classList.add("is-unlocked");
      error.classList.remove("is-visible");
    } else {
      error.classList.add("is-visible");
      input.value = "";
      input.focus();
    }
  });
}

/* ============================================================
   Theme
   ============================================================ */
function initTheme() {
  const toggle = document.getElementById("themeToggle");
  const root = document.documentElement;
  function effectiveTheme() {
    const attr = root.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  toggle.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("bridgekit_theme", next);
  });
}

/* ============================================================
   Tabs
   ============================================================ */
function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById("panel-" + btn.dataset.tab).classList.add("is-active");
    });
  });
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}

/* ============================================================
   Utility
   ============================================================ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function copyElementText(el, label) {
  const text = el.innerText.trim();
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => showToast((label || "Output") + " copied"))
    .catch(() => showToast("Couldn't copy — select and copy manually"));
}

/* ============================================================
   Saved searches (shared across all three tools)
   ============================================================ */
function loadSavedList(key) {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function persistSavedList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

function formatSavedDate(ts) {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function renderSavedList(containerId, list, emptyMessage, metaFor) {
  const container = document.getElementById(containerId);
  if (!list.length) {
    container.innerHTML = `<p class="output-empty">${emptyMessage}</p>`;
    return;
  }
  container.innerHTML = list
    .map(
      (item) => `<div class="saved-item" data-id="${item.id}">
        <div class="saved-item-info">
          <span class="saved-item-name">${escapeHtml(item.name)}</span>
          <span class="saved-item-meta">${escapeHtml(metaFor(item))} · ${escapeHtml(formatSavedDate(item.savedAt))}</span>
        </div>
        <div class="saved-item-actions">
          <button class="mini-btn" data-action="open" type="button">Open</button>
          <button class="mini-btn danger" data-action="delete" type="button">Delete</button>
        </div>
      </div>`
    )
    .join("");
}

function wireSavedListActions(containerId, onOpen, onDelete) {
  document.getElementById(containerId).addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest(".saved-item").dataset.id;
    if (btn.dataset.action === "open") onOpen(id);
    else if (btn.dataset.action === "delete") onDelete(id);
  });
}

/* ============================================================
   TOOL 1 — BridgeBlueprint
   ============================================================ */
const BP_AUTORESPONDERS = [
  { value: "aweber", label: "AWeber" },
  { value: "activecampaign", label: "ActiveCampaign" },
  { value: "getresponse", label: "GetResponse" },
  { value: "mailchimp", label: "Mailchimp" },
  { value: "convertkit", label: "ConvertKit / Kit" },
  { value: "gohighlevel", label: "GoHighLevel" },
  { value: "other-autoresponder", label: "Other autoresponder" },
];
const BP_SOURCES = [
  { value: "fb-leads", label: "Facebook / Instagram Lead Ads" },
  { value: "forms", label: "Forms (Contact Form 7, WPForms, Gravity Forms, etc.)" },
  { value: "webinar", label: "Zoom / webinar registrations" },
  { value: "calendly", label: "Calendly bookings" },
];
const BP_COMMERCE = [
  { value: "woocommerce", label: "WooCommerce" },
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "thrivecart", label: "ThriveCart" },
  { value: "jvzoo", label: "JVZoo" },
  { value: "warriorplus", label: "WarriorPlus" },
  { value: "clickbank", label: "ClickBank" },
];
const BP_TEAM = [
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
];
const BP_AFFILIATE_COMMERCE = new Set(["jvzoo", "warriorplus", "clickbank"]);

const BP_WEIGHTS = {
  "list-builder": { lead: 1, commerce: 2, webinar: 1, refund: 3, team: 4 },
  affiliate: { lead: 2, commerce: 1, webinar: 3, refund: 2, team: 4 },
  course: { lead: 2, commerce: 1, webinar: 1, refund: 2, team: 4 },
  ecommerce: { lead: 3, commerce: 1, webinar: 4, refund: 1, team: 3 },
  agency: { lead: 2, commerce: 2, webinar: 3, refund: 3, team: 1 },
};

const BP_WHY = {
  lead: {
    "list-builder": "Your highest-volume lead source — capture these before anything else.",
    affiliate: "Cold traffic needs to land on a list you own, not just a click you paid for.",
    course: "Every interested lead should hit your nurture sequence automatically.",
    ecommerce: "Worth capturing, but converting existing traffic into buyers matters more first.",
    agency: "Useful, but client-facing automations usually come first for an agency.",
  },
  commerce: {
    "list-builder": "Buyers are your best leads — capture them the moment they convert.",
    affiliate: "Every buyer needs to land on a list you own, tagged by product, before the next promo.",
    course: "Every student should be tagged and dropped into onboarding automatically.",
    ecommerce: "Every customer should be tagged and get thank-you/onboarding without you touching it.",
    agency: "Client purchases should trigger onboarding without manual work on your end.",
  },
  webinar: {
    "list-builder": "Webinar registrants convert best with fast, automatic follow-up.",
    affiliate: "Good for warming an audience, but lower priority than direct buyer capture.",
    course: "Webinars are usually your top-of-funnel for course sales — follow up fast.",
    ecommerce: "Lower priority unless webinars are a core part of your funnel.",
    agency: "Useful for lead-gen webinars, but rank client work higher.",
  },
  refund: {
    "list-builder": "Route refunds to a win-back sequence instead of losing the relationship.",
    affiliate: "Route refunds/cancellations to their own list — don't keep mailing them like a happy buyer.",
    course: "Catch refunds early and route to a win-back or feedback sequence.",
    ecommerce: "Refunds and chargebacks should never sit in your regular buyer flow.",
    agency: "Route client cancellations to your own internal review process.",
  },
  team: {
    "list-builder": "Nice to have once the higher-priority bridges are live.",
    affiliate: "Nice to have — a live sale ping keeps momentum during a promo.",
    course: "Nice to have for team coordination during a launch.",
    ecommerce: "Nice to have for order visibility, not essential to build first.",
    agency: "High priority — your team needs to know the moment a client takes action.",
  },
};

function bpRenderChecklist() {
  const container = document.getElementById("bpAppChecks");
  const groups = [
    ["Autoresponders", BP_AUTORESPONDERS, "ar"],
    ["Lead sources", BP_SOURCES, "src"],
    ["Commerce & payments", BP_COMMERCE, "com"],
    ["Team alerts", BP_TEAM, "team"],
  ];
  container.innerHTML = groups
    .map(([title, items, prefix]) => {
      const rows = items
        .map(
          (i) => `<label class="check-item"><input type="checkbox" data-group="${prefix}" value="${i.value}" /> ${escapeHtml(i.label)}</label>`
        )
        .join("");
      return `<div class="check-group-title">${escapeHtml(title)}</div>${rows}`;
    })
    .join("");
}

function bpGetChecked(group) {
  return Array.from(document.querySelectorAll(`#bpAppChecks input[data-group="${group}"]:checked`)).map((el) => el.value);
}

function bpLabelFor(list, value) {
  const found = list.find((i) => i.value === value);
  return found ? found.label : value;
}

function bpDestination(autoresponders) {
  return autoresponders.length ? bpLabelFor(BP_AUTORESPONDERS, autoresponders[0]) : "your autoresponder";
}

function bpGenerate() {
  const businessType = document.getElementById("bpBusinessType").value;
  const weights = BP_WEIGHTS[businessType];
  const autoresponders = bpGetChecked("ar");
  const sources = bpGetChecked("src");
  const commerce = bpGetChecked("com");
  const team = bpGetChecked("team");
  const dest = bpDestination(autoresponders);

  const bridges = [];

  sources.forEach((s) => {
    if (s === "webinar") return; // handled separately with its own weight
    const label = bpLabelFor(BP_SOURCES, s);
    const tag = s === "fb-leads" ? "fb-lead" : s === "forms" ? "form-lead" : "booked-call";
    const timing = s === "calendly" ? "instant" : "instant";
    bridges.push({
      priority: weights.lead,
      title: `${label} → ${dest}`,
      meta: `Tag: ${tag} · Timing: ${timing}`,
      why: BP_WHY.lead[businessType],
    });
  });

  if (sources.includes("webinar")) {
    bridges.push({
      priority: weights.webinar,
      title: `Zoom Webinar Registration → ${dest}`,
      meta: "Tag: webinar-reg · Timing: instant (delay follow-up 1–2 days post-webinar)",
      why: BP_WHY.webinar[businessType],
    });
  }

  commerce.forEach((c) => {
    const label = bpLabelFor(BP_COMMERCE, c);
    const tag = BP_AFFILIATE_COMMERCE.has(c) ? "buyer-{product}" : "customer-{product}";
    bridges.push({
      priority: weights.commerce,
      title: `${label} Sale → ${dest}`,
      meta: `Tag: ${tag}, mapped per product · Timing: instant`,
      why: BP_WHY.commerce[businessType],
    });
  });

  if (commerce.length) {
    bridges.push({
      priority: weights.refund,
      title: `Refund / Cancellation (${commerce.map((c) => bpLabelFor(BP_COMMERCE, c)).join(", ")}) → Win-back list`,
      meta: "Tag: refunded · Timing: instant",
      why: BP_WHY.refund[businessType],
    });
  }

  team.forEach((t) => {
    const label = bpLabelFor(BP_TEAM, t);
    const trigger = commerce.length ? "New Sale" : sources.length ? "New Lead" : "Activity";
    bridges.push({
      priority: weights.team,
      title: `${trigger} → ${label} notification`,
      meta: "Timing: instant",
      why: BP_WHY.team[businessType],
    });
  });

  bridges.sort((a, b) => a.priority - b.priority);

  const out = document.getElementById("bpOutput");
  if (!bridges.length) {
    out.innerHTML = `<p class="output-warning">Autoresponders alone don't generate bridges — they're the destination. Check at least one app under <strong>Lead sources</strong>, <strong>Commerce &amp; payments</strong>, or <strong>Team alerts</strong>, then generate again.</p>`;
    return;
  }
  let html = "";
  const tips = [];
  if (!autoresponders.length) {
    tips.push("check an autoresponder too so bridges name the exact destination app");
  }
  const triggerCategoriesUsed = [sources.length > 0, commerce.length > 0, team.length > 0].filter(Boolean).length;
  if (triggerCategoriesUsed <= 1) {
    tips.push("check a few more apps across Lead sources, Commerce &amp; payments, and Team alerts for a fuller build order");
  }
  if (tips.length) {
    html += `<p class="output-empty" style="margin-bottom:12px;">Tip: ${tips.join(", and ")}.</p>`;
  }
  html += bridges
    .map(
      (b, i) => `<div class="bridge-item">
        <div class="bridge-title"><span class="priority-chip">${i + 1}</span>${escapeHtml(b.title)}</div>
        <div class="bridge-meta">${escapeHtml(b.meta)}</div>
        <div class="bridge-meta">${escapeHtml(b.why)}</div>
      </div>`
    )
    .join("");
  out.innerHTML = html;

  localStorage.setItem(
    "bridgekit_bp_state",
    JSON.stringify({ businessType, autoresponders, sources, commerce, team })
  );
}

function bpApplyState(state) {
  document.getElementById("bpBusinessType").value = state.businessType || "list-builder";
  document.querySelectorAll("#bpAppChecks input[type=checkbox]").forEach((el) => {
    el.checked = false;
  });
  ["ar", "src", "com", "team"].forEach((prefix, idx) => {
    const arr = [state.autoresponders, state.sources, state.commerce, state.team][idx] || [];
    arr.forEach((v) => {
      const el = document.querySelector(`#bpAppChecks input[data-group="${prefix}"][value="${v}"]`);
      if (el) el.checked = true;
    });
  });
}

function bpRestore() {
  const raw = localStorage.getItem("bridgekit_bp_state");
  if (!raw) return;
  try {
    bpApplyState(JSON.parse(raw));
  } catch (e) {
    /* ignore malformed saved state */
  }
}

const BP_SAVED_KEY = "bridgekit_bp_saved";

function bpBusinessTypeLabel(value) {
  const opt = document.querySelector(`#bpBusinessType option[value="${value}"]`);
  return opt ? opt.textContent : value;
}

function bpRenderSavedList() {
  const list = loadSavedList(BP_SAVED_KEY);
  renderSavedList(
    "bpSavedList",
    list,
    "Nothing saved yet — generate a build order, then click Save to keep it here.",
    (item) => bpBusinessTypeLabel(item.businessType)
  );
}

function bpSaveCurrent() {
  const out = document.getElementById("bpOutput");
  if (!out.querySelector(".bridge-item")) {
    showToast("Generate a build order first");
    return;
  }
  const businessType = document.getElementById("bpBusinessType").value;
  const defaultName = bpBusinessTypeLabel(businessType) + " build order";
  const name = window.prompt("Name this build order:", defaultName);
  if (!name) return;
  const list = loadSavedList(BP_SAVED_KEY);
  list.unshift({
    id: String(Date.now()),
    name: name.trim().slice(0, 60) || defaultName,
    savedAt: Date.now(),
    businessType,
    autoresponders: bpGetChecked("ar"),
    sources: bpGetChecked("src"),
    commerce: bpGetChecked("com"),
    team: bpGetChecked("team"),
  });
  persistSavedList(BP_SAVED_KEY, list);
  bpRenderSavedList();
  showToast("Build order saved");
}

function bpOpenSaved(id) {
  const item = loadSavedList(BP_SAVED_KEY).find((i) => i.id === id);
  if (!item) return;
  bpApplyState(item);
  bpGenerate();
  showToast(`Loaded "${item.name}"`);
}

function bpDeleteSaved(id) {
  persistSavedList(BP_SAVED_KEY, loadSavedList(BP_SAVED_KEY).filter((i) => i.id !== id));
  bpRenderSavedList();
}

function initBridgeBlueprint() {
  bpRenderChecklist();
  bpRestore();
  bpRenderSavedList();
  document.getElementById("bpGenerate").addEventListener("click", bpGenerate);
  document.getElementById("bpCopy").addEventListener("click", () => copyElementText(document.getElementById("bpOutput"), "Build order"));
  document.getElementById("bpSave").addEventListener("click", bpSaveCurrent);
  wireSavedListActions("bpSavedList", bpOpenSaved, bpDeleteSaved);
}

/* ============================================================
   TOOL 2 — FollowUp Forge
   ============================================================ */
/* Three-email sequence built on PAS (Problem — Agitate — Solution),
   a proven direct-response structure: Day 2 names the problem, Day 5
   agitates the cost of leaving it unsolved, Day 14 closes with the
   solution and a reason to act now. */
const FF_TEMPLATES = {
  direct: [
    {
      day: "Day 2 · Problem",
      subject: "{offer} — {angle}",
      body:
        "Hey {first_name},\n\n" +
        "Let's be blunt: {offer} {angle}. If that's something you actually need, every day you put off fixing it is leads and revenue quietly leaking out of your business. The longer it sits, the more it costs.\n\n" +
        "Here's the fix, in plain terms:\n" +
        "- No extra monthly bill — {price}, paid once.\n" +
        "- Setup takes minutes, not a weekend project.\n" +
        "- Works with the tools you already use — nothing to migrate, nothing new to learn.\n\n" +
        "{offer} is {price}, one time:\n{link}\n\n" +
        "Grab it before it's back on your \"someday\" list.\n\n" +
        "[YOUR NAME]",
    },
    {
      day: "Day 5 · Agitate",
      subject: "Still putting this off?",
      body:
        "Hey {first_name},\n\n" +
        "Following up on {offer}, because this usually gets worse before it gets better.\n\n" +
        "Every week you wait is another week of manual work, missed follow-ups, or money handed to a tool you don't need — while {offer} sits there, ready to fix it: {angle}. It adds up fast; most people don't notice until they tally twelve months of it.\n\n" +
        "{offer} exists specifically to close that gap:\n" +
        "- Live the same day you set it up.\n" +
        "- One-time {price} instead of a recurring subscription.\n" +
        "- Built to work quietly in the background — you won't think about it again.\n\n" +
        "Here's the link if you're ready to stop the leak:\n{link}\n\n" +
        "[YOUR NAME]",
    },
    {
      day: "Day 14 · Solution",
      subject: "Closing this out — {offer}",
      body:
        "Hey {first_name},\n\n" +
        "Last note on {offer}, then I'll leave it alone.\n\n" +
        "If you still haven't dealt with this, nothing changes until you change it — that's the honest version. {offer} {angle}, at {price}, one time, no ongoing cost.\n\n" +
        "Quick recap of what you get:\n" +
        "- {offer} {angle} — permanently, not patched.\n" +
        "- No new monthly line item on your books.\n" +
        "- A five-minute setup standing between you and this being done.\n\n" +
        "Here's the link one more time:\n{link}\n\n" +
        "P.S. This is the last time {offer} shows up in your inbox from me — if this is worth fixing, now's the moment.\n\n" +
        "[YOUR NAME]",
    },
  ],
  story: [
    {
      day: "Day 2 · Problem",
      subject: "Why I almost skipped {offer}",
      body:
        "Hey {first_name},\n\n" +
        "I'll be honest — when I first ran into {offer}, I almost scrolled past it. I already had a workaround for the problem it solves, so it didn't feel urgent.\n\n" +
        "Then I actually sat down and did the math on what \"almost fine\" was costing me. {offer} {angle}, and that's not a minor annoyance — it was quietly draining time and money every single week, just slowly enough that I never noticed the total.\n\n" +
        "That's the part that changed my mind. {offer} doesn't patch the problem, it removes it:\n" +
        "- One payment of {price}, no subscription creeping back every month.\n" +
        "- Live in minutes, not another project for \"someday.\"\n" +
        "- Nothing to migrate, nothing new to learn.\n\n" +
        "If any of this sounds familiar, here's where I found it:\n{link}\n\n" +
        "[YOUR NAME]",
    },
    {
      day: "Day 5 · Agitate",
      subject: "What finally made me deal with it",
      body:
        "Hey {first_name},\n\n" +
        "Quick follow-up on {offer}, because I think the real story here isn't the tool — it's what waiting costs.\n\n" +
        "I let this sit unresolved for months because it never felt like \"today's problem.\" Then I tallied up what those months actually cost — in lost time, in leads that slipped through, in a subscription I kept paying \"just in case.\" It was more than I expected, by a lot.\n\n" +
        "{offer} is what finally closed that gap for me — it {angle}, and it did it without becoming one more thing I had to manage:\n" +
        "- {price}, paid once — not another line item forever.\n" +
        "- Genuinely simple enough that I had it running the same afternoon.\n" +
        "- Works with what I was already using, no rebuild required.\n\n" +
        "Here's the link, in case this is still sitting on your list too:\n{link}\n\n" +
        "[YOUR NAME]",
    },
    {
      day: "Day 14 · Solution",
      subject: "Last thing I'll say about {offer}",
      body:
        "Hey {first_name},\n\n" +
        "This is the last time I'll bring up {offer} — after this it's back to regular emails.\n\n" +
        "If this is still unsolved on your end, I get it, there's always something more urgent. But nothing about that changes until something actually changes it. {offer} was the thing that changed it for me — it {angle} — and it's still {price}, one time.\n\n" +
        "What you're actually getting:\n" +
        "- {offer} {angle}, for good.\n" +
        "- No new monthly cost added to your stack.\n" +
        "- A setup that takes less time than reading this email did.\n\n" +
        "Here's the link one more time:\n{link}\n\n" +
        "P.S. I'm not going to keep mentioning this one — if this has been sitting on your list, this is the natural stopping point to finally deal with it.\n\n" +
        "[YOUR NAME]",
    },
  ],
};

function ffFill(str, vars) {
  return str.replace(/\{(\w+)\}/g, (m, key) => (key === "first_name" ? "{first_name}" : vars[key] || m));
}

function ffGenerate() {
  const offer = document.getElementById("ffOffer").value.trim();
  const price = document.getElementById("ffPrice").value.trim();
  const angle = document.getElementById("ffAngle").value.trim();
  const link = document.getElementById("ffLink").value.trim() || "[YOUR AFFILIATE LINK]";
  const tone = document.querySelector("#ffTone .seg-btn.is-active").dataset.tone;

  const out = document.getElementById("ffOutput");
  if (!offer || !price || !angle) {
    out.innerHTML = `<p class="output-empty">Fill in offer name, price, and angle, then generate.</p>`;
    return;
  }

  const vars = { offer, price, angle, link };
  const emails = FF_TEMPLATES[tone];
  out.innerHTML = emails
    .map(
      (e) => `<div class="email-block">
        <div class="email-day">${escapeHtml(e.day)}</div>
        <div class="email-subject">Subject: ${escapeHtml(ffFill(e.subject, vars))}</div>
        <div class="email-body">${escapeHtml(ffFill(e.body, vars))}</div>
      </div>`
    )
    .join("");

  localStorage.setItem("bridgekit_ff_state", JSON.stringify({ offer, price, angle, link, tone }));
}

function ffApplyState(s) {
  document.getElementById("ffOffer").value = s.offer || "";
  document.getElementById("ffPrice").value = s.price || "";
  document.getElementById("ffAngle").value = s.angle || "";
  document.getElementById("ffLink").value = s.link || "";
  const tone = s.tone || "direct";
  document.querySelectorAll("#ffTone .seg-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.tone === tone);
  });
}

function ffRestore() {
  const raw = localStorage.getItem("bridgekit_ff_state");
  if (!raw) return;
  try {
    ffApplyState(JSON.parse(raw));
  } catch (e) {
    /* ignore malformed saved state */
  }
}

const FF_SAVED_KEY = "bridgekit_ff_saved";
const FF_TONE_LABEL = { direct: "Direct", story: "Story-driven" };

function ffRenderSavedList() {
  const list = loadSavedList(FF_SAVED_KEY);
  renderSavedList(
    "ffSavedList",
    list,
    "Nothing saved yet — generate a sequence, then click Save to keep it here.",
    (item) => FF_TONE_LABEL[item.tone] || item.tone
  );
}

function ffSaveCurrent() {
  const out = document.getElementById("ffOutput");
  if (!out.querySelector(".email-block")) {
    showToast("Generate a sequence first");
    return;
  }
  const offer = document.getElementById("ffOffer").value.trim();
  const tone = document.querySelector("#ffTone .seg-btn.is-active").dataset.tone;
  const defaultName = offer + " (" + FF_TONE_LABEL[tone] + ")";
  const name = window.prompt("Name this sequence:", defaultName);
  if (!name) return;
  const list = loadSavedList(FF_SAVED_KEY);
  list.unshift({
    id: String(Date.now()),
    name: name.trim().slice(0, 60) || defaultName,
    savedAt: Date.now(),
    offer,
    price: document.getElementById("ffPrice").value.trim(),
    angle: document.getElementById("ffAngle").value.trim(),
    link: document.getElementById("ffLink").value.trim(),
    tone,
  });
  persistSavedList(FF_SAVED_KEY, list);
  ffRenderSavedList();
  showToast("Sequence saved");
}

function ffOpenSaved(id) {
  const item = loadSavedList(FF_SAVED_KEY).find((i) => i.id === id);
  if (!item) return;
  ffApplyState(item);
  ffGenerate();
  showToast(`Loaded "${item.name}"`);
}

function ffDeleteSaved(id) {
  persistSavedList(FF_SAVED_KEY, loadSavedList(FF_SAVED_KEY).filter((i) => i.id !== id));
  ffRenderSavedList();
}

function initFollowUpForge() {
  ffRestore();
  ffRenderSavedList();
  document.querySelectorAll("#ffTone .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#ffTone .seg-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });
  document.getElementById("ffGenerate").addEventListener("click", ffGenerate);
  document.getElementById("ffCopy").addEventListener("click", () => copyElementText(document.getElementById("ffOutput"), "Sequence"));
  document.getElementById("ffSave").addEventListener("click", ffSaveCurrent);
  wireSavedListActions("ffSavedList", ffOpenSaved, ffDeleteSaved);
}

/* ============================================================
   TOOL 3 — LeakCalc
   ============================================================ */
function lcNum(id) {
  const raw = document.getElementById(id).value.trim();
  const n = parseFloat(raw);
  return isNaN(n) || n < 0 ? 0 : n;
}

function lcMoney(n) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function lcCalculate() {
  const leads = lcNum("lcLeads");
  const dropoff = lcNum("lcDropoff");
  const value = lcNum("lcValue");
  const zapierCost = lcNum("lcZapierCost");

  const out = document.getElementById("lcOutput");
  if (!leads || !dropoff || !value) {
    out.innerHTML = `<p class="output-empty">Enter your monthly leads, drop-off %, and subscriber value, then calculate.</p>`;
    return;
  }

  const lostPerMonth = leads * (dropoff / 100);
  const lostPerYear = lostPerMonth * 12;
  const annualValueLost = lostPerYear * value * 12;
  const zapier5yr = zapierCost * 12 * 5;
  const wpSyncLow = 47;
  const wpSyncHigh = 147;
  const savingsLow = Math.max(0, zapier5yr - wpSyncHigh);
  const savingsHigh = Math.max(0, zapier5yr - wpSyncLow);

  let html = `<div class="stat-row">
      <div class="stat-tile"><div class="stat-value">${Math.round(lostPerMonth)}</div><div class="stat-label">Leads lost / month</div></div>
      <div class="stat-tile"><div class="stat-value">${Math.round(lostPerYear)}</div><div class="stat-label">Leads lost / year</div></div>
      <div class="stat-tile"><div class="stat-value">${lcMoney(annualValueLost)}</div><div class="stat-label">Est. value at risk / year</div></div>
    </div>
    <p>At ${dropoff}% drop-off on ${leads} monthly leads, you're losing roughly <strong>${Math.round(lostPerMonth)} leads a month</strong> — about <strong>${Math.round(lostPerYear)}</strong> over a year. At ${lcMoney(value)}/month in subscriber value each, that's an estimated <strong>${lcMoney(annualValueLost)}</strong> in value never captured.</p>`;

  if (zapierCost > 0) {
    html += `<div class="stat-row" style="margin-top:6px;">
      <div class="stat-tile"><div class="stat-value">${lcMoney(zapier5yr)}</div><div class="stat-label">Zapier/Make/Pabbly, 5 years</div></div>
      <div class="stat-tile"><div class="stat-value">${lcMoney(wpSyncLow)}–${lcMoney(wpSyncHigh)}</div><div class="stat-label">WP Sync, once</div></div>
      <div class="stat-tile"><div class="stat-value">${lcMoney(savingsLow)}–${lcMoney(savingsHigh)}</div><div class="stat-label">Est. 5-year savings</div></div>
    </div>
    <p>At ${lcMoney(zapierCost)}/month, your current automation tool costs about <strong>${lcMoney(zapier5yr)}</strong> over 5 years. WP Sync is a one-time ${lcMoney(wpSyncLow)}–${lcMoney(wpSyncHigh)}, so switching saves an estimated <strong>${lcMoney(savingsLow)}–${lcMoney(savingsHigh)}</strong> over the same period.</p>`;
  } else {
    html += `<p>You're not currently paying for Zapier, Make, or Pabbly — but the leads above are still slipping through without automation. WP Sync is a one-time ${lcMoney(wpSyncLow)}–${lcMoney(wpSyncHigh)}.</p>`;
  }

  html += `<p style="color:var(--ink-soft); font-size:12px;">These are illustrations based on the numbers you entered, not a guarantee of results.</p>`;

  out.innerHTML = html;
  localStorage.setItem("bridgekit_lc_state", JSON.stringify({ leads, dropoff, value, zapierCost }));
}

function lcApplyState(s) {
  if (s.leads) document.getElementById("lcLeads").value = s.leads;
  if (s.dropoff) document.getElementById("lcDropoff").value = s.dropoff;
  if (s.value) document.getElementById("lcValue").value = s.value;
  if (s.zapierCost) document.getElementById("lcZapierCost").value = s.zapierCost;
}

function lcRestore() {
  const raw = localStorage.getItem("bridgekit_lc_state");
  if (!raw) return;
  try {
    lcApplyState(JSON.parse(raw));
  } catch (e) {
    /* ignore malformed saved state */
  }
}

const LC_SAVED_KEY = "bridgekit_lc_saved";

function lcRenderSavedList() {
  const list = loadSavedList(LC_SAVED_KEY);
  renderSavedList(
    "lcSavedList",
    list,
    "Nothing saved yet — run a calculation, then click Save to keep it here.",
    (item) => `${item.leads} leads/mo`
  );
}

function lcSaveCurrent() {
  const out = document.getElementById("lcOutput");
  if (!out.querySelector(".stat-tile")) {
    showToast("Run a calculation first");
    return;
  }
  const leads = document.getElementById("lcLeads").value.trim();
  const defaultName = leads + " leads/mo scenario";
  const name = window.prompt("Name this calculation:", defaultName);
  if (!name) return;
  const list = loadSavedList(LC_SAVED_KEY);
  list.unshift({
    id: String(Date.now()),
    name: name.trim().slice(0, 60) || defaultName,
    savedAt: Date.now(),
    leads,
    dropoff: document.getElementById("lcDropoff").value.trim(),
    value: document.getElementById("lcValue").value.trim(),
    zapierCost: document.getElementById("lcZapierCost").value.trim(),
  });
  persistSavedList(LC_SAVED_KEY, list);
  lcRenderSavedList();
  showToast("Calculation saved");
}

function lcOpenSaved(id) {
  const item = loadSavedList(LC_SAVED_KEY).find((i) => i.id === id);
  if (!item) return;
  lcApplyState(item);
  lcCalculate();
  showToast(`Loaded "${item.name}"`);
}

function lcDeleteSaved(id) {
  persistSavedList(LC_SAVED_KEY, loadSavedList(LC_SAVED_KEY).filter((i) => i.id !== id));
  lcRenderSavedList();
}

function initLeakCalc() {
  lcRestore();
  lcRenderSavedList();
  document.getElementById("lcCalculate").addEventListener("click", lcCalculate);
  document.getElementById("lcCopy").addEventListener("click", () => copyElementText(document.getElementById("lcOutput"), "Numbers"));
  document.getElementById("lcSave").addEventListener("click", lcSaveCurrent);
  wireSavedListActions("lcSavedList", lcOpenSaved, lcDeleteSaved);
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initGate();
  initTheme();
  initTabs();
  initBridgeBlueprint();
  initFollowUpForge();
  initLeakCalc();
});
