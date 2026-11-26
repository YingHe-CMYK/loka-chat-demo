# Original /twin incremental integration — pending deployment and browser verification

Target: http://149.102.145.51:8080/twin
Observed build: /assets/index-BB8fS_BW.js and /assets/index-ByTfn7X_.css (read 2026-11-23).
Original selectors verified in public compiled code: .twin-root .win .stage .col .vstage .vorb .vstatus[data-mode], form.vcomposer input#twin-say.

Deploy this directory unchanged under /twin-presence/. Add the following to the ORIGINAL server's HTML (not a replacement page):

<link rel="stylesheet" href="/twin-presence/presence.css">
<script type="module" src="/twin-presence/integrate.mjs"></script>

The adapter does not create a new page or replace the original React root. .win grid, nav, original canvas, conversation, and preview desk remain owned by the original app.

- Use my photo: browser file chooser; local object URL only, never sent to backend. This is a static likeness, not a generated or animated digital human. No user likeness is available yet. Choosing a file is explicit.
- Orb: removes the temporary local photo and returns to the ORIGINAL canvas.
- Listening/thinking/responding follow the original data-mode and observed in-flight Twin mutations; no simulated model responses. No voice or lip sync claim.
- Correct: the ORIGINAL input carries the owner's correction to the ORIGINAL backend, asking it to revise the next question and action. It does not replace backend output with a canned reply.
- Take over: blocks new relevant requests and attempts cancellation of in-flight browser requests. It preserves the original input. It cannot roll back already-completed server work; server task cancellation needs an endpoint.
- Resume does not automatically resend.

Two pure state/scope tests and module syntax checks pass. Browser/React event integration, photo chooser, response cancellation and actual backend correction effects are NOT verified. Do not publish until verified against original source and actual UI. Mutation observer status update is idempotent to avoid self-triggering loops.

Blockers: original Twin frontend source absent from local workspace; original server deployment credentials absent; CUA returns 'Local browser access is unavailable for this chat'. Public GitHub tree query returned Not Found. Do not infer whether the repository is private or invitation is missing from this alone.

Figma should be captured FROM the integrated original view only after the above checks. No new research board or guessed clone should be imported as the integrated result.

Acceptance: unchanged original layout; explicit local photo switch/revert; listen → think → respond → wait; correction changes actual next output/action; takeover cancels/blocks and input retained; resume no duplicate request; exit/re-entry photo consent behavior explicit; reduced motion; no photo/audio in network; current original backend remains functional.

## Desktop proactive interaction preview

Open `/twin-presence/preview.html` on a local HTTP (loopback) or HTTPS server in desktop Chromium. This page uses the original layout reference and the same additive adapter. It is independent of the original API. Writing a line in its input simulates editing focus only.

1. Open 主动协作设置 and select one .txt or .md file through the system chooser. The code reads that file on an interval while the page is visible. It retains the initial version in memory for comparison.
2. Edit and save the source outside the app. While the composer has focus, the pending result is a badge. Leave the composer to see the automatically expanded summary, then open the comparison on the right.
3. Expand 补充一段依据 to preview and edit a local excerpt. Adding it places it beside the change. Closing or disconnecting the source clears browser-memory content as indicated. The preview performs a text comparison, not model inference.
4. 设置我的 Twin 形象 picks an image from this device and layers it over the existing orb. 恢复球体 releases the URL. The selected likeness is scoped to the current tab. It does not create or train a digital human.
5. In settings, audition and enable a short cue. A camera is optional and available only when the browser exposes secure media capture and FaceDetector. Camera processing is local, without microphone access; hiding the page stops camera tracks. The production preview does not assume a meeting or infer background noise.

Browser QA used a controlled FileSystemFileHandle fixture for the changing contents and an actual local PNG through the file input. Verified focus is retained, result delivery advances from badge to summary, before/after rendering, supplemental excerpt, pausing and restoring the orb. OS file picker, hardware face detection, the production server, and 3D memory integration still require separate verification.

The local preview now exposes two selectable work items. Pending changes belong to 资料对照. On another item, or while editing, only that item's marker changes. Returning to the item in a focused, visible tab allows expansion. The native onboarding dialog suppresses delivery while open. Quiet mode affects sound only. The first display of a result consumes its optional sound cue. A newer file revision waits while a comparison is open; supplemental text is kept in this session until the result changes.

The reminder step also accepts optional quiet hours, using the browser's local time and allowing ranges across midnight. Quiet hours suppress only sound. A Chromium test used fake camera media and a controlled detector to verify that an absent signal holds a pending result at the marker, and a stable return permits preview only after editing is over and the corresponding work item is open. This verifies the delivery gate, not the device's detection accuracy.

The preview offers an explicit local profile save in the last guide step. IndexedDB stores the selected photo and microphone sample under the preview origin. Reload restores those samples in the same browser. File handles, device permissions, and email are outside this profile record. A Chromium walk-through with a local PNG and simulated microphone verified save, reload, audio control restoration, deletion, and a second reload.

Browsers without the File System Access picker provide a local manual comparison in the same guide. Choose the original once, then select a new version of the same filename from 主动协作. This uses browser file inputs and does not monitor the filesystem. The Chromium walk-through disabled the native picker API and verified selection of both versions, rendering the changed line, and pausing the source.

## Typed workspace structure

The current working preview stays at /twin-presence/preview.html. The next workspace view lives in src/twin-workspace/workspace-view.tsx. TwinWorkspaceView owns the header, companion and preview layout, and work-item navigation. It accepts identity, composer, result and settings as React slots. TwinResultView defines the loading, empty, error and ready presentations. Its parent will supply permission state and result transitions. The frontend route is /twin-workspace. It lazy-loads the typed workspace and connects the existing local permission and delivery controller. The Express server serves the built entry for this route.

Run `npm run quality` from live-service to lint the Twin frontend, type-check the application, run the test suite and produce the distributable build. This sequence is also present in the repository workflow. Browser acceptance exercises the compiled Express route using fixture camera, microphone and file selection.

The companion column includes a direct camera control after onboarding. The detector uses the browser FaceDetector API when available and otherwise loads the pinned Apache-2.0 MediaPipe runtime and the official BlazeFace short-range model from the same origin. Build and dev preparation copy runtime files from node_modules. Model source is https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite . API and provenance are documented at https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js . Captured frames stay in memory; detection emits a boolean used only by delivery. A Chrome test disabled native FaceDetector and intercepted third-party requests while running the actual model on a blank-to-face test video.

## Local Twin media

The workspace at `http://127.0.0.1:8820/twin` uses `uv run scripts/local-twin-voice.py` as its media service on loopback port 11435.

- `我的 Twin → 声音` submits a reference recording to Qwen3-TTS 0.6B Base through MLX Audio and plays the returned WAV. FFmpeg must be on PATH.
- `我的 Twin → 形象` submits the selected photo to LivePortrait and displays a silent MP4 using the model repository's bundled driving motion. The preview does not perform audio-driven lip sync.
- Install the official LivePortrait checkout with its macOS requirements in `~/.local/share/loka-models/LivePortrait/.venv`, including the human-model weights from `KlingTeam/LivePortrait`. Set `LOKA_LIVEPORTRAIT_DIR` if the checkout lives elsewhere.
- Requests use loopback, and the service uses temporary input and output files. Photo and recording storage in the browser still requires the explicit save action. Generated previews are kept in the current page session.
