/**
 * Phase 5 — ElevenLabs voiceover generation, one clip per script beat.
 * Reads API key from ELEVENLABS_API_KEY env var (never hardcoded/committed).
 * RUN: ELEVENLABS_API_KEY=... node generate_voiceover.js
 * OUTPUT: audio/beat-0X.mp3
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "UgBBYS2sOqTuMpoF3BR0"; // Mark
const OUTPUT_DIR = path.join(__dirname, "..", "audio");

if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY not set");
  process.exit(1);
}

const BEATS = [
  {
    name: "beat-00-hook",
    text: "WP Sync promises to connect the apps you already use — leads, sales, webinars — into one automatic flow. But moving the data is only half the job. WP Sync doesn't tell you which bridge to build first, what to actually send once a lead lands in your list, or what waiting on either one is costing you. That's the gap BridgeKit fills.",
  },
  {
    name: "beat-01-what-this-is",
    text: "BridgeKit is a free bonus toolkit — three tools, no account, no server, nothing to install. Everything runs right in your browser.",
  },
  {
    name: "beat-02-gate-unlock",
    text: "It's password-protected for now — bonus buyers get the password at checkout. Type it in, and you're in.",
  },
  {
    name: "beat-03-how-to-use",
    text: "The How to Use tab lays out the order: BridgeBlueprint first, to decide what to build. FollowUp Forge next, to write what you send once it's built. And LeakCalc, to see what waiting is costing you.",
  },
  {
    name: "beat-04-bridgeblueprint",
    text: "Start with BridgeBlueprint. Pick your business type — say, affiliate marketer — then check the apps you actually run: ConvertKit as your autoresponder, Facebook and Instagram lead ads, WarriorPlus for sales, Slack for team alerts. Click Generate build order, and BridgeBlueprint ranks the bridges for you — WarriorPlus sales first, since a buyer is worth capturing before anything else, then Facebook leads, a refund route to a win-back list, and a Slack alert for new sales, last. Every bridge comes with a plain-English reason attached, so you're not guessing why one ranks above another — and because it's built off your actual business type and your actual app stack, you're not getting generic advice, you're getting your build order. That's the difference between staring at WP Sync wondering where to start, and knowing exactly what to set up first, second, and third.",
  },
  {
    name: "beat-05-followup-forge",
    text: "Next, FollowUp Forge — the part WP Sync doesn't write for you. Fill in the offer name, WP Sync; price, $47; one-line angle, kills your $50 a month Zapier bill. Pick a tone — Direct, or Story-driven if you'd rather lead with a narrative — and click Generate sequence. Three emails, ready to paste into your autoresponder: Day 2 names the problem, Day 5 makes the cost of waiting concrete, Day 14 closes the sale. You don't need to be a copywriter — this is a proven Problem-Agitate-Solution structure doing the persuasion work for you, personalized to your offer, your price, and your angle. The bridge gets the lead into your list the instant it happens; FollowUp Forge is what turns that instant delivery into an instant follow-up — so no lead sits in your list without ever hearing from you again.",
  },
  {
    name: "beat-06-leakcalc",
    text: "Last, LeakCalc. Enter 100 monthly leads, a 40% drop-off, $2 a month in subscriber value, and a $49 a month tool you're already paying for. Click Calculate. LeakCalc turns that into real numbers — leads lost per month, per year, and the dollar value at risk. And if you're paying for Zapier, Make, or Pabbly, it lines that cost up against WP Sync's one-time price, five years out. In this example: nearly $2,900 saved by switching. These aren't generic industry averages — they're built from your own numbers, so the case for automating today instead of someday is one you can see, save, and even show a partner or a skeptical spouse. It's the number that turns 'I should get to that' into 'I'm losing money every month I don't.'",
  },
  {
    name: "beat-07-how-it-fits",
    text: "None of this competes with WP Sync — it's the piece that picks up right where WP Sync leaves off. WP Sync builds the bridge and moves the data. BridgeKit tells you which bridge to build first, writes what goes down that bridge, and shows you what it's worth. Together, that's the difference between having the plumbing installed and actually turning on the water.",
  },
  {
    name: "beat-08-close",
    text: "BridgeKit comes free with WP Sync — no account, no extra cost, just three tools that turn 'we moved your data' into 'here's exactly what to do with it.' Grab your copy from the bonus page, unlock it with the password included at checkout, and start with BridgeBlueprint.",
  },
];

async function generate(beat) {
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: beat.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${beat.name}: HTTP ${resp.status} — ${errText.slice(0, 300)}`);
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  const outPath = path.join(OUTPUT_DIR, `${beat.name}.mp3`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${beat.name}.mp3 (${buf.length} bytes)`);
}

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const beat of BEATS) {
    await generate(beat);
  }
  console.log("Done.");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
