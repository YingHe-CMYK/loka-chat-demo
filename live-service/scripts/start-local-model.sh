#!/bin/sh
# Local-only inference for the published LokaChat interface.
export OLLAMA_NO_CLOUD=1
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_ORIGINS=https://loka-chat-mirror-v1.yinghe-vela-live.workers.dev
exec /Users/apple/.local/share/lokachat-runtime/bin/ollama serve
