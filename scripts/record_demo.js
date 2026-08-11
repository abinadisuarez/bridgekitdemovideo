/**
 * BridgeKit demo video — screen recording (Playwright).
 * Adapted from demo-video-builder's record_demo.js template against the
 * approved shot list in planning/script-and-shotlist.md (Beats 1-8; Beat 0
 * is the WP Sync screenshot, handled separately in ffmpeg assembly).
 *
 * RUN: node record_demo.js
 * OUTPUT: one .webm per beat in ./recordings/<beat-name>/*.webm
 */

const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const path = require("path");

const BASE_URL = "http://localhost:8420/"; // local mirror of https://bridgekit.misanmorrison.com/ — Chromium can't reach the live domain from this sandbox, see site-mirror/
const GATE_PASSWORD = "BridgeKit2026!";
const OUTPUT_DIR = path.join(__dirname, "..", "recordings");
const VIEWPORT = { width: 1920, height: 1080 };
const TYPE_DELAY = 55; // ms between keystrokes, so typing is visible on screen

async function unlockSilently(page) {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.setItem("bridgekit_access", "granted"));
  await page.reload();
  await page.waitForSelector("#gate.is-unlocked", { state: "attached" });
}

const BEATS = [
  {
    // Beat 1 — "What this is": load the site, gate visible and locked.
    name: "01-gate-locked",
    actions: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
    },
    holdMs: 2500,
  },
  {
    // Beat 2 — Gate unlock: type the password on screen, click Unlock.
    name: "02-gate-unlock",
    actions: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
      await page.click("#gatePassword");
      await page.type("#gatePassword", GATE_PASSWORD, { delay: TYPE_DELAY });
      await page.waitForTimeout(400);
      await page.click("#gateForm button[type=submit]");
      await page.waitForSelector("#gate.is-unlocked", { state: "attached" });
    },
    holdMs: 1500,
  },
  {
    // Beat 3 — How to Use tab tour (default active tab after unlock).
    name: "03-how-to-use",
    actions: async (page) => {
      await unlockSilently(page);
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
    // Beat 4 — BridgeBlueprint: affiliate marketer + ConvertKit/Kit, FB/IG
    // Lead Ads, WarriorPlus, Slack -> Generate build order.
    name: "04-bridgeblueprint",
    actions: async (page) => {
      await unlockSilently(page);
      await page.click('.tab-btn[data-tab="blueprint"]');
      await page.waitForTimeout(400);
      await page.selectOption("#bpBusinessType", "affiliate");
      await page.waitForTimeout(400);
      await page.check('#bpAppChecks input[data-group="ar"][value="convertkit"]');
      await page.waitForTimeout(300);
      await page.check('#bpAppChecks input[data-group="src"][value="fb-leads"]');
      await page.waitForTimeout(300);
      await page.check('#bpAppChecks input[data-group="com"][value="warriorplus"]');
      await page.waitForTimeout(300);
      await page.check('#bpAppChecks input[data-group="team"][value="slack"]');
      await page.waitForTimeout(500);
      await page.click("#bpGenerate");
      await page.waitForSelector("#bpOutput .bridge-item");
      await page.locator("#bpOutput").scrollIntoViewIfNeeded();
    },
    holdMs: 3500,
  },
  {
    // Beat 5 — FollowUp Forge: WP Sync / $47 / angle -> Generate sequence.
    name: "05-followup-forge",
    actions: async (page) => {
      await unlockSilently(page);
      await page.click('.tab-btn[data-tab="followup"]');
      await page.waitForTimeout(400);
      await page.click("#ffOffer");
      await page.type("#ffOffer", "WP Sync", { delay: TYPE_DELAY });
      await page.click("#ffPrice");
      await page.type("#ffPrice", "$47", { delay: TYPE_DELAY });
      await page.click("#ffAngle");
      await page.type("#ffAngle", "kills your $50/mo Zapier bill", { delay: TYPE_DELAY });
      await page.waitForTimeout(400);
      await page.hover('#ffTone .seg-btn[data-tone="story"]');
      await page.waitForTimeout(600);
      await page.click("#ffGenerate");
      await page.waitForSelector("#ffOutput .email-block");
      await page.locator("#ffOutput").scrollIntoViewIfNeeded();
    },
    holdMs: 4000,
  },
  {
    // Beat 6 — LeakCalc: 100 leads / 40% drop-off / $2 value / $49 Zapier cost.
    name: "06-leakcalc",
    actions: async (page) => {
      await unlockSilently(page);
      await page.click('.tab-btn[data-tab="leakcalc"]');
      await page.waitForTimeout(400);
      await page.click("#lcLeads");
      await page.type("#lcLeads", "100", { delay: TYPE_DELAY });
      await page.click("#lcDropoff");
      await page.type("#lcDropoff", "40", { delay: TYPE_DELAY });
      await page.click("#lcValue");
      await page.type("#lcValue", "2", { delay: TYPE_DELAY });
      await page.click("#lcZapierCost");
      await page.type("#lcZapierCost", "49", { delay: TYPE_DELAY });
      await page.waitForTimeout(400);
      await page.click("#lcCalculate");
      await page.waitForSelector("#lcOutput .stat-tile");
      await page.locator("#lcOutput").scrollIntoViewIfNeeded();
    },
    holdMs: 3500,
  },
  {
    // Beat 7 — How it fits: back to How to Use tab, scroll past all 3 tools.
    name: "07-how-it-fits",
    actions: async (page) => {
      await unlockSilently(page);
      await page.click('.tab-btn[data-tab="guide"]');
      await page.waitForTimeout(500);
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
    // Beat 8 — Close: fresh (locked) gate as the final frame, no unlock.
    name: "08-close-gate",
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
    const page = await context.newPage();
    await beat.actions(page);
    await page.waitForTimeout(beat.holdMs);
    await context.close(); // video only finalizes to disk on context close
    console.log(`Recorded beat: ${beat.name}`);
  }

  await browser.close();
  console.log(`Done. Recordings in ${OUTPUT_DIR}/<beat-name>/*.webm`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
