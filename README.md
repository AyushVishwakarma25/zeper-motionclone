<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/motionclone-wordmark-light.png">
    <img src="docs/images/motionclone-wordmark.png" width="360" alt="MotionClone">
  </picture>
</p>

<h1 align="center">From reference video to editable motion.</h1>

<p align="center">
  Rebuild text, shapes, and animation with Google Gemini + Vertex AI.<br>
  Compare the result. Export a video. Keep the project and make it yours.
</p>

<p align="center">
  <a href="#run-locally"><strong>Run&nbsp;on&nbsp;Windows</strong></a> &nbsp; · &nbsp;
  <a href="#deploy-on-google-cloud-platform-gcp"><strong>Deploy&nbsp;on&nbsp;GCP</strong></a> &nbsp; · &nbsp;
  <a href="docs/PRD-GEMINI-VERTEX-AI.md"><strong>Gemini&nbsp;PRD</strong></a>
</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Cloud%20Run-111?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/python-3.11%2B-111?style=flat-square" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/node-22%2B-111?style=flat-square" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/AI-Google%20Gemini%20%2F%20Vertex%20AI-4285F4?style=flat-square&logo=google" alt="Google Gemini / Vertex AI">
  <img src="https://img.shields.io/badge/Cloud-Google%20Cloud%20Platform-34A853?style=flat-square&logo=googlecloud" alt="Google Cloud Platform">
</p>

<p align="center">
  <a href="https://motionclone.lol/#examples">
    <img src="docs/images/motionclone-in-action.gif" width="960" alt="Real MotionClone playback: original reference on the left, rebuilt animation on the right">
  </a>
</p>

<p align="center">
  <sub>Actual saved reconstruction. Visual differences remain.<br>
  <a href="https://motionclone.lol/#examples">Watch the examples with playback controls</a> · <a href="docs/images/hero-comparison.png">View a still</a></sub>
</p>

<p align="center">
  <a href="#why-motionclone">Why</a> ·
  <a href="#a-reference-is-the-starting-point">How it works</a> ·
  <a href="#run-locally">Run locally</a> ·
  <a href="#connect-your-ai-account-first">Connect AI</a> ·
  <a href="#build-a-sequence-in-the-editor">Editor</a> ·
  <a href="#inside-the-studio">Inside the studio</a> ·
  <a href="#take-the-result-with-you">Exports</a> ·
  <a href="#guides--help">Guides</a> ·
  <a href="#community">Community</a>
</p>

---

## Why MotionClone

- **Learn from the ads you admire.** Turn any motion-graphics clip into code you can read, tweak, and re-render instead of guessing keyframes by hand.
- **Editable, not a screen recording.** The output is a HyperFrames project (HTML, assets, fonts, timing), so you can change copy, colors, and pacing, or hand it to a coding agent.
- **Honest comparison built in.** Original and rebuild play in sync, so you see exactly where they match and where they don't.
- **Google Gemini & Vertex AI powered.** Uses Gemini 2.5 Flash / Pro via the unified `google-genai` SDK with native structured schemas and high-resolution multimodal vision analysis.

## A reference is the starting point

Paste a public video link or upload a clip. MotionClone reconstructs it as an **editable HyperFrames project**: text, shapes, artwork, and animation you can adjust for a product demo, title sequence, or launch video.

| Bring a reference | Check the rebuild | Make it yours |
| --- | --- | --- |
| Import from X, YouTube, Vimeo, a direct video URL, or a local file. | Play both videos together, scrub, and slow down to inspect the match. | Download an MP4 or edit the project’s copy, assets, styling, and timing. |

**Powered by Google Gemini / Vertex AI.** Connect using either your Google AI Studio `GEMINI_API_KEY` or Google Cloud Vertex AI (GCP Project ID + Application Default Credentials / IAM Service Account).

## Run locally

**Prerequisites:** Git, Python 3.11+, Node.js 22+ with npm, FFmpeg + ffprobe, Google Chrome. Make `git`, `python`, `npm`, `ffmpeg`, and `ffprobe` available on PATH.

```powershell
git clone https://github.com/blixvip/MotionClone.git
cd MotionClone

# Set your Gemini API key (or use Vertex AI ADC)
$env:GEMINI_API_KEY = "your-gemini-api-key"

.\start.ps1
```

The launcher installs locked dependencies and opens **http://127.0.0.1:4319**.

## Connect your AI account

Open **Settings → Connect Gemini**:
- **Option 1 (Gemini API Key):** Paste your key from Google AI Studio.
- **Option 2 (Vertex AI on GCP):** Enter your GCP Project ID and Region (e.g. `us-central1`). If running in GCP Cloud Run, authentication is automatic via the attached Service Account.

## Deploy on Google Cloud Platform (GCP)

MotionClone is containerized and ready for 1-command deployment to **Google Cloud Run**:

### Dry run (validate commands & env vars without deploying)
```bash
./deploy-gcp.sh --dry-run
```
Or in PowerShell:
```powershell
.\deploy-gcp.ps1 -DryRun
```

### Deploy to Cloud Run
```powershell
# Deploy from PowerShell
.\deploy-gcp.ps1
```

Or using bash:
```bash
chmod +x deploy-gcp.sh
./deploy-gcp.sh
```

### Required Hosted Environment Variables
When running in hosted mode (`FRAMEFORGE_HOSTED=1`), MotionClone operates in fail-closed mode:
- `ALLOWED_EMAILS`: Comma-separated list of approved Google accounts (e.g. `owner@zeper.ai,admin@zeper.ai`).
- `FIREBASE_WEB_API_KEY`: Firebase web API key for client-side authentication.
- `FIREBASE_APP_ID`: Firebase Web App ID.
- `FIREBASE_AUTH_DOMAIN`: Firebase Auth domain (e.g. `zeperai.firebaseapp.com`).
- `GEMINI_LOCATION`: Text/vision model endpoint location (`global`).
- `GOOGLE_CLOUD_LOCATION`: Region for regional services (`us-central1`).

At startup in hosted mode, MotionClone verifies all required security environment variables and will refuse to boot (`sys.exit(1)`) if `ALLOWED_EMAILS` or Firebase web configuration is missing.

### Probe Models
You can probe connected Vertex AI, Gemini models, and Cloud TTS voices at any time:
```bash
python scripts/probe_models.py
```

## Build a sequence in the Editor

Open **Editor** from the navigation. Upload references or use saved ones, set each segment's in/out points, and add up to 12 segments (120 seconds total). Reorder or preview the sequence, add segment notes and a project brief, and choose landscape, portrait, or square. **Save sequence** stores your draft in your workspace. **Generate my video** uses your connected AI account to rebuild the assembled reference as one editable video. Follow its progress in the studio and download the MP4 or editable project when complete.

Reference imports and sequence preparation do not use AI; generation does. Original audio is retained when selected. See [Editor](docs/EDITOR.md).

## Inside the studio

**01 / Add a reference → 02 / Rebuild → 03 / Compare & export**

Start with a short clip. Choose whether to retain its soundtrack in **Audio settings**, then select **Rebuild video**. Completed scenes save as the job progresses. Local inputs support up to **120 seconds and 250 MB**.

![MotionClone workspace showing a real completed reconstruction and download controls](docs/images/02-rebuilt-video.png)

### Six styles. Five formats. Your arrangement.

Choose **Studio**, **Editorial**, **Signal**, **Cobalt**, **Peach**, or **Monochrome**. Set the export format and arrangement independently.

![The six recording styles: Studio, Editorial, Signal, Cobalt, Peach, and Monochrome](docs/images/04-style-picker.png)

| Landscape | Portrait | Square | Ultrawide | Feed |
| --- | --- | --- | --- | --- |
| 1920 × 1080 | 1080 × 1920 | 1080 × 1080 | 3840 × 1080 | 1080 × 1350 |

Present the original and rebuild side by side, stacked, with the rebuild in the spotlight, or with a wipe reveal. Use **Saved videos** to reopen projects, mark favorites, or organize collections.

[See the full visual walkthrough →](docs/GETTING-STARTED.md)

## Take the result with you

| Download | What you get |
| --- | --- |
| **Compare & export → Download MP4** | Both videos in the selected style, format, and arrangement, with retained original audio. |
| **Export details → Rebuilt video only** | The reconstructed animation on its own. |
| **Editable project** | HyperFrames code, assets, fonts, and audio for further editing. |

Extract the editable ZIP, read its README, and run:

```powershell
npm install
npm run preview
```

Edit the project, then run `npm run render`. A coding agent can help change the copy, colors, or timing; the [agent workflow](docs/AGENT-WORKFLOW.md) explains how. The editable ZIP excludes the original reference video and reference screenshots. See [recording and exports](docs/RECORDING.md) for details.

## Guides & help

| Start creating | Go deeper |
| --- | --- |
| [Your first project](docs/GETTING-STARTED.md) | [Edit with a coding agent](docs/AGENT-WORKFLOW.md) |
| [Product demo workflow](https://motionclone.lol/ai-demo-videos) | [Recording and exports](docs/RECORDING.md) |
| [Launch video workflow](https://motionclone.lol/ai-launch-videos) | [Development and verification](docs/DEVELOPMENT.md) |
| [简体中文指南](README.zh-CN.md) | [Report a bug](https://github.com/blixvip/MotionClone/issues) |

<details>
<summary><strong>Troubleshooting</strong></summary>

- **A command is missing:** install its prerequisite, add it to PATH, and reopen PowerShell.
- **ChatGPT is disconnected:** run `codex login`, then refresh the connection in the app.
- **A video link fails:** try uploading the file. Private or unavailable links may not download.
- **The server will not start:** check `server-error.log` in the project folder.
- **The result looks wrong:** inspect the comparison. Tiny text, missing fonts, photography, and complex motion can differ from the reference.

</details>

<details>
<summary><strong>Local data, account usage & licensing</strong></summary>

Projects and media live in `data/` on your computer. Selected reference frames are sent to ChatGPT for analysis, and video downloads contact the source service. The app is not offline-only. Hosted storage differs; check the online studio’s account and privacy information.

Use footage you own or have permission to adapt. Example projects and reference media are not bundled with a fresh clone. Export completion confirms that a file was produced; use the comparison to judge visual similarity.

No project-wide open-source license has been assigned. Third-party components retain their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md) and [licenses/](licenses/).

</details>

For development, run `.venv\Scripts\python.exe -m pytest -q` after setup. See the [development guide](docs/DEVELOPMENT.md) for browser checks.

### Live GCP Real-Credential Smoke Check
To verify live GCP Vertex AI, Cloud Text-to-Speech, Cloud Speech-to-Text, Firestore, and local Remotion rendering with real ADC credentials (no stubs):
```powershell
.venv\Scripts\python.exe scripts/real_check.py
```
This tests ADC resolution, Gemini 3.1 Pro text & video deconstruction, vision, Gemini 3.1 Flash Image generation, Cloud TTS synthesis, STT word timestamps, Firestore transactions, and 60 FPS Remotion rendering.

## Community

💬 [Join the Discord](https://discord.gg/zEB4VjmfSb) for questions, help, feedback, and updates.

---

<p align="center">
  Built by <a href="https://github.com/blixvip">blix</a> · <a href="https://x.com/waselyyy">Follow on X</a> · <a href="https://motionclone.lol">motionclone.lol</a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/blix"><img src="web/assets/buymeacoffee-yellow.png" width="170" alt="Support MotionClone — buy blix a coffee"></a>
</p>
