# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["mlx-audio", "soundfile", "faster-whisper"]
# ///
"""Loopback-only Qwen3-TTS for the Twin voice preview on Apple Silicon."""

import base64
import binascii
import io
import json
import os
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

ORIGINS = {
    "https://loka-chat-mirror-v1.yinghe-vela-live.workers.dev",
    "http://localhost:8819",
    "http://127.0.0.1:8819",
    "http://localhost:8820",
    "http://127.0.0.1:8820",
}
ORIGINS.update(filter(None, os.environ.get("LOKA_VOICE_ORIGINS", "").split(",")))
LEGACY_REFERENCE = "你好，这是我的声音样本。我想和自己的分身聊聊天，听听它的想法。"
REFERENCE = "Hello, this is a sample of my voice. I would like to talk with my Twin and hear what it thinks."
PREVIEW = "I am your Twin. You can correct me at any time, and I will adjust what I do next."
MODEL = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16"


def load():
    from mlx_audio.tts.utils import load_model

    return load_model(MODEL)


def synthesize(model, sample, reference, text=PREVIEW):
    import numpy as np
    import soundfile as sf

    with TemporaryDirectory(prefix="loka-voice-") as temp:
        raw, wav = Path(temp) / "reference.media", Path(temp) / "reference.wav"
        raw.write_bytes(sample)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", str(raw), "-t", "45",
             "-vn", "-ac", "1", "-ar", "24000", str(wav)],
            check=True, capture_output=True, timeout=20,
        )
        if sf.info(wav).duration < 3:
            raise ValueError("Record at least three seconds of audio.")
        # Bound decoding so a noisy sample cannot tie up the local voice queue.
        token_limit = min(1024, max(150, len(text) * 3))
        chunks = list(model.generate(
            text=text, ref_audio=str(wav), ref_text=reference,
            max_tokens=token_limit, temperature=0.35,
        ))
        if not chunks:
            raise RuntimeError("Qwen3-TTS returned no audio")
        audio = io.BytesIO()
        sf.write(audio, np.concatenate([np.asarray(chunk.audio) for chunk in chunks]),
                 chunks[0].sample_rate, format="WAV")
        return audio.getvalue()


def animate_portrait(sample):
    model_dir = Path(os.environ.get(
        "LOKA_LIVEPORTRAIT_DIR", "~/.local/share/loka-models/LivePortrait"
    )).expanduser().resolve()
    python = model_dir / ".venv/bin/python"
    driving = model_dir / "assets/examples/driving/d1.pkl"
    if not python.is_file() or not driving.is_file():
        raise FileNotFoundError("LivePortrait is not installed")
    with TemporaryDirectory(prefix="loka-portrait-") as temp:
        source = Path(temp) / "portrait.png"
        image_format = "jpeg" if sample.startswith(b"\xff\xd8") else (
            "png" if sample.startswith(b"\x89PNG\r\n\x1a\n") else "webp"
        )
        raw = Path(temp) / ("photo." + image_format)
        raw.write_bytes(sample)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", str(raw), "-frames:v", "1",
             "-vf", "scale=768:768:force_original_aspect_ratio=decrease", str(source)],
            check=True, capture_output=True, timeout=20,
        )
        subprocess.run(
            [str(python), "inference.py", "-s", str(source), "-d", str(driving), "-o", temp],
            cwd=model_dir, env={**os.environ, "PYTORCH_ENABLE_MPS_FALLBACK": "1"},
            check=True, capture_output=True, timeout=240,
        )
        return (Path(temp) / "portrait--d1.mp4").read_bytes()


def transcribe(sample):
    from faster_whisper import WhisperModel
    import soundfile as sf

    if not hasattr(transcribe, "model"):
        transcribe.model = WhisperModel("base", device="cpu", compute_type="int8", local_files_only=True)
    with TemporaryDirectory(prefix="loka-asr-") as temp:
        raw, wav = Path(temp) / "recording.media", Path(temp) / "recording.wav"
        raw.write_bytes(sample)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", str(raw), "-t", "35",
             "-vn", "-ac", "1", "-ar", "16000", str(wav)],
            check=True, capture_output=True, timeout=20,
        )
        waveform, _ = sf.read(wav, dtype="float32")
        segments, _ = transcribe.model.transcribe(waveform, beam_size=1, vad_filter=True)
        return " ".join(segment.text.strip() for segment in segments).strip()


class VoiceHandler(BaseHTTPRequestHandler):
    def reply(self, status, payload=b"", content_type="text/plain; charset=utf-8"):
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        try:
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        if self.headers.get("Origin") not in ORIGINS or self.path not in {"/preview", "/portrait", "/speak", "/transcribe"}:
            return self.reply(403)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Loka-Voice-Language, X-Loka-Twin-Text")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_POST(self):
        if self.headers.get("Origin") not in ORIGINS or self.path not in {"/preview", "/portrait", "/speak", "/transcribe"}:
            return self.reply(403)
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.reply(400)
        if not 0 < length <= (8 * 1024 * 1024 if self.path == "/portrait" else 5_000_000):
            return self.reply(413, "The file exceeds the size limit.".encode())
        try:
            sample = self.rfile.read(length)
            if self.path == "/transcribe":
                transcript = self.server.asr_executor.submit(transcribe, sample).result()
                return self.reply(200, json.dumps({"text": transcript}).encode(), "application/json")
            if self.path == "/portrait":
                if not (sample.startswith((b"\xff\xd8", b"\x89PNG\r\n\x1a\n"))
                        or sample.startswith(b"RIFF") and sample[8:12] == b"WEBP"):
                    return self.reply(415, "Choose a JPEG, PNG, or WebP photo.".encode())
                result = self.server.portrait_executor.submit(animate_portrait, sample).result()
                return self.reply(200, result, "video/mp4")
            reference = REFERENCE if self.headers.get("X-Loka-Voice-Language") == "en" else LEGACY_REFERENCE
            text = PREVIEW
            if self.path == "/speak":
                encoded = self.headers.get("X-Loka-Twin-Text", "")
                try:
                    text = base64.b64decode(encoded, validate=True).decode("utf-8").strip() if len(encoded) <= 3200 else ""
                except (binascii.Error, UnicodeError):
                    text = ""
                if not 0 < len(text) <= 600:
                    return self.reply(400, b"Use a reply between 1 and 600 characters.")
            result = self.server.executor.submit(synthesize, self.server.model, sample, reference, text).result()
            self.reply(200, result, "audio/wav")
        except FileNotFoundError:
            self.reply(503, "The local LivePortrait runtime or model is not ready.".encode())
        except subprocess.CalledProcessError as exc:
            if self.path == "/portrait":
                print(exc.stderr.decode(errors="replace")[-4000:], flush=True)
                return self.reply(422, "Could not animate the portrait. Try a well-lit, front-facing photo.".encode())
            self.reply(422, "Could not use this recording. Read the prompt and record again.".encode())
        except (ValueError, subprocess.TimeoutExpired):
            self.reply(422, ("Portrait generation timed out." if self.path == "/portrait" else "Could not use this recording. Read the prompt and record again.").encode())
        except Exception as exc:
            print(f"{self.path}: {type(exc).__name__}", flush=True)
            message = "The local ASR model could not transcribe this recording." if self.path == "/transcribe" else "The local voice model could not generate audio."
            self.reply(500, message.encode())


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=1) as executor, ThreadPoolExecutor(max_workers=1) as portraits, ThreadPoolExecutor(max_workers=1) as asr, ThreadingHTTPServer(("127.0.0.1", 11435), VoiceHandler) as server:
        server.executor = executor
        server.portrait_executor = portraits
        server.asr_executor = asr
        server.model = executor.submit(load).result()
        print("Twin Qwen3-TTS: http://127.0.0.1:11435", flush=True)
        server.serve_forever()
