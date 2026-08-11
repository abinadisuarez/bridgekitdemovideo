/**
 * BridgeKit demo video — screen recording (Playwright), segment-level.
 *
 * Every beat's approved narration is split into clause-level segments, each
 * paired 1:1 with the specific on-screen action it describes. The recorder
 * logs a timestamp after every segment's action completes (segments.json),
 * which Phase 6 assembly uses to cut the beat's single continuous recording
 * into per-segment clips and pad each one to its own matched voiceover clip
 * — so narration and action stay synced at every step, not just at the
 * start/end of a whole beat. clicks.json (subset of those same moments, the
 * ones that are real clicks) drives the click-sound mix.
 *
 * Cursor: plain arrow (28x38, black fill / white outline), anchored at the
 * tip like a native OS pointer, brief press/scale on click — matches the
 * style used in the reference Landed demo video. Every beat with a cursor
 * silently jumps it to screen-center right after injecting it, before the
 * first real glide, so it never visibly travels in from a corner.
 *
 * Dropdowns: native <select> popups aren't reliably captured by Chromium's
 * headless recordVideo, so a styled overlay list (matching the reference:
 * white rows, selected item highlighted solid purple) is rendered before
 * the cursor "clicks" the target option.
 *
 * RUN: node record_demo.js
 * OUTPUT: recordings/<beat-name>/*.webm + segments.json + clicks.json
 */

const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:8420/"; // local mirror — see site-mirror/
const GATE_PASSWORD = "BridgeKit2026!";
const OUTPUT_DIR = path.join(__dirname, "..", "recordings");
const VIEWPORT = { width: 1920, height: 1080 };
const TYPE_DELAY = 55;

const CURSOR_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<path d="M4 2 L4 20 L9 15.2 L12.4 21.6 L15.1 20.2 L11.6 14 L18 14 Z" fill="#000" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>' +
      "</svg>"
  );

const PAGE_INIT = `
(() => {
  if (window.__cursorInit) return;
  window.__cursorInit = true;
  const style = document.createElement('style');
  style.textContent = \`
    #__fake-cursor {
      position: fixed; top: -80px; left: -80px; width: 28px; height: 38px;
      background: url('${CURSOR_SVG}') no-repeat center / 100% 100%;
      pointer-events: none; z-index: 2147483647;
      transition: transform 110ms ease-out;
    }
    #__fake-cursor.__pressed { transform: scale(0.5); }
    #__fake-dropdown {
      position: fixed; background: #fff; border: 1px solid #d9d9e3;
      border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
      z-index: 2147483646; overflow: hidden;
    }
    #__fake-dropdown .__opt { padding: 9px 12px; }
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
  window.__pressCursor = () => {
    cur.classList.add('__pressed');
    setTimeout(() => cur.classList.remove('__pressed'), 180);
  };

  window.__openDropdown = (selector) => {
    const select = document.querySelector(selector);
    const rect = select.getBoundingClientRect();
    const cs = getComputedStyle(select);
    const list = document.createElement('div');
    list.id = '__fake-dropdown';
    list.style.left = rect.left + 'px';
    list.style.top = (rect.bottom + 3) + 'px';
    list.style.width = rect.width + 'px';
    list.style.font = cs.font;
    Array.from(select.options).forEach((opt) => {
      const row = document.createElement('div');
      row.className = '__opt';
      row.textContent = opt.textContent;
      row.dataset.value = opt.value;
      const selected = opt.value === select.value;
      row.style.background = selected ? '#4636E3' : '#fff';
      row.style.color = selected ? '#fff' : '#16161d';
      list.appendChild(row);
    });
    document.body.appendChild(list);
  };
  window.__highlightDropdownOption = (value) => {
    const list = document.getElementById('__fake-dropdown');
    if (!list) return null;
    let targetRect = null;
    Array.from(list.children).forEach((row) => {
      const match = row.dataset.value === value;
      row.style.background = match ? '#4636E3' : '#fff';
      row.style.color = match ? '#fff' : '#16161d';
      if (match) targetRect = row.getBoundingClientRect();
    });
    if (!targetRect) return null;
    return { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
  };
  window.__closeDropdown = () => {
    const list = document.getElementById('__fake-dropdown');
    if (list) list.remove();
  };
})();
`;

async function initCursor(page) {
  await page.evaluate(PAGE_INIT);
}

// Jump the (invisible-until-first-event) cursor to screen center in one
// instant, unanimated move — so the first *visible* glide starts from the
// middle of the screen, never from the top-left corner where Playwright's
// virtual mouse begins by default.
async function centerCursor(page) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
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

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function logClick(ctx) {
  ctx.clicks.push(round((Date.now() - ctx.beatStart) / 1000));
}

// Post-click settle time is deliberately generous (350ms) — the site's own
// CSS transitions (checkbox fill, tab pill color) need to fully finish and
// be captured on screen before the segment boundary is logged, or a
// freeze-frame pad in assembly can land mid-transition and freeze on a
// half-colored state.
const CLICK_SETTLE_MS = 350;

async function clickAnimated(page, selector, ctx) {
  await moveTo(page, selector);
  await page.mouse.down();
  await page.waitForTimeout(110);
  await page.mouse.up();
  logClick(ctx);
  await page.waitForTimeout(CLICK_SETTLE_MS);
}

async function typeAnimated(page, selector, text, ctx) {
  await moveTo(page, selector);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
  logClick(ctx);
  await page.waitForTimeout(250);
  await page.type(selector, text, { delay: TYPE_DELAY });
}

// Shows a rendered dropdown list (native <select> popups aren't reliably
// captured headless), glides the cursor down onto the target option, clicks
// it, then applies the real value and closes the overlay.
async function selectAnimated(page, selector, value, ctx) {
  await moveTo(page, selector);
  await page.mouse.down();
  await page.waitForTimeout(110);
  await page.mouse.up();
  logClick(ctx);
  await page.evaluate((sel) => window.__openDropdown(sel), selector);
  await page.waitForTimeout(550); // dropdown visibly open before anything is picked
  const optPos = await page.evaluate((val) => window.__highlightDropdownOption(val), value);
  if (optPos) {
    await page.mouse.move(optPos.x, optPos.y, { steps: 12 });
    await page.waitForTimeout(250);
  }
  await page.mouse.down();
  await page.waitForTimeout(110);
  await page.mouse.up();
  logClick(ctx);
  await page.evaluate(() => window.__closeDropdown());
  await page.selectOption(selector, value);
  await page.waitForTimeout(CLICK_SETTLE_MS);
}

async function scrollToAnimated(page, selector, ms) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(ms || 300);
}

async function hold(page, ms) {
  await page.waitForTimeout(ms);
}

async function unlockPage(page) {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.setItem("bridgekit_access", "granted"));
  await page.reload();
  await page.waitForSelector("#gate.is-unlocked", { state: "attached" });
}

// Each beat: `setup` runs once (navigation/unlock/cursor-init, not tied to
// any narration segment), then `segments` run in order — each one's `text`
// is exactly a clause of the approved script, its `action` the on-screen
// step that clause describes. A timestamp is logged after every segment.
const BEATS = [
  {
    name: "01-gate-locked",
    cursor: false,
    setup: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
    },
    segments: [
      {
        text: "BridgeKit is a free bonus toolkit — three tools, no account, no server, nothing to install. Everything runs right in your browser.",
        action: async (page) => hold(page, 400),
      },
    ],
  },
  {
    name: "02-gate-unlock",
    cursor: true,
    setup: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
      await initCursor(page);
      await centerCursor(page);
    },
    segments: [
      {
        text: "It's password-protected for now — bonus buyers get the password at checkout.",
        action: async (page, ctx) => typeAnimated(page, "#gatePassword", GATE_PASSWORD, ctx),
      },
      {
        text: "Type it in, and you're in.",
        action: async (page, ctx) => {
          await clickAnimated(page, "#gateForm button[type=submit]", ctx);
          await page.waitForSelector("#gate.is-unlocked", { state: "attached" });
        },
      },
    ],
  },
  {
    name: "03-how-to-use",
    cursor: false,
    setup: async (page) => {
      await unlockPage(page);
    },
    segments: [
      {
        text: "The How to Use tab lays out the order: BridgeBlueprint first, to decide what to build.",
        action: async (page) => scrollToAnimated(page, "#panel-guide .guide-section:nth-of-type(2)", 700),
      },
      {
        text: "FollowUp Forge next, to write what you send once it's built.",
        action: async (page) => scrollToAnimated(page, "#panel-guide .guide-section:nth-of-type(3)", 700),
      },
      {
        text: "And LeakCalc, to see what waiting is costing you.",
        action: async (page) => scrollToAnimated(page, "#panel-guide .guide-section:nth-of-type(4)", 700),
      },
    ],
  },
  {
    name: "04-bridgeblueprint",
    cursor: true,
    setup: async (page) => {
      await unlockPage(page);
      await initCursor(page);
      await centerCursor(page);
    },
    segments: [
      {
        text: "Start with BridgeBlueprint.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="blueprint"]', ctx),
      },
      {
        text: "Pick your business type — say, affiliate marketer —",
        action: async (page, ctx) => selectAnimated(page, "#bpBusinessType", "affiliate", ctx),
      },
      {
        text: "then check the apps you actually run: ConvertKit as your autoresponder,",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="ar"][value="convertkit"]', ctx),
      },
      {
        text: "Facebook and Instagram lead ads,",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="src"][value="fb-leads"]', ctx),
      },
      {
        text: "WarriorPlus for sales,",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="com"][value="warriorplus"]', ctx),
      },
      {
        text: "Slack for team alerts.",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="team"][value="slack"]', ctx),
      },
      {
        text:
          "Click Generate build order, and BridgeBlueprint ranks the bridges for you — WarriorPlus sales first, since a buyer is worth capturing before anything else, then Facebook leads, a refund route to a win-back list, and a Slack alert for new sales, last.",
        action: async (page, ctx) => {
          await clickAnimated(page, "#bpGenerate", ctx);
          await page.waitForSelector("#bpOutput .bridge-item");
          await page.locator("#bpOutput .bridge-item").first().scrollIntoViewIfNeeded();
          await hold(page, 600);
        },
      },
      {
        text:
          "Every bridge comes with a plain-English reason attached, so you're not guessing why one ranks above another — and because it's built off your actual business type and your actual app stack, you're not getting generic advice, you're getting your build order.",
        action: async (page) => {
          const items = page.locator("#bpOutput .bridge-item");
          const count = await items.count();
          await items.nth(Math.min(1, count - 1)).scrollIntoViewIfNeeded();
          await hold(page, 500);
          await items.nth(count - 1).scrollIntoViewIfNeeded();
          await hold(page, 400);
        },
      },
      {
        text:
          "That's the difference between staring at WP Sync wondering where to start, and knowing exactly what to set up first, second, and third.",
        action: async (page) => hold(page, 500),
      },
    ],
  },
  {
    name: "05-followup-forge",
    cursor: true,
    setup: async (page) => {
      await unlockPage(page);
      await initCursor(page);
      await centerCursor(page);
    },
    segments: [
      {
        text: "Next, FollowUp Forge — the part WP Sync doesn't write for you.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="followup"]', ctx),
      },
      {
        text: "Fill in the offer name, WP Sync;",
        action: async (page, ctx) => typeAnimated(page, "#ffOffer", "WP Sync", ctx),
      },
      {
        text: "price, $47;",
        action: async (page, ctx) => typeAnimated(page, "#ffPrice", "$47", ctx),
      },
      {
        text: "one-line angle, kills your $50 a month Zapier bill.",
        action: async (page, ctx) => typeAnimated(page, "#ffAngle", "kills your $50/mo Zapier bill", ctx),
      },
      {
        text: "Pick a tone — Direct, or Story-driven if you'd rather lead with a narrative —",
        action: async (page) => {
          await moveTo(page, '#ffTone .seg-btn[data-tone="story"]');
          await hold(page, 400);
        },
      },
      {
        text: "and click Generate sequence.",
        action: async (page, ctx) => {
          await clickAnimated(page, "#ffGenerate", ctx);
          await page.waitForSelector("#ffOutput .email-block");
          await page.locator("#ffOutput .email-block").first().scrollIntoViewIfNeeded();
          await hold(page, 500);
        },
      },
      {
        text:
          "Three emails, ready to paste into your autoresponder: Day 2 names the problem, Day 5 makes the cost of waiting concrete, Day 14 closes the sale.",
        action: async (page) => {
          const blocks = page.locator("#ffOutput .email-block");
          await blocks.nth(1).scrollIntoViewIfNeeded();
          await hold(page, 500);
          await blocks.nth(2).scrollIntoViewIfNeeded();
          await hold(page, 400);
        },
      },
      {
        text:
          "You don't need to be a copywriter — this is a proven Problem-Agitate-Solution structure doing the persuasion work for you, personalized to your offer, your price, and your angle.",
        action: async (page) => hold(page, 500),
      },
      {
        text:
          "The bridge gets the lead into your list the instant it happens; FollowUp Forge is what turns that instant delivery into an instant follow-up — so no lead sits in your list without ever hearing from you again.",
        action: async (page) => hold(page, 500),
      },
    ],
  },
  {
    name: "06-leakcalc",
    cursor: true,
    setup: async (page) => {
      await unlockPage(page);
      await initCursor(page);
      await centerCursor(page);
    },
    segments: [
      {
        text: "Last, LeakCalc.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="leakcalc"]', ctx),
      },
      {
        text: "Enter 100 monthly leads,",
        action: async (page, ctx) => typeAnimated(page, "#lcLeads", "100", ctx),
      },
      {
        text: "a 40% drop-off,",
        action: async (page, ctx) => typeAnimated(page, "#lcDropoff", "40", ctx),
      },
      {
        text: "$2 a month in subscriber value,",
        action: async (page, ctx) => typeAnimated(page, "#lcValue", "2", ctx),
      },
      {
        text: "and a $49 a month tool you're already paying for.",
        action: async (page, ctx) => typeAnimated(page, "#lcZapierCost", "49", ctx),
      },
      {
        text: "Click Calculate.",
        action: async (page, ctx) => {
          await clickAnimated(page, "#lcCalculate", ctx);
          await page.waitForSelector("#lcOutput .stat-tile");
          await hold(page, 500);
        },
      },
      {
        text: "LeakCalc turns that into real numbers — leads lost per month, per year, and the dollar value at risk.",
        action: async (page) => hold(page, 500),
      },
      {
        text:
          "And if you're paying for Zapier, Make, or Pabbly, it lines that cost up against WP Sync's one-time price, five years out. In this example: nearly $2,900 saved by switching.",
        action: async (page) => {
          const tiles = page.locator("#lcOutput .stat-tile");
          const count = await tiles.count();
          await tiles.nth(count - 1).scrollIntoViewIfNeeded();
          await hold(page, 600);
        },
      },
      {
        text:
          "These aren't generic industry averages — they're built from your own numbers, so the case for automating today instead of someday is one you can see, save, and even show a partner or a skeptical spouse.",
        action: async (page) => hold(page, 500),
      },
      {
        text: "It's the number that turns 'I should get to that' into 'I'm losing money every month I don't.'",
        action: async (page) => hold(page, 500),
      },
    ],
  },
  {
    name: "07-how-it-fits",
    cursor: true,
    setup: async (page) => {
      await unlockPage(page);
      await initCursor(page);
      await centerCursor(page);
    },
    segments: [
      {
        text: "None of this competes with WP Sync — it's the piece that picks up right where WP Sync leaves off.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="guide"]', ctx),
      },
      {
        text: "WP Sync builds the bridge and moves the data.",
        action: async (page) => scrollToAnimated(page, "#panel-guide .guide-section:nth-of-type(2)", 500),
      },
      {
        text: "BridgeKit tells you which bridge to build first, writes what goes down that bridge, and shows you what it's worth.",
        action: async (page) => {
          await scrollToAnimated(page, "#panel-guide .guide-section:nth-of-type(3)", 400);
          await scrollToAnimated(page, "#panel-guide .guide-section:nth-of-type(4)", 400);
        },
      },
      {
        text: "Together, that's the difference between having the plumbing installed and actually turning on the water.",
        action: async (page) => scrollToAnimated(page, "#panel-guide .guide-note", 500),
      },
    ],
  },
  {
    name: "08-close-gate",
    cursor: false,
    setup: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector("#gatePassword");
    },
    segments: [
      {
        text:
          "BridgeKit comes free with WP Sync — no account, no extra cost, just three tools that turn 'we moved your data' into 'here's exactly what to do with it.' Grab your copy from the bonus page, unlock it with the password included at checkout, and start with BridgeBlueprint.",
        action: async (page) => hold(page, 400),
      },
    ],
  },
];

(async () => {
  const only = (process.env.ONLY_BEATS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const beatsToRun = only.length ? BEATS.filter((b) => only.includes(b.name)) : BEATS;

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

  for (const beat of beatsToRun) {
    const beatDir = path.join(OUTPUT_DIR, beat.name);
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: beatDir, size: VIEWPORT },
    });
    const beatStart = Date.now();
    const page = await context.newPage();
    const ctx = { beatStart, clicks: [] };

    await beat.setup(page, ctx);

    const segmentsLog = [];
    for (const seg of beat.segments) {
      await seg.action(page, ctx);
      segmentsLog.push({ text: seg.text, tEnd: round((Date.now() - beatStart) / 1000) });
    }
    await page.waitForTimeout(400);

    await context.close(); // video only finalizes to disk on context close

    fs.mkdirSync(beatDir, { recursive: true });
    fs.writeFileSync(path.join(beatDir, "segments.json"), JSON.stringify(segmentsLog, null, 2));
    fs.writeFileSync(path.join(beatDir, "clicks.json"), JSON.stringify(ctx.clicks));
    console.log(`Recorded beat: ${beat.name} — ${segmentsLog.length} segments, ${ctx.clicks.length} clicks`);
  }

  await browser.close();
  console.log(`Done. Recordings in ${OUTPUT_DIR}/<beat-name>/*.webm + segments.json + clicks.json`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
