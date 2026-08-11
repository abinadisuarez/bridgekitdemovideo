#!/usr/bin/env python3
"""Mix a synthesized click sound into a voiceover clip at logged timestamps.
Usage: mix_clicks.py <voice.mp3> <clicks.json> <click.wav> <out.mp3>
"""
import json
import shutil
import subprocess
import sys


def mix(voice_path, clicks_path, click_wav, out_path):
    with open(clicks_path) as f:
        clicks = json.load(f)

    if not clicks:
        shutil.copyfile(voice_path, out_path)
        return

    cmd = ["ffmpeg", "-y", "-v", "error", "-i", voice_path]
    for _ in clicks:
        cmd += ["-i", click_wav]

    filter_parts = []
    mix_inputs = ["[0:a]"]
    for i, t in enumerate(clicks, start=1):
        ms = int(round(t * 1000))
        filter_parts.append(f"[{i}:a]adelay={ms}:all=1[d{i}]")
        mix_inputs.append(f"[d{i}]")

    n = len(clicks) + 1
    filter_complex = ";".join(filter_parts) + ";" + "".join(mix_inputs) + f"amix=inputs={n}:duration=first:normalize=0[aout]"
    cmd += ["-filter_complex", filter_complex, "-map", "[aout]", "-c:a", "mp3", out_path]
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    mix(*sys.argv[1:5])
