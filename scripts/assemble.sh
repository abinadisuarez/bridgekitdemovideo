#!/usr/bin/env bash
# Phase 6 — assembly. Pads each beat's video to match its voiceover
# (freeze last frame), mutes/mux, then concatenates all 9 beats into
# one final MP4. See planning/script-and-shotlist.md for the beat map.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p build audio/with-clicks
FPS=25
W=1920
H=1080

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

# --- Mix synthesized click sound into each beat's voiceover at logged timestamps ---
declare -A REC_FOR_CLICKS=(
  [01]="recordings/01-gate-locked"
  [02]="recordings/02-gate-unlock"
  [03]="recordings/03-how-to-use"
  [04]="recordings/04-bridgeblueprint"
  [05]="recordings/05-followup-forge"
  [06]="recordings/06-leakcalc"
  [07]="recordings/07-how-it-fits"
  [08]="recordings/08-close-gate"
)
declare -A AUD_RAW=(
  [01]="audio/beat-01-what-this-is.mp3"
  [02]="audio/beat-02-gate-unlock.mp3"
  [03]="audio/beat-03-how-to-use.mp3"
  [04]="audio/beat-04-bridgeblueprint.mp3"
  [05]="audio/beat-05-followup-forge.mp3"
  [06]="audio/beat-06-leakcalc.mp3"
  [07]="audio/beat-07-how-it-fits.mp3"
  [08]="audio/beat-08-close.mp3"
)
for n in 01 02 03 04 05 06 07 08; do
  clicks_json="${REC_FOR_CLICKS[$n]}/clicks.json"
  raw="${AUD_RAW[$n]}"
  out="audio/with-clicks/beat-${n}.mp3"
  python3 scripts/mix_clicks.py "$raw" "$clicks_json" assets/click.wav "$out"
  echo "clicks mixed: beat${n} <- $(python3 -c "import json; print(len(json.load(open('$clicks_json'))))") click(s)"
done

# --- Beat 0: static WP Sync screenshot, slow zoom, matched to its VO ---
AUD0_DUR=$(dur audio/beat-00-hook.mp3)
FRAMES=$(python3 -c "print(int(round($AUD0_DUR * $FPS)))")
ffmpeg -y -v error -loop 1 -i assets/wpsync-hero.png -t "$AUD0_DUR" \
  -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(zoom+0.0012,1.18)':d=${FRAMES}:s=${W}x${H}:fps=${FPS}" \
  -r "$FPS" -c:v libx264 -pix_fmt yuv420p -an build/beat00_video.mp4
ffmpeg -y -v error -i build/beat00_video.mp4 -i audio/beat-00-hook.mp3 \
  -c:v copy -c:a aac -shortest build/beat00_final.mp4
echo "beat00 done: $(dur build/beat00_final.mp4)s"

# --- Beats 1-8: recorded webm padded (freeze last frame) to match VO ---
declare -A REC=(
  [01]="recordings/01-gate-locked"
  [02]="recordings/02-gate-unlock"
  [03]="recordings/03-how-to-use"
  [04]="recordings/04-bridgeblueprint"
  [05]="recordings/05-followup-forge"
  [06]="recordings/06-leakcalc"
  [07]="recordings/07-how-it-fits"
  [08]="recordings/08-close-gate"
)
declare -A AUD=(
  [01]="audio/beat-01-what-this-is.mp3"
  [02]="audio/beat-02-gate-unlock.mp3"
  [03]="audio/beat-03-how-to-use.mp3"
  [04]="audio/beat-04-bridgeblueprint.mp3"
  [05]="audio/beat-05-followup-forge.mp3"
  [06]="audio/beat-06-leakcalc.mp3"
  [07]="audio/beat-07-how-it-fits.mp3"
  [08]="audio/beat-08-close.mp3"
)

for n in 01 02 03 04 05 06 07 08; do
  webm=$(ls "${REC[$n]}"/*.webm)
  mp3="${AUD[$n]}"

  # 1. webm -> mp4 (h264/yuv420p, no audio)
  ffmpeg -y -v error -i "$webm" -r "$FPS" -c:v libx264 -pix_fmt yuv420p -an "build/beat${n}_raw.mp4"

  vdur=$(dur "build/beat${n}_raw.mp4")
  adur=$(dur "$mp3")
  pad=$(python3 -c "print(max(0, $adur - $vdur))")

  if python3 -c "exit(0 if $pad > 0.05 else 1)"; then
    ffmpeg -y -v error -i "build/beat${n}_raw.mp4" \
      -vf "tpad=stop_mode=clone:stop_duration=${pad}" \
      -c:v libx264 -pix_fmt yuv420p "build/beat${n}_padded.mp4"
  else
    cp "build/beat${n}_raw.mp4" "build/beat${n}_padded.mp4"
  fi

  ffmpeg -y -v error -i "build/beat${n}_padded.mp4" -i "$mp3" \
    -c:v copy -c:a aac -shortest "build/beat${n}_final.mp4"
  echo "beat${n} done: video=${vdur}s audio=${adur}s pad=${pad}s -> $(dur "build/beat${n}_final.mp4")s"
done

# --- Concatenate all 9 beats ---
INPUTS=""
FILTER=""
for n in 00 01 02 03 04 05 06 07 08; do
  INPUTS="$INPUTS -i build/beat${n}_final.mp4"
done
IDX=0
for n in 00 01 02 03 04 05 06 07 08; do
  FILTER="${FILTER}[${IDX}:v][${IDX}:a]"
  IDX=$((IDX+1))
done
FILTER="${FILTER}concat=n=9:v=1:a=1[outv][outa]"

# shellcheck disable=SC2086
ffmpeg -y -v error $INPUTS -filter_complex "$FILTER" -map "[outv]" -map "[outa]" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac bridgekit-demo-final.mp4

echo "=== FINAL ==="
ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,codec_type,width,height -of default=noprint_wrappers=1 bridgekit-demo-final.mp4
