/**
 * BridgeKit demo video — screen recording (Playwright), with a rendered
 * standard-arrow cursor (real mouse events drive it, anchored at the tip
 * like a native OS pointer) that does a brief press/scale on click, and a
 * per-beat clicks.json log (seconds from beat start) so Phase 6 assembly
 * can mix a click sound into the audio at the exact right moments. Matches
 * the cursor style used in the prior Landed demo video (plain arrow, no
 * ripple graphic — click feedback is the cursor press + the app's own
 * native UI state change, e.g. tab highlighting).
 *
 * RUN: node record_demo.js
 * OUTPUT: recordings/<beat-name>/*.webm + recordings/<beat-name>/clicks.json
 */

const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:8420/"; // local mirror — see site-mirror/
const GATE_PASSWORD = "BridgeKit2026!";
const OUTPUT_DIR = path.join(__dirname, "..", "recordings");
const VIEWPORT = { width: 1920, height: 1080 };
const TYPE_DELAY = 55;

// Standard arrow pointer (matches a native OS cursor's look and hotspot —
// anchored at the tip, top-left, not centered like a custom-shaped marker).
// A brief scale-down "press" on the arrow itself on mousedown is the only
// click feedback beyond the app's own native UI state change (tab
// highlighting, checkbox toggling, etc.) — no separate ripple graphic.
const CURSOR_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<path d="M4 2 L4 20 L9 15.2 L12.4 21.6 L15.1 20.2 L11.6 14 L18 14 Z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>' +
      "</svg>"
  );

const CURSOR_INIT = `
(() => {
  if (window.__cursorInit) return;
  window.__cursorInit = true;
  const style = document.createElement('style');
  style.textContent = \`
    #__fake-cursor {
      position: fixed; top: -50px; left: -50px; width: 24px; height: 24px;
      background: url('${CURSOR_SVG}') no-repeat center / contain;
      pointer-events: none; z-index: 2147483647;
      transition: transform 90ms ease-out;
    }
    #__fake-cursor.__pressed { transform: scale(0.85); }
  \`;
  document.head.appendChild(style);
  const cur = document.createElement('div');
  cur.id = '__fake-cursor';
  document.body.appendChild(cur);
  document.addEventListener('mousemove', (e) => {
    cur.style.left = e.clientX + 'px';
    cur.style.top = e.clientY + 'px';
  }, true);
  document.addEventListener('mousedown', () => cur.classList.add('__pressed'), true);
  document.addEventListener('mouseup', () => cur.classList.remove('__pressed'), true);
  // selectOption() below doesn't dispatch a real mousedown/mouseup (native
  // <select> can't be driven by raw mouse events headless) — this gives the
  // cursor the same brief press look for consistency.
  window.__pressCursor = () => {
    cur.classList.add('__pressed');
    setTimeout(() => cur.classList.remove('__pressed'), 120);
  };
})();
`;

async function initCursor(page) {
  await page.evaluate(CURSOR_INIT);
}

async function moveTo(page, selector) {
  const loc = page.locator(selector);
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 25 });
  await page.waitForTimeout(150);
  return { x, y };
}

// Real mouse down/up at the element's center — fires the page's
// mousedown/mouseup listeners (cursor press animation) and performs the
// actual click.
async function clickAnimated(page, selector, ctx) {
  const { x, y } = await moveTo(page, selector);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  ctx.clicks.push(round((Date.now() - ctx.beatStart) / 1000));
  await page.waitForTimeout(200);
}

// Native <select> can't be driven by raw mouse events reliably headless —
// use selectOption() but still move the cursor there and fire the ripple
// manually so the click reads the same on screen.
async function selectAnimated(page, selector, value, ctx) {
  const { x, y } = await moveTo(page, selector);
  await page.selectOption(selector, value);
  await page.evaluate(() => window.__pressCursor());
  ctx.clicks.push(round((Date.now() - ctx.beatStart) / 1000));
  await page.waitForTimeout(200);
}

async function typeAnimated(page, selector, text, ctx) {
  const { x, y } = await moveTo(page, selector);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  ctx.clicks.push(round((Date.now() - ctx.beatStart) / 1000));
  await page.waitForTimeout(150);
  await page.type(selector, text, { delay: TYPE_DELAY });
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

async function unlockSilently(page, withCursor) {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.setItem("bridgekit_access", "granted"));
  await page.reload();
  await page.waitForSelector("#gate.is-unlocked", { state: "attached" });
  if (withCursor) await initCursor(page);
}

const BEATS = [
  {
    name: "01-gate-locked",
    cursor: false,
    actions: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
    },
    holdMs: 2500,
  },
  {
    name: "02-gate-unlock",
    cursor: true,
    actions: async (page, ctx) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
      await initCursor(page);
      await typeAnimated(page, "#gatePassword", GATE_PASSWORD, ctx);
      await page.waitForTimeout(300);
      await clickAnimated(page, "#gateForm button[type=submit]", ctx);
      await page.waitForSelector("#gate.is-unlocked", { state: "attached" });
    },
    holdMs: 1500,
  },
  {
    name: "03-how-to-use",
    cursor: false,
    actions: async (page) => {
      await unlockSilently(page, false);
      const guide = page.locator("#panel-guide");
      await guide.locator(".guide-section").nth(1).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await guide.locator(".guide-section").nth(2).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await guide.locator(".guide-section").nth(3).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
    },
    holdMs: 1500,
  },
  {
    name: "04-bridgeblueprint",
    cursor: true,
    actions: async (page, ctx) => {
      await unlockSilently(page, true);
      await clickAnimated(page, '.tab-btn[data-tab="blueprint"]', ctx);
      await selectAnimated(page, "#bpBusinessType", "affiliate", ctx);
      await clickAnimated(page, '#bpAppChecks input[data-group="ar"][value="convertkit"]', ctx);
      await clickAnimated(page, '#bpAppChecks input[data-group="src"][value="fb-leads"]', ctx);
      await clickAnimated(page, '#bpAppChecks input[data-group="com"][value="warriorplus"]', ctx);
      await clickAnimated(page, '#bpAppChecks input[data-group="team"][value="slack"]', ctx);
      await page.waitForTimeout(300);
      await clickAnimated(page, "#bpGenerate", ctx);
      await page.waitForSelector("#bpOutput .bridge-item");
      await page.locator("#bpOutput").scrollIntoViewIfNeeded();
    },
    holdMs: 3500,
  },
  {
    name: "05-followup-forge",
    cursor: true,
    actions: async (page, ctx) => {
      await unlockSilently(page, true);
      await clickAnimated(page, '.tab-btn[data-tab="followup"]', ctx);
      await typeAnimated(page, "#ffOffer", "WP Sync", ctx);
      await typeAnimated(page, "#ffPrice", "$47", ctx);
      await typeAnimated(page, "#ffAngle", "kills your $50/mo Zapier bill", ctx);
      await moveTo(page, '#ffTone .seg-btn[data-tone="story"]');
      await page.waitForTimeout(500);
      await clickAnimated(page, "#ffGenerate", ctx);
      await page.waitForSelector("#ffOutput .email-block");
      await page.locator("#ffOutput").scrollIntoViewIfNeeded();
    },
    holdMs: 4000,
  },
  {
    name: "06-leakcalc",
    cursor: true,
    actions: async (page, ctx) => {
      await unlockSilently(page, true);
      await clickAnimated(page, '.tab-btn[data-tab="leakcalc"]', ctx);
      await typeAnimated(page, "#lcLeads", "100", ctx);
      await typeAnimated(page, "#lcDropoff", "40", ctx);
      await typeAnimated(page, "#lcValue", "2", ctx);
      await typeAnimated(page, "#lcZapierCost", "49", ctx);
      await page.waitForTimeout(300);
      await clickAnimated(page, "#lcCalculate", ctx);
      await page.waitForSelector("#lcOutput .stat-tile");
      await page.locator("#lcOutput").scrollIntoViewIfNeeded();
    },
    holdMs: 3500,
  },
  {
    name: "07-how-it-fits",
    cursor: true,
    actions: async (page, ctx) => {
      await unlockSilently(page, true);
      await clickAnimated(page, '.tab-btn[data-tab="guide"]', ctx);
      const guide = page.locator("#panel-guide");
      await guide.locator(".guide-section").nth(1).scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await guide.locator(".guide-section").nth(2).scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await guide.locator(".guide-section").nth(3).scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await guide.locator(".guide-note").scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
    },
    holdMs: 1500,
  },
  {
    name: "08-close-gate",
    cursor: false,
    actions: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
    },
    holdMs: 3000,
  },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

  for (const beat of BEATS) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: path.join(OUTPUT_DIR, beat.name), size: VIEWPORT },
    });
    const beatStart = Date.now();
    const page = await context.newPage();
    const ctx = { beatStart, clicks: [] };
    await beat.actions(page, ctx);
    await page.waitForTimeout(beat.holdMs);
    await context.close(); // video only finalizes to disk on context close

    const beatDir = path.join(OUTPUT_DIR, beat.name);
    fs.writeFileSync(path.join(beatDir, "clicks.json"), JSON.stringify(ctx.clicks));
    console.log(`Recorded beat: ${beat.name} (clicks: ${JSON.stringify(ctx.clicks)})`);
  }

  await browser.close();
  console.log(`Done. Recordings in ${OUTPUT_DIR}/<beat-name>/*.webm + clicks.json`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
