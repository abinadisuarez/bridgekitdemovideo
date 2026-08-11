/**
 * Phase 5 (segment-level) — one ElevenLabs TTS clip per narration segment,
 * read from each beat's recordings/<beat>/segments.json (written by
 * record_demo.js). Also generates the Beat 0 hook clip separately since it
 * has no recorded video/segments file.
 *
 * RUN: ELEVENLABS_API_KEY=... NODE_USE_ENV_PROXY=1 node generate_segment_voiceover.js [beatName ...]
 * OUTPUT: audio/segments/<beat>/seg-XX.mp3 (+ audio/beat-00-hook.mp3)
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "UgBBYS2sOqTuMpoF3BR0"; // Mark
const RECORDINGS_DIR = path.join(__dirname, "..", "recordings");
const AUDIO_DIR = path.join(__dirname, "..", "audio");

if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY not set");
  process.exit(1);
}

const BEAT0_TEXT =
  "WP Sync promises to connect the apps you already use — leads, sales, webinars — into one automatic flow. But moving the data is only half the job. WP Sync doesn't tell you which bridge to build first, what to actually send once a lead lands in your list, or what waiting on either one is costing you. That's the gap BridgeKit fills.";

async function ttsToFile(text, outPath) {
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`HTTP ${resp.status} — ${errText.slice(0, 300)}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${outPath} (${buf.length} bytes)`);
}

(async () => {
  const beatFilter = process.argv.slice(2);
  const allBeats = fs
    .readdirSync(RECORDINGS_DIR)
    .filter((d) => fs.existsSync(path.join(RECORDINGS_DIR, d, "segments.json")));
  const beats = beatFilter.length ? allBeats.filter((b) => beatFilter.includes(b)) : allBeats;

  if (!beatFilter.length || beatFilter.includes("00-hook")) {
    await ttsToFile(BEAT0_TEXT, path.join(AUDIO_DIR, "beat-00-hook.mp3"));
  }

  for (const beat of beats) {
    const segments = JSON.parse(fs.readFileSync(path.join(RECORDINGS_DIR, beat, "segments.json")));
    for (let i = 0; i < segments.length; i++) {
      const outPath = path.join(AUDIO_DIR, "segments", beat, `seg-${String(i + 1).padStart(2, "0")}.mp3`);
      await ttsToFile(segments[i].text, outPath);
    }
  }

  console.log("Done.");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
