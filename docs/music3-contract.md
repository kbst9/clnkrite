# Music3 contract (M3)

Default adapter shape, taken from implementation-plan §3.1 (public MiniMax-Music3 + SGLang-Omni docs). **Do not treat these as live results.** The confirmation checklist is unchecked until someone runs it against Kevin's SGLang-Omni.

## Default adapter shape

The bridge keeps **every field name in one config object** (`bridge/app.py` → `MUSIC3_ADAPTER`):

| Config key | Default | Maps to request |
|---|---|---|
| `endpoint_path` | `/v1/audio/speech` | `POST {MUSIC3_BASE_URL}/v1/audio/speech` |
| `models_path` | `/v1/models` | Probe + model id discovery |
| `model_field` | `model` | Served model id from `/v1/models` (do not hardcode in callers) |
| `input_field` | `input` | Lyrics, newline-separated, section tags on their own lines |
| `instructions_field` | `instructions` | Caption / music description |
| `response_format_field` | `response_format` | `"wav"` |
| `response_format` | `wav` | |
| `seed_field` | `seed` | integer |
| `max_new_tokens_field` | `max_new_tokens` | `ceil(duration_seconds * frames_per_second)` |
| `frames_per_second` | `25` | Audio frames / second |
| `stream_field` | `stream` | |
| `stream` | `false` | Streaming decode is out of v1 |
| `auth_header` | `Authorization` | Optional |
| `auth_prefix` | `Bearer ` | Optional |
| `default_model` | `MiniMaxAI/MiniMax-Music3` | Fallback only if `/v1/models` is empty |

Documented response (not confirmed live): 32 kHz, 16-bit, stereo WAV bytes. Full mix only.

Supported lyric section tags: `[Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]`.

Caption structure (best-results guidance from the model card): Global Metadata, Vocal Details, Arrangement. The generate drawer "Draft from project" button is a string template, not an LLM.

There is **no job API** on Music3 itself. The HTTP request blocks for the whole generation. The bridge wraps it in a serial async queue.

## Confirm-against-running-server checklist

First task of milestone M3 against the live SGLang-Omni. Each item is a config/adapter switch, not a rewrite. Leave unchecked until actually run.

- [ ] `GET {MUSIC3_BASE_URL}/v1/models` — confirm served model id string (adapter sends whatever this returns; do not hardcode).
- [ ] Send a 10-second smoke request; confirm: HTTP 200, `Content-Type` (`audio/wav` expected), body is RIFF/WAV, 32 kHz stereo.
- [ ] Confirm `seed` and `max_new_tokens` are accepted (not 422-rejected); if `max_new_tokens` is ignored, fall back to trimming client-side to requested duration.
- [ ] Confirm behavior on concurrent requests (expected: serialized or 429/503) — informs bridge queue settings.
- [ ] Confirm whether an API key header is required; if so store it as a Worker secret passed through the bridge config.
- [ ] Note actual wall-clock time for 30 s / 60 s / 120 s generations on Kevin's GPU → set job timeout defaults (§7.3).
