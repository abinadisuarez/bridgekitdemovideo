#!/usr/bin/env python3
"""Phase 6 (segment-level) assembly — per-segment isolated recordings.

Each beat's recordings/<beat>/manifest.json lists its segments in order;
each segment already has its own isolated, short webm (recordings/<beat>/
segNN/*.webm) and its own clicks.json (already segment-relative — no
rebasing needed, unlike the earlier single-continuous-recording design).

For each segment: mix the synthesized click sound into its voiceover clip
at the logged click moments, pad whichever of video/audio is shorter
(freeze last video frame, or add silence) so the two match exactly, then
concatenate all of a beat's segments (hard cut — continuous same screen)
and finally concatenate all beats together with a crossfade transition
(video: xfade, audio: acrossfade).

Usage: assemble2.py <output.mp4> <beat-name> [beat-name ...]
       (use "00-hook" for the WP Sync screenshot hook beat)
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build2"
FPS = 25
W, H = 1920, 1080
FADE = 0.4  # beat-to-beat crossfade duration, seconds


def run(cmd):
    subprocess.run(cmd, check=True)


def dur(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def mix_clicks(voice_path, click_times, click_wav, out_path):
    if not click_times:
        shutil.copyfile(voice_path, out_path)
        return
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(voice_path)]
    for _ in click_times:
        cmd += ["-i", str(click_wav)]
    filter_parts = []
    mix_inputs = ["[0:a]"]
    for i, t in enumerate(click_times, start=1):
        ms = max(0, int(round(t * 1000)))
        filter_parts.append(f"[{i}:a]adelay={ms}:all=1[d{i}]")
        mix_inputs.append(f"[d{i}]")
    n = len(click_times) + 1
    filt = ";".join(filter_parts) + ";" + "".join(mix_inputs) + f"amix=inputs={n}:duration=first:normalize=0[aout]"
    cmd += ["-filter_complex", filt, "-map", "[aout]", "-c:a", "mp3", str(out_path)]
    run(cmd)


def build_hook(beat_dir):
    beat_dir.mkdir(parents=True, exist_ok=True)
    audio = ROOT / "audio" / "beat-00-hook.mp3"
    a_dur = dur(audio)
    video = beat_dir / "video.mp4"
    # Static frame, no zoom/pan — held for the full narration length.
    run([
        "ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(ROOT / "assets" / "wpsync-hero.png"),
        "-t", str(a_dur),
        "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
        "-r", str(FPS), "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
    ])
    final = beat_dir / "final.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", str(audio),
         "-c:v", "copy", "-c:a", "aac", "-shortest", str(final)])
    return final


def build_beat(beat_name, beat_dir):
    rec_dir = ROOT / "recordings" / beat_name
    manifest = json.loads((rec_dir / "manifest.json").read_text())
    click_wav = ROOT / "assets" / "click.wav"
    beat_dir.mkdir(parents=True, exist_ok=True)

    seg_finals = []
    for seg in manifest:
        idx = seg["index"]
        seg_rec_dir = rec_dir / seg["dir"]
        webm = next(seg_rec_dir.glob("*.webm"))
        clicks = json.loads((seg_rec_dir / "clicks.json").read_text())

        seg_video_raw = beat_dir / f"seg{idx:02d}_video_raw.mp4"
        run(["ffmpeg", "-y", "-v", "error", "-i", str(webm), "-r", str(FPS),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(seg_video_raw)])

        seg_audio_raw = ROOT / "audio" / "segments" / beat_name / f"seg-{idx:02d}.mp3"
        seg_audio_wc = beat_dir / f"seg{idx:02d}_audio.mp3"
        mix_clicks(seg_audio_raw, clicks, click_wav, seg_audio_wc)

        v_dur = dur(seg_video_raw)
        a_dur = dur(seg_audio_wc)
        seg_video_final = beat_dir / f"seg{idx:02d}_video.mp4"
        seg_audio_final = beat_dir / f"seg{idx:02d}_audiopad.mp3"
        if a_dur > v_dur + 0.03:
            pad = a_dur - v_dur
            run(["ffmpeg", "-y", "-v", "error", "-i", str(seg_video_raw),
                 "-vf", f"tpad=stop_mode=clone:stop_duration={pad}",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", str(seg_video_final)])
            shutil.copyfile(seg_audio_wc, seg_audio_final)
        elif v_dur > a_dur + 0.03:
            pad = v_dur - a_dur
            run(["ffmpeg", "-y", "-v", "error", "-i", str(seg_audio_wc),
                 "-af", f"apad=pad_dur={pad}", "-c:a", "mp3", str(seg_audio_final)])
            shutil.copyfile(seg_video_raw, seg_video_final)
        else:
            shutil.copyfile(seg_video_raw, seg_video_final)
            shutil.copyfile(seg_audio_wc, seg_audio_final)

        seg_final = beat_dir / f"seg{idx:02d}_final.mp4"
        run(["ffmpeg", "-y", "-v", "error", "-i", str(seg_video_final), "-i", str(seg_audio_final),
             "-c:v", "copy", "-c:a", "aac", "-shortest", str(seg_final)])
        seg_finals.append(seg_final)

    beat_final = beat_dir / "final.mp4"
    if len(seg_finals) == 1:
        shutil.copyfile(seg_finals[0], beat_final)
    else:
        inputs = []
        filt = ""
        for i, sf in enumerate(seg_finals):
            inputs += ["-i", str(sf)]
            filt += f"[{i}:v][{i}:a]"
        filt += f"concat=n={len(seg_finals)}:v=1:a=1[outv][outa]"
        run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", filt,
             "-map", "[outv]", "-map", "[outa]",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(beat_final)])
    return beat_final


def crossfade_chain(clips, out_path):
    if len(clips) == 1:
        shutil.copyfile(clips[0], out_path)
        return
    durations = [dur(c) for c in clips]
    inputs = []
    for c in clips:
        inputs += ["-i", str(c)]

    filt_parts = []
    cum = durations[0]
    prev_v, prev_a = "0:v", "0:a"
    for i in range(1, len(clips)):
        offset = cum - FADE
        vout = f"v{i}"
        aout = f"a{i}"
        filt_parts.append(
            f"[{prev_v}][{i}:v]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{vout}]"
        )
        filt_parts.append(f"[{prev_a}][{i}:a]acrossfade=d={FADE}[{aout}]")
        prev_v, prev_a = vout, aout
        cum = cum + durations[i] - FADE

    filt = ";".join(filt_parts)
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", filt,
         "-map", f"[{prev_v}]", "-map", f"[{prev_a}]",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out_path)])


def main():
    out_path = Path(sys.argv[1])
    beat_names = sys.argv[2:]
    BUILD.mkdir(exist_ok=True)

    finals = []
    for name in beat_names:
        beat_dir = BUILD / name
        if name == "00-hook":
            finals.append(build_hook(beat_dir))
        else:
            finals.append(build_beat(name, beat_dir))
        print(f"beat {name}: {dur(finals[-1]):.2f}s")

    crossfade_chain(finals, out_path)
    print(f"=== {out_path} : {dur(out_path):.2f}s ===")


if __name__ == "__main__":
    main()
