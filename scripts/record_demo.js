/**
 * BridgeKit demo video — screen recording (Playwright), per-segment isolated.
 *
 * Every beat's approved narration is split into clause-level segments, each
 * paired 1:1 with the specific on-screen action it describes. EACH SEGMENT
 * IS RECORDED IN ITS OWN FRESH BROWSER CONTEXT — not cut out of one long
 * continuous recording. This was a hard-learned fix: headless Chromium's
 * screencast-based video recorder is not guaranteed real-time, and under
 * sustained DOM churn (many clicks, dropdown open/close, repeated style
 * updates) it measurably falls behind wall-clock — verified by extracting
 * exact frame numbers and comparing against Date.now()-logged timestamps,
 * the drift compounded to 1-2+ seconds by the middle of a 9-segment beat.
 * A single continuous recording cut by timestamp cannot be trusted to stay
 * in sync. Recording each segment as its own short, fresh context sidesteps
 * the problem entirely (frame 0 = context creation, negligible lag over a
 * few seconds) at the cost of more browser churn.
 *
 * Because each segment starts from a fresh page load, any segment whose
 * action leaves persistent state on screen (a checked box, a filled field,
 * a generated output) declares a `replay` function — a fast, unanimated
 * re-application of that same state, run silently at the start of every
 * later segment in the same beat so the accumulated progress is still
 * visible, before that segment's own animated action begins.
 *
 * Cursor: plain arrow (40x54, black fill / white outline), anchored at the
 * tip like a native OS pointer. Click feedback: a brief press/scale on the
 * cursor plus an expanding colored ring at the click point, synced with the
 * click-sound mix in Phase 6. Every beat with a cursor silently jumps it to
 * screen-center right after injecting it, before the first real glide, so
 * it never visibly travels in from a corner.
 *
 * Dropdowns: native <select> popups aren't reliably captured by Chromium's
 * headless recordVideo, so a styled overlay list (white rows, selected item
 * highlighted solid purple) is rendered before the cursor "clicks" the
 * target option.
 *
 * RUN: node record_demo.js [ONLY_BEATS=01-x,02-y env var to filter]
 * OUTPUT: recordings/<beat-name>/manifest.json (segment texts, in order)
 *         recordings/<beat-name>/segNN/*.webm + clicks.json
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
      position: fixed; top: -100px; left: -100px; width: 40px; height: 54px;
      background: url('${CURSOR_SVG}') no-repeat center / 100% 100%;
      pointer-events: none; z-index: 2147483647;
      transition: transform 110ms ease-out;
    }
    #__fake-cursor.__pressed { transform: scale(0.5); }
    #__click-ring {
      position: fixed; width: 16px; height: 16px; margin-left: -8px; margin-top: -8px;
      border-radius: 50%; border: 3px solid #4636E3;
      background: rgba(70, 54, 227, 0.16);
      pointer-events: none; z-index: 2147483646;
      opacity: 0; transform: scale(0.4);
    }
    #__click-ring.__firing {
      animation: __ring-pop 420ms cubic-bezier(.2,.8,.2,1) forwards;
    }
    @keyframes __ring-pop {
      0%   { opacity: 0.9; transform: scale(0.4); }
      60%  { opacity: 0.7; }
      100% { opacity: 0; transform: scale(2.6); }
    }
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
  const ring = document.createElement('div');
  ring.id = '__click-ring';
  document.body.appendChild(ring);
  document.addEventListener('mousemove', (e) => {
    cur.style.left = e.clientX + 'px';
    cur.style.top = e.clientY + 'px';
  }, true);
  window.__fireRing = (x, y) => {
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    ring.classList.remove('__firing');
    void ring.offsetWidth; // restart the CSS animation
    ring.classList.add('__firing');
  };
  window.__suppressEffects = false;
  document.addEventListener('mousedown', (e) => {
    cur.classList.add('__pressed');
    if (!window.__suppressEffects) window.__fireRing(e.clientX, e.clientY);
  }, true);
  document.addEventListener('mouseup', () => cur.classList.remove('__pressed'), true);
  window.__pressCursor = (x, y) => {
    cur.classList.add('__pressed');
    setTimeout(() => cur.classList.remove('__pressed'), 180);
    if (typeof x === 'number') window.__fireRing(x, y);
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

// Smoothly pans to an element only if it's actually out of view (a no-op
// otherwise) — every scroll in this recorder used to be an instant snap
// (scrollIntoViewIfNeeded, scrollTo with no behavior), which is what made
// the whole video read as a series of jump-cuts instead of a real screen
// recording. This animates like a real trackpad/mouse-wheel scroll would.
async function smoothScrollIntoView(page, selector, index) {
  const scrolled = await page.evaluate(
    ([sel, idx]) => {
      const el = idx == null ? document.querySelector(sel) : document.querySelectorAll(sel)[idx];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= window.innerHeight;
      if (!inView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return !inView;
    },
    [selector, index === undefined ? null : index]
  );
  if (scrolled) await page.waitForTimeout(650);
}

async function smoothScrollToTop(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(650);
}

async function moveTo(page, selector) {
  const loc = page.locator(selector);
  await smoothScrollIntoView(page, selector);
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
// be captured on screen before this segment's context closes.
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
  await smoothScrollIntoView(page, selector);
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

// Each beat: `setup` runs at the start of EVERY segment's fresh page (not
// once) — navigation/unlock/cursor-init. `segments` run one per fresh
// context; each one's `text` is exactly a clause of the approved script,
// its `action` the on-screen step that clause describes. `replay` (when
// present) is a fast, unanimated re-application of the state that action
// leaves behind, run silently at the top of every later segment in the same
// beat so accumulated progress is still visible on screen.
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
    },
    segments: [
      {
        text: "It's password-protected for now — bonus buyers get the password at checkout.",
        action: async (page, ctx) => typeAnimated(page, "#gatePassword", GATE_PASSWORD, ctx),
        replay: async (page) => page.fill("#gatePassword", GATE_PASSWORD),
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
    },
    segments: [
      {
        text: "Start with BridgeBlueprint.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="blueprint"]', ctx),
        replay: async (page) => page.click('.tab-btn[data-tab="blueprint"]'),
      },
      {
        text: "Pick your business type — say, affiliate marketer —",
        action: async (page, ctx) => selectAnimated(page, "#bpBusinessType", "affiliate", ctx),
        replay: async (page) => page.selectOption("#bpBusinessType", "affiliate"),
      },
      {
        text: "then check the apps you actually run: ConvertKit as your autoresponder,",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="ar"][value="convertkit"]', ctx),
        replay: async (page) => page.check('#bpAppChecks input[data-group="ar"][value="convertkit"]'),
      },
      {
        text: "Facebook and Instagram lead ads,",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="src"][value="fb-leads"]', ctx),
        replay: async (page) => page.check('#bpAppChecks input[data-group="src"][value="fb-leads"]'),
      },
      {
        text: "WarriorPlus for sales,",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="com"][value="warriorplus"]', ctx),
        replay: async (page) => page.check('#bpAppChecks input[data-group="com"][value="warriorplus"]'),
      },
      {
        text: "Slack for team alerts.",
        action: async (page, ctx) => clickAnimated(page, '#bpAppChecks input[data-group="team"][value="slack"]', ctx),
        replay: async (page) => page.check('#bpAppChecks input[data-group="team"][value="slack"]'),
      },
      {
        text:
          "Click Generate build order, and BridgeBlueprint ranks the bridges for you — WarriorPlus sales first, since a buyer is worth capturing before anything else, then Facebook leads, a refund route to a win-back list, and a Slack alert for new sales, last.",
        action: async (page, ctx) => {
          await clickAnimated(page, "#bpGenerate", ctx);
          await page.waitForSelector("#bpOutput .bridge-item");
          // Checking boxes further down the list scrolled the page down —
          // pan back to the top so the "Your build order" panel and its
          // header are visible, not just wherever the last checkbox was.
          await smoothScrollToTop(page);
          await hold(page, 600);
        },
        replay: async (page) => {
          // Replay is silent/off-camera (state restore before this
          // segment's own visible action) — instant here is correct, the
          // explicit scroll-position restore right after replay handles
          // what's actually shown on screen.
          await page.click("#bpGenerate");
          await page.waitForSelector("#bpOutput .bridge-item");
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        },
      },
      {
        text:
          "Every bridge comes with a plain-English reason attached, so you're not guessing why one ranks above another — and because it's built off your actual business type and your actual app stack, you're not getting generic advice, you're getting your build order.",
        action: async (page) => {
          const count = await page.locator("#bpOutput .bridge-item").count();
          await smoothScrollIntoView(page, "#bpOutput .bridge-item", Math.min(1, count - 1));
          await hold(page, 500);
          await smoothScrollIntoView(page, "#bpOutput .bridge-item", count - 1);
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
    },
    segments: [
      {
        text: "Next, FollowUp Forge — the part WP Sync doesn't write for you.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="followup"]', ctx),
        replay: async (page) => page.click('.tab-btn[data-tab="followup"]'),
      },
      {
        text: "Fill in the offer name, WP Sync;",
        action: async (page, ctx) => typeAnimated(page, "#ffOffer", "WP Sync", ctx),
        replay: async (page) => page.fill("#ffOffer", "WP Sync"),
      },
      {
        text: "price, $47;",
        action: async (page, ctx) => typeAnimated(page, "#ffPrice", "$47", ctx),
        replay: async (page) => page.fill("#ffPrice", "$47"),
      },
      {
        text: "one-line angle, kills your $50 a month Zapier bill.",
        action: async (page, ctx) => typeAnimated(page, "#ffAngle", "kills your $50/mo Zapier bill", ctx),
        replay: async (page) => page.fill("#ffAngle", "kills your $50/mo Zapier bill"),
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
          await smoothScrollIntoView(page, "#ffOutput .email-block", 0);
          await hold(page, 500);
        },
        replay: async (page) => {
          await page.click("#ffGenerate");
          await page.waitForSelector("#ffOutput .email-block");
        },
      },
      {
        text:
          "Three emails, ready to paste into your autoresponder: Day 2 names the problem, Day 5 makes the cost of waiting concrete, Day 14 closes the sale.",
        action: async (page) => {
          await smoothScrollIntoView(page, "#ffOutput .email-block", 1);
          await hold(page, 500);
          await smoothScrollIntoView(page, "#ffOutput .email-block", 2);
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
    },
    segments: [
      {
        text: "Last, LeakCalc.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="leakcalc"]', ctx),
        replay: async (page) => page.click('.tab-btn[data-tab="leakcalc"]'),
      },
      {
        text: "Enter 100 monthly leads,",
        action: async (page, ctx) => typeAnimated(page, "#lcLeads", "100", ctx),
        replay: async (page) => page.fill("#lcLeads", "100"),
      },
      {
        text: "a 40% drop-off,",
        action: async (page, ctx) => typeAnimated(page, "#lcDropoff", "40", ctx),
        replay: async (page) => page.fill("#lcDropoff", "40"),
      },
      {
        text: "$2 a month in subscriber value,",
        action: async (page, ctx) => typeAnimated(page, "#lcValue", "2", ctx),
        replay: async (page) => page.fill("#lcValue", "2"),
      },
      {
        text: "and a $49 a month tool you're already paying for.",
        action: async (page, ctx) => typeAnimated(page, "#lcZapierCost", "49", ctx),
        replay: async (page) => page.fill("#lcZapierCost", "49"),
      },
      {
        text: "Click Calculate.",
        action: async (page, ctx) => {
          await clickAnimated(page, "#lcCalculate", ctx);
          await page.waitForSelector("#lcOutput .stat-tile");
          await hold(page, 500);
        },
        replay: async (page) => {
          await page.click("#lcCalculate");
          await page.waitForSelector("#lcOutput .stat-tile");
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
          const count = await page.locator("#lcOutput .stat-tile").count();
          await smoothScrollIntoView(page, "#lcOutput .stat-tile", count - 1);
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
    },
    segments: [
      {
        text: "None of this competes with WP Sync — it's the piece that picks up right where WP Sync leaves off.",
        action: async (page, ctx) => clickAnimated(page, '.tab-btn[data-tab="guide"]', ctx),
        replay: async (page) => page.click('.tab-btn[data-tab="guide"]'),
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
    fs.mkdirSync(beatDir, { recursive: true });
    const manifest = [];
    const replaysSoFar = [];
    // Every segment is its own fresh page (see file header for why), which
    // means scroll position and cursor position both reset by default —
    // concatenating segments hard-cut then showed a jarring jump every time
    // (page snapping back to a different scroll spot, cursor popping back
    // to center) instead of a continuous recording. Carrying these two
    // forward and silently restoring them after each new segment's setup
    // (before its own animated action starts) fixes that.
    let lastScrollY = null;
    let lastCursorPos = null;

    for (let i = 0; i < beat.segments.length; i++) {
      const seg = beat.segments[i];
      const segDir = path.join(beatDir, `seg${String(i + 1).padStart(2, "0")}`);

      const beatStart = Date.now();
      const context = await browser.newContext({
        viewport: VIEWPORT,
        recordVideo: { dir: segDir, size: VIEWPORT },
      });
      const page = await context.newPage();
      const ctx = { beatStart, clicks: [] };

      await beat.setup(page, ctx);
      if (beat.cursor && replaysSoFar.length) {
        await page.evaluate(() => {
          window.__suppressEffects = true;
        });
      }
      for (const replay of replaysSoFar) {
        await replay(page);
      }
      if (beat.cursor && replaysSoFar.length) {
        await page.evaluate(() => {
          window.__suppressEffects = false;
        });
      }

      if (i === 0) {
        if (beat.cursor) await centerCursor(page);
      } else {
        if (lastScrollY !== null) {
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), lastScrollY);
        }
        if (beat.cursor && lastCursorPos) {
          await page.mouse.move(lastCursorPos.x, lastCursorPos.y);
        }
        await page.waitForTimeout(150);
      }

      // recordVideo captures from context creation onward — setup + replay
      // above are NOT actually invisible, they're just fast; with several
      // chained replay steps (each with Playwright's own actionability
      // waits) that "fast" can still be a real 1-3s of visible-on-camera
      // navigation/clicking before this segment's own action even starts.
      // Mark the boundary and trim everything before it out in assembly.
      const visibleStart = round((Date.now() - beatStart) / 1000);

      await seg.action(page, ctx);
      await page.waitForTimeout(300);

      lastScrollY = await page.evaluate(() => window.scrollY);
      if (beat.cursor) {
        lastCursorPos = await page.evaluate(() => {
          const c = document.getElementById("__fake-cursor");
          if (!c) return null;
          return { x: parseFloat(c.style.left) || 0, y: parseFloat(c.style.top) || 0 };
        });
      }

      await context.close(); // video only finalizes to disk on context close

      fs.writeFileSync(
        path.join(segDir, "clicks.json"),
        JSON.stringify({ visibleStart, clicks: ctx.clicks })
      );
      manifest.push({ index: i + 1, text: seg.text, dir: `seg${String(i + 1).padStart(2, "0")}` });
      if (seg.replay) replaysSoFar.push(seg.replay);
      console.log(`  ${beat.name} seg${String(i + 1).padStart(2, "0")}: ${ctx.clicks.length} click(s)`);
    }

    fs.writeFileSync(path.join(beatDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log(`Recorded beat: ${beat.name} — ${manifest.length} segments`);
  }

  await browser.close();
  console.log(`Done. Recordings in ${OUTPUT_DIR}/<beat-name>/manifest.json + segNN/*.webm + clicks.json`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
