# PRD: AI Explainer Video Agent on GCP + Vertex AI

Nov 13, 2026 · @Ayush

## 1. Summary and goals

Build a web app on your GCP-hosted site where a user uploads raw assets, types a brief, and gets a finished 30-second explainer MP4 back, with Gemini on Vertex AI as the "brain" and Remotion + FFmpeg as the "hands".

What you are copying is not a model feature. It is an **agent loop**: a model that can call tools (read files, write code, run shell commands, look at output) inside a sandbox, until the job is done. The model only decides; the sandbox executes.

**Goals**

- Input: a GCS folder or upload of raw images, logos, clips and a text brief.
- Output: a 1080x1920 or 1920x1080 30 s MP4 (30 fps) with motion graphics, captions, voice-over and music, in under 5 minutes.
- User can preview, give feedback ("make scene 3 faster") and re-render without starting over.
- Runs entirely on your GCP project; Gemini is called through Vertex AI.

**Non-goals (v1)**

- Generating photoreal footage from scratch (that is Veo or Higgsfield territory, not Remotion).
- Multi-user timeline editor like Premiere.
- Videos longer than 90 s.

**Honest correction on models:** Gemini 1.5 Flash-8B is long retired, and per Google's Vertex release notes the Gemini 2.5 family was scheduled to retire on October 16, 2026. As of today Vertex lists Gemini 3.x models (Pro and Flash, some in preview). Check the Model Garden page for the exact current IDs before you hard-code anything, and keep the model ID in an env var.

## 2. What happens behind the chat window

The chat box is a thin client. Behind it sits a harness that gives the model a private Linux sandbox and a short list of tools, then loops until the model stops asking for tools. Nothing is "installed in the model"; the model writes commands and code, the sandbox runs them, and the output is fed back as text or image.

**The loop, one turn at a time**

1. User message arrives (plus attached files, which land in the sandbox's upload folder).
2. Harness sends the model: system prompt + conversation + the list of tool schemas.
3. Model replies with either text (done) or a **tool call** such as `Bash({command: "ffmpeg -i in.mp4 ..."})`.
4. Harness runs that call inside the sandbox and captures stdout, stderr and exit code.
5. The result goes back to the model as a new message. The model reads it, fixes errors, and calls the next tool.
6. When the model has the final file, it "delivers" it (a send-file tool), and the harness shows it in the UI.

**The tool set the model sees (the part you must replicate)**

| Tool | What it does | Your equivalent |
| --- | --- | --- |
| Bash | Run shell commands: `npm install`, `npx remotion render`, `ffmpeg`, `python` | Worker container exec with timeout |
| Read / Write / Edit | Read, create and patch files in the working directory | GCS-backed workspace + a file API |
| Glob / Grep | List and search files | `ls`, `rg` wrappers |
| Image view | Look at a PNG (a rendered frame) and judge it | Gemini multimodal input |
| Web search / fetch | Look up facts and pages | Gemini grounding with Google Search |
| Skill | Load a folder of instructions (a SKILL.md) before a job type | Your "video-skill" prompt files in GCS |
| Task list | Show progress to the user | Firestore doc streamed to the UI |
| Send file | Hand a finished file to the user | Signed GCS URL |

**Three things that make it work in practice**

- **A feedback loop with eyes.** The model renders a still frame, looks at it, and fixes overlapping text or cut-off logos before the final render. Without this, quality drops sharply.
- **Skills.** A short written playbook ("explainer videos: 30 fps, safe margins 64 px, captions at 48 px, max 2 lines") loaded before the work starts. This is cheap to copy and has more effect than model choice.
- **Network allowlist.** The sandbox can usually reach only package registries and GitHub, so assets are pre-baked into the image rather than downloaded at run time. Remotion fetches a headless Chrome on first render, so you must bake that into your Docker image too.

The exact package list in Claude's own sandbox varies and I can't see it as a fixed manifest, so section 3 is the stack I recommend for your build, not a copy of an internal list.

## 3. Tool stack and configuration

Four core tools do the video work; Gemini drives them. Bake all of them into one Docker image so a job never needs the internet.

| Tool | Role in the pipeline | Version / config |
| --- | --- | --- |
| Node.js | Runs Remotion and the worker API | Node 20 LTS or newer |
| Remotion | Turns a React composition + JSON props into frames; `renderStill` for previews, `renderMedia` for the final MP4 | Pin every `remotion` and `@remotion/*` package to one exact version, no `^` |
| FFmpeg + ffprobe | Normalise assets, trim and loudness-fix audio, mix music + voice, final mux and compression | Static or apt build with libx264 and AAC |
| Headless Chrome | Remotion's renderer; Remotion downloads "Chrome Headless Shell" itself | Run `npx remotion browser ensure` at image build time |
| Python 3.11 (optional) | Image prep: Pillow or `rembg` for background removal, colour palette extraction | Only if you need it; Sharp in Node can replace most of it |
| Voice-over | Script to speech | Google Cloud Text-to-Speech or Gemini TTS via Vertex |
| Captions | Word-level timestamps from the voice-over | Speech-to-Text with word offsets, then `@remotion/captions` |

You asked for "2 more tools": in practice they are **text-to-speech** and **Speech-to-Text (for caption timing)**, plus an image-prep step. The video itself is Remotion + FFmpeg.

**Dockerfile for the render worker**

```dockerfile
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates fonts-noto fonts-noto-color-emoji \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
    libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libpango-1.0-0 libcairo2 libcups2 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
RUN npx remotion browser ensure
COPY . .
ENV NODE_ENV=production
CMD ["node", "worker/server.js"]
```

**remotion.config.ts essentials**

```ts
import {Config} from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(20);
Config.setPixelFormat('yuv420p');
Config.setConcurrency(4);          // match vCPU count
Config.setChromiumOpenGlRenderer('angle');
```

**Cloud Run sizing for a 30 s, 30 fps render (900 frames):** start at 4 vCPU, 8 GiB memory, request timeout 900 s, concurrency 1 per instance (one render per container), and tune from real timings. Use the `asia-south1` (Mumbai) region for lower latency from Lucknow.

**Do not use `@remotion/cloudrun` as your base.** Remotion's own docs mark it alpha and not actively developed. Run `@remotion/renderer` (`bundle`, `selectComposition`, `renderMedia`) inside your own Cloud Run container instead; it is the same engine with no dependency on that package.

## 4. Target architecture on GCP

&#91;embedded content: GCP architecture · 8 components, 1 model loop\]

The browser uploads assets straight to Cloud Storage and watches a Firestore job document for progress. The agent loop is the only component that talks to Gemini, and the only one that can start renders.

**Responsibilities**

- **Web UI** (Next.js on your existing site): upload, brief form, progress panel, video preview, "request changes" box.
- **API** (Cloud Run): auth, creates a job, issues signed upload URLs, enqueues the job. Never runs a render itself.
- **Agent loop** (Cloud Run, 1 job per instance, long timeout): calls Gemini, executes the tool calls it returns, writes progress to Firestore.
- **Render worker** (Cloud Run, the Dockerfile in section 3): bundle, preview stills, final render, FFmpeg mixdown. It can be the same container as the agent loop in v1; split it once renders compete with model calls for CPU.
- **Cloud Storage**: three prefixes per job: `inputs/`, `workspace/` (generated code, props, audio), `outputs/`.
- **Service accounts**: one per service, with only the roles it needs (Vertex AI User for the agent loop, Storage Object Admin on the job bucket, Firestore user).

## 5. What Gemini does and what code does

Gemini should decide and judge; it should never touch pixels or audio. Every job below is either a model call or a deterministic tool, never both.

| Job | Done by | Notes |
| --- | --- | --- |
| Understand each raw asset (what is in it, focal point, dominant colours, usable or not) | Gemini Flash tier, multimodal input | Send images as GCS URIs; ask for JSON via a response schema |
| Write script and storyboard (hook, 4 to 6 scenes, on-screen text, timings summing to 30 s) | Gemini Pro tier | Output a **scene plan JSON**, validated against a schema |
| Fill the video template from the plan | Deterministic code | Scene plan becomes Remotion `inputProps`; no model involved |
| Write custom scene code (only when no template fits) | Gemini Pro tier | Writes a TSX file into `workspace/`; the worker type-checks it before rendering |
| Voice-over audio | Cloud Text-to-Speech or Gemini TTS | Plain API call |
| Word timestamps for captions | Speech-to-Text | Plain API call |
| Render stills and final video | Remotion in the render worker | Deterministic |
| Audio mix, loudness, final encode | FFmpeg | Deterministic |
| Review a preview still or frame strip and list defects | Gemini Flash tier, multimodal | Returns a list of fixes; loop stops after 2 to 3 rounds |
| Apply user feedback ("make scene 3 faster") | Gemini Pro tier | Edits the scene plan JSON, not the video |

**The single biggest design decision: plan JSON plus templates, not free-form code.** Claude can write a whole Remotion project from scratch because it is strong at long, error-free code. A cheaper Gemini Flash model is far more reliable when it only fills a schema (scene type, text, asset id, duration, transition) that maps onto components you already wrote and tested. Start there; allow free-form TSX as a fallback path.

**Model IDs.** Google's current Vertex listing shows Gemini 3.x models (Pro and Flash, some marked preview), and the Gemini 2.5 family was scheduled to retire on October 16, 2026. Read the model IDs from environment variables (`PLANNER_MODEL`, `FAST_MODEL`) and confirm them in Model Garden before launch. Compare output quality on your own 5 sample videos before settling on a tier; I cannot tell you which tier will edit best without that test.

## 6. Pipeline for one 30-second explainer

30 seconds at 30 fps is **900 frames**. Every step writes its result to `gs://<bucket>/jobs/<jobId>/` so a crashed job can resume from the last finished step.

1. **Create job.** Browser uploads to `inputs/` with signed URLs and posts the brief (topic, audience, tone, aspect ratio, brand colours). API writes a Firestore job with status `queued`, enqueues it.
2. **Ingest (code).** `ffprobe` every file. Convert HEIC or WebP to PNG or JPG, cap images at 2160 px on the long side, re-encode clips to H.264 at 30 fps, extract a thumbnail per clip. Output: `assets.json` with id, type, size, duration.
3. **Understand assets (Gemini Flash).** Send each image or thumbnail with the brief. Response schema returns `{id, description, focal_point, safe_to_crop, usable}`.
4. **Plan (Gemini Pro).** Input: brief + asset notes + your "explainer-video" playbook. Output: scene plan JSON: voice-over script, 4 to 6 scenes, each with template name, text, asset id, start and end frame, transition. Scene durations must sum to 900 frames.
5. **Validate plan (code).** Check schema, asset ids exist, durations sum correctly, text length fits the template. On failure, return the exact error list to Gemini and retry (max 2).
6. **Voice-over (code).** Text-to-Speech on the script, then `ffprobe` the length. Over 29 s: ask Gemini to shorten the script and redo. Run Speech-to-Text with word offsets and write `captions.json`.
7. **Preview stills (Remotion).** `renderStill` at the middle of each scene; upload PNGs to `workspace/previews/`.
8. **Critique (Gemini Flash, vision).** Show the stills; ask for concrete defects only (overlap, text cut off, low contrast, wrong crop). Gemini returns plan patches; apply and re-render stills. Stop after 3 rounds.
9. **Final render (Remotion).** `renderMedia`, H.264, CRF 20, yuv420p, 30 fps, concurrency equal to vCPU count.
10. **Mix and encode (FFmpeg).** Mux voice-over and music, duck the music under speech, normalise loudness to about -16 LUFS, set `faststart`.
11. **Automated QA (code).** `ffprobe`: duration 30 s ± 0.3, expected resolution, one video and one audio stream, no clipping. Optional: send the final MP4 to Gemini (it accepts video) for one last "anything broken?" pass.
12. **Deliver.** Write `outputs/final.mp4`, a poster frame and `plan.json`; set Firestore status `done` with a signed URL; the UI shows the player and a feedback box. A feedback message re-enters at step 4 with the current plan, so only changed scenes are re-rendered.

**Remotion worker calls (step 7 and 9)**

```ts
import {bundle} from '@remotion/bundler';
import {selectComposition, renderMedia, renderStill} from '@remotion/renderer';

// bundle ONCE at container start, reuse for every job
const serveUrl = await bundle({entryPoint: './src/index.ts'});

const comp = await selectComposition({serveUrl, id: 'Explainer', inputProps: plan});
await renderStill({composition: comp, serveUrl, inputProps: plan, frame: 45, output: 'prev/s1.png'});
await renderMedia({composition: comp, serveUrl, inputProps: plan, codec: 'h264',
                  crf: 20, concurrency: 4, outputLocation: 'out/video.mp4'});
```

Pass assets as short-lived signed GCS URLs inside `inputProps`, so the bundle never has to be rebuilt per job.

**FFmpeg mixdown (step 10)**

```bash
ffmpeg -y -i out/video.mp4 -i vo.mp3 -i music.mp3 -filter_complex \
 "[1:a]asplit=2[vo][vo2];[2:a]volume=0.35[m];\
  [m][vo2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[duck];\
  [vo][duck]amix=inputs=2:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
 -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -t 30 out/final.mp4
```

The filter values are a sensible starting point, not tuned numbers; adjust them by ear on your first few videos.

## 7. Agent loop and tool definitions

This is the code that replaces "what Claude's chat window does". Gemini on Vertex AI supports function calling: you declare tools as JSON schemas, the model replies with a `functionCall`, your code runs it and sends back a `functionResponse`. Use the unified `@google/genai` SDK in Vertex mode (verify the current method names in Google's docs when you implement).

**Tools to expose (typed and narrow, not a raw shell)**

| Tool | Arguments | Run by | Returns |
| --- | --- | --- | --- |
| `list_assets` | none | Code | asset ids, types, sizes, notes |
| `save_plan` | `plan` (scene plan JSON) | Code | OK, or the list of validation errors |
| `generate_voiceover` | `script`, `voice` | TTS + STT | audio length, caption file path |
| `render_preview` | `frames[]` | Remotion | PNG paths (also attached as images) |
| `render_final` | none | Remotion | video path, render seconds |
| `mix_audio` | `music_id`, `duck_db` | FFmpeg | final path, loudness |
| `run_qa` | none | ffprobe | pass or the list of failed checks |
| `finish` | `summary` | Code | ends the loop |
| `write_file`, `run_command` | path + content, or an allowlisted command | Sandbox | Escape hatch for custom scenes; off in v1 |

**Loop skeleton (TypeScript)**

```ts
import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({vertexai: true, project: PROJECT, location: 'global'});

async function runJob(job) {
  const contents = [{role: 'user', parts: [{text: briefAndPlaybook(job)}]}];
  for (let turn = 0; turn < MAX_TURNS; turn++) {            // e.g. 25
    const res = await ai.models.generateContent({
      model: process.env.PLANNER_MODEL,
      contents,
      config: {systemInstruction: SYSTEM, tools: [{functionDeclarations: TOOLS}], temperature: 0.4},
    });
    const calls = res.functionCalls ?? [];
    contents.push(res.candidates[0].content);
    if (!calls.length) break;                                 // model answered in text: stop
    const results = [];
    for (const c of calls) {
      await progress(job, c.name);                            // Firestore update for the UI
      const out = await dispatch(job, c.name, c.args);        // runs the real tool, never throws
      results.push({functionResponse: {name: c.name, response: out}});
      if (out.imagePaths) results.push(...imageParts(out.imagePaths));  // let the model SEE stills
      if (c.name === 'finish') return out;
    }
    contents.push({role: 'user', parts: results});
  }
  throw new Error('turn limit reached');
}
```

**Rules that make the loop safe and cheap**

- `dispatch` catches every error and returns it as data (`{ok:false, error:"..."}`) so the model can fix its own mistake, which is exactly what you see Claude do when a command fails.
- Hard caps: max turns, max preview rounds (3), max wall-clock per job, max tokens per job. Write the running total to Firestore.
- Every tool is idempotent and keyed by `jobId + step`, so a retried Cloud Task does not re-render or re-bill.
- Keep the context small: send asset notes and the current plan, not full tool logs; summarise old turns after about 15.
- If you ever enable `run_command`, run it in a separate sandbox container (gVisor-based Cloud Run is fine) with no network egress and an allowlist of binaries.
- Put the "playbook" (safe margins, caption size, pacing, scene count, banned patterns) in `SYSTEM`. It is the closest equivalent of Claude's skills.

## 8. Data model, APIs and web UI

**Firestore: `jobs/{jobId}`**

```json
{
  "ownerId": "uid",
  "status": "queued | analyzing | planning | voice | previewing | rendering | mixing | qa | done | failed",
  "brief": {"topic": "", "audience": "", "tone": "", "aspect": "9:16", "brandColors": ["#..."], "cta": ""},
  "planVersion": 3,
  "progress": {"step": "previewing", "message": "Checking scene 2", "percent": 55},
  "usage": {"inputTokens": 0, "outputTokens": 0, "renderSeconds": 0},
  "outputs": {"video": "gs://.../final.mp4", "poster": "gs://.../poster.jpg"},
  "error": null,
  "createdAt": "", "updatedAt": ""
}
```

Subcollections: `jobs/{jobId}/plans/{version}` (every scene plan, so undo is free) and `jobs/{jobId}/events/{n}` (one line per tool call, drives the progress feed).

**API (Cloud Run, behind your site's auth)**

| Method and path | Purpose |
| --- | --- |
| `POST /api/jobs` | Create job from brief, return `jobId` |
| `POST /api/jobs/:id/upload-urls` | Signed PUT URLs for raw assets |
| `POST /api/jobs/:id/start` | Enqueue Cloud Task |
| `GET /api/jobs/:id` | Job document (UI also subscribes to Firestore directly) |
| `POST /api/jobs/:id/feedback` | Natural-language change request, re-enters at planning |
| `POST /api/jobs/:id/cancel` | Stop the loop, keep files |
| `GET /api/jobs/:id/download` | Short-lived signed URL for the MP4 |

**UI screens**

1. **New video:** drag-and-drop uploader (images, logos, clips, optional music), brief form, aspect ratio picker, "Generate".
2. **Progress:** step list driven by `status` and the events feed, plus preview stills as they appear. This is your version of Claude's task-list widget.
3. **Result:** video player, download button, scene list from the plan with a feedback box per scene ("shorter", "swap image").
4. **History:** past jobs, re-open and branch from any plan version.

**Auth and tenancy.** Use Firebase Auth or Identity Platform; every Storage path and Firestore document is scoped by `ownerId`, and security rules enforce it.

## 9. Security, cost, limits and licensing

**Security**

- **Prompt injection through assets.** Text inside an uploaded image or a caption file can try to instruct the model. Keep tools narrow, validate every plan against the schema, and keep `run_command` off in v1.
- **Isolation.** The render worker has no inbound access except from the agent loop, and egress limited to Vertex AI, Cloud Storage and the speech APIs (VPC egress controls).
- **Signed URLs** expire in minutes; buckets are private; uploads are size and type checked (images, MP4, MP3 only; cap per file and per job).
- **Abuse and spend.** Per-user daily job quota, per-job token and render-second caps, and a Cloud Billing budget alert with a kill switch that pauses the queue.

**Cost model (measure, do not guess)**

Cost per video = Gemini input and output tokens (images count as tokens) + TTS characters + Speech-to-Text seconds + Cloud Run vCPU and memory seconds for the render + storage and egress. Run 10 representative jobs, log the `usage` field from section 8, and price from the real averages using Google's current Vertex AI and Cloud Run pricing pages. The two levers with the most effect are the number of critique rounds and the render resolution and concurrency.

**Limits to plan around**

- Cloud Run allows up to 8 vCPU and 32 GiB per instance (figures from Remotion's Cloud Run docs; confirm in Google's quotas page). A 30 s 1080p render fits comfortably; 4K does not need to be in v1.
- Remotion renders about as fast as its frame complexity and CPU allow; heavy blur, large images and many simultaneous videos slow it. Pre-resize images in step 2.
- Fonts: install every font you use in the image, or the render silently falls back to a default.

**Licensing (check before you charge users)**

- **Remotion** has its own licence: free for individuals and very small companies, a paid company licence above that, and Remotion's docs state cloud rendering for companies is billed per rendering seat. Read remotion.pro/license and decide where your business falls; this is the most likely surprise in the project.
- **FFmpeg** is LGPL or GPL depending on the build; calling it as an external binary is the normal, safe route.
- **Music, fonts and stock images** need commercial licences. Let users upload their own, and ship only royalty-free tracks you have verified.
- **Voices:** read Google's terms for commercial use of generated speech before offering it in a paid product.

I am not a lawyer; treat this as a checklist, not advice.

## 10. Milestones, risks and open questions

Build the quality first on your laptop, then wrap it in cloud and UI. The week counts are my rough estimates for one developer, not commitments.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| M0: Local spike (about 1 week) | Node script: assets folder + brief in, MP4 out. Gemini planner with schema output, 2 to 3 Remotion templates, TTS, FFmpeg mix | 5 test briefs produce watchable 30 s videos with no manual fixes |
| M1: Critique loop (about 1 week) | Preview stills, Gemini vision critique, plan patches, QA checks | Defect rate on the 5 briefs drops measurably versus M0 |
| M2: Cloud backend (about 2 weeks) | Dockerfile, Cloud Run worker, Cloud Tasks, Firestore status, GCS layout, service accounts | A job started by `curl` finishes in the cloud and resumes after a forced crash |
| M3: Web UI (about 2 weeks) | Upload, brief form, progress panel, player, download, auth | A non-technical user makes a video unaided |
| M4: Feedback and hardening (about 2 weeks) | Per-scene feedback, plan versions, quotas, budget alarms, licence decision | 20 real jobs, cost per video known, no stuck jobs |

**Top risks**

- **Quality gap versus a frontier coding model.** Mitigation: templates plus schema (section 5); measure on your own briefs before choosing a tier.
- **Render time and cost** grow with scene complexity. Mitigation: pre-resized assets, tuned concurrency, cache the Remotion bundle, one render per instance.
- **Remotion licence** blocks commercial launch. Mitigation: decide in M0, not M4.
- **Preview-model churn.** Gemini 3.x entries are partly preview and model IDs change. Mitigation: env-var model IDs and a regression set of 5 briefs run on every model change.

**Open questions for you**

- [ ] Output formats: 9:16 only, or 16:9 and 1:1 as well?
- [ ] Is this a public tool with user accounts, or only for your own use?
- [ ] Voice-over in English only, or Hindi as well? (This changes the TTS voice, caption fonts and the Speech-to-Text setup.)
- [ ] Do users bring their own music, or do you ship a royalty-free library?
- [ ] Should generated video clips (Veo) ever be mixed in, or is v1 strictly your uploaded assets?

# Part 2: Reference-driven videos on Google's stack

The new job type is: **"make a video like this one, but with my story and my assets."** The user supplies a reference video, a story or brief, and optionally files. Your system turns the reference into a reusable **style blueprint** and then builds a new video from the user's material. Part 1 (sections 1 to 10) stays the foundation: same Cloud Run services, same Remotion render worker, same agent loop. Part 2 adds three things on top of it: a deconstruction step, a scene router, and Google's generative models for scenes you cannot film or compose from the user's files.

## 11. The reference-to-video flow

&#91;embedded content: reference-to-video flow · 3 stages, 3 scene sources\]

The blueprint holds the reference's *structure and style* (pacing, scene types, caption look, shot types), never its footage, voice or music. The user's story and assets provide all the content. A format preset (section 14) decides which scene sources are allowed, for example a faceless Shorts channel allows generated clips while a SaaS explainer allows only screen capture and composed UI.

**One job, end to end**

1. User picks a format preset, pastes a reference link or uploads the reference, writes the story, uploads assets.
2. Gemini watches the reference and the code measures it; together they write the blueprint (section 12).
3. Gemini Pro adapts the blueprint to the user's story and assets, producing a scene plan with a **source** for every scene.
4. The router sends each scene to the right producer: Remotion templates, Veo or an image model, or a capture step.
5. Voice, music and captions are made, everything is assembled in Remotion, and FFmpeg does the final mix, as in section 6.
6. The critique loop (section 6, step 8) checks stills against the blueprint's rules, so the result stays close to the reference's look.

## 12. Deconstructing the reference

Gemini can take a video as input (from a Cloud Storage URI, the File API, or a public YouTube URL) and answer with timestamps. Use it for what needs judgment, and use code for every number. Where the two disagree on a measurement, the code wins.

| What you need | Who measures it | How |
| --- | --- | --- |
| Cut points, shot lengths, cuts per minute | Code | FFmpeg scene detection (`select='gt(scene,0.3)'`) or PySceneDetect; one keyframe per shot saved to Cloud Storage |
| Resolution, fps, aspect, duration, loudness | Code | `ffprobe` and FFmpeg `loudnorm` analysis |
| Words per minute, caption timing | Code | Speech-to-Text with word offsets |
| Music tempo | Code | `librosa` beat tracking (optional) |
| Colour palette per shot | Code | Quantise the keyframes (Pillow or ColorThief) |
| Shot type (talking head, b-roll, screen recording, text card, product close-up), camera motion, transition style | Gemini, video input | Ask for one record per shot with timestamps, via a response schema |
| On-screen text look: position, weight, animation, highlight style | Gemini, video + keyframes | Same call |
| Story beats: hook, problem, solution, proof, call to action | Gemini | Ask for beat names with start and end times |
| Voice and music character (pace, tone, mood) | Gemini, audio understanding | Ask for descriptions, not for the track itself |
| Rules that make this reference work ("question in first 2 seconds", "no shot over 3 s") | Gemini Pro | Reads all of the above and writes 5 to 10 checkable rules |

**Practical notes**

- Gemini samples video at a low frame rate by default, so very fast Shorts can lose cuts. Pass a higher frame rate, or send the 3 to 5 second sections you care most about as separate clips (check the current video-understanding docs for the exact parameter).
- Video costs tokens by the second. A third-party summary puts it at roughly 300 tokens per second of video at default settings; check Google's pricing page and measure on a real 60 s reference.
- Keep the reference under about 3 minutes in v1. Refuse or trim longer ones.

**The blueprint (what this step saves as `blueprint.json`)**

```json
{
  "meta": {"duration_s": 34, "aspect": "9:16", "fps": 30, "format_guess": "faceless_short"},
  "structure": [
    {"beat": "hook", "start": 0, "end": 3, "purpose": "surprising question over fast b-roll"},
    {"beat": "body", "start": 3, "end": 28, "purpose": "3 facts, one visual per fact"},
    {"beat": "cta", "start": 28, "end": 34, "purpose": "follow prompt over product shot"}
  ],
  "pacing": {"avg_shot_s": 1.8, "cuts_per_min": 33, "words_per_min": 165},
  "shots": [
    {"t": [0, 1.6], "type": "b-roll", "camera": "slow zoom in", "transition": "hard cut",
     "text": {"present": true, "position": "center", "style": "bold caps, keyword highlighted"}}
  ],
  "captions": {"style": "word-by-word pop", "position": "lower third", "max_words_per_line": 3},
  "voice": {"pace": "fast", "tone": "curious"},
  "music": {"mood": "tense lo-fi", "bpm": 98, "ducks_under_voice": true},
  "palette": ["#0B0B0F", "#FFD400", "#FFFFFF"],
  "rules": ["Open with a question in the first 2 s", "No shot longer than 3 s", "Keyword highlighted in every caption line"]
}
```

`rules` is the most useful field. The critique step in section 6 reads it and checks the new video's stills and timing against each rule.

**What deconstruction cannot recover:** the exact font, the exact music track, and the prompts or software that made the original. The blueprint describes a look closely enough to rebuild it from your own templates, fonts and licensed music.

## 13. Which Google service does which job

Everything below is callable from your Cloud Run services with a service account, and billed on one Google Cloud invoice. Model names change often, so each row names the family; confirm the exact ID in Model Garden and keep it in an env var.

| Job in the pipeline | Google service | What it does here |
| --- | --- | --- |
| Watch the reference, write the blueprint, adapt the story, write the scene plan, critique stills | Gemini (Pro and Flash tiers) on Vertex AI | Multimodal in (video, image, audio, text), structured JSON out, function calling for the agent loop |
| Fact-check a story or pull current facts | Gemini grounding with Google Search | Optional, for explainers that state facts or prices |
| Shot and text detection on the reference (cross-check) | Video Intelligence API | Shot change, on-screen text and label detection; useful as a second opinion on Gemini |
| Generated video scenes (b-roll, abstract visuals, product beauty shots, camera moves from a still) | Veo on Vertex AI | Text-to-video and image-to-video; Veo 3 is generally available and clips are about 8 seconds, so scenes are short; a Veo 3.1 preview and a newer Gemini-based video path also appear in Google's docs |
| Generated or edited images (backgrounds, product-on-scene, thumbnails, scene keyframes) | Gemini image models ("Nano Banana" line) and Imagen | Text-to-image and edit-with-reference; use the output as a keyframe for Veo image-to-video |
| Music | Lyria on Vertex AI | Generates a track from a mood and tempo description; alternative is a licensed library |
| Voice-over | Cloud Text-to-Speech (including Chirp 3 HD voices) or Gemini TTS | Many languages, including Hindi |
| Caption timing | Speech-to-Text (Chirp) | Word-level timestamps |
| Assembly of scenes, text, captions, UI | **Not Google**: Remotion + FFmpeg in your container | Google models make clips and audio; they do not compose layered graphics with exact text |
| Long jobs and retries | Cloud Tasks, plus Cloud Workflows for the multi-step graph | Veo and other generation calls are long-running operations you start and poll |
| Storage, state, auth, secrets, logs | Cloud Storage, Firestore, Firebase Auth, Secret Manager, Cloud Logging | As in sections 4 and 8 |
| Usage and cost analytics | BigQuery (billing export) | Cost per video, per format, per user |

**What this changes versus Part 1**

- Part 1 used Gemini as planner and critic. Now Gemini also does the *watching*, and Veo and the image models supply footage you do not have.
- Google's naming moves quickly (docs now also appear under "Gemini Enterprise Agent Platform"). Treat model and product names here as labels to look up, not as final IDs.
- Put one `google.ts` wrapper module between your code and every Google API, so a renamed model or a changed request shape is a one-file fix.

## 14. Format presets

A preset is a small config file that tells the system what a good video of this kind needs: which scene sources are allowed, aspect ratio, length, required inputs and extra review steps. The user picks a preset and supplies a reference; everything else follows from sections 11 to 13. Build the five below as separate template sets on one engine, not as five products.

| Preset | User supplies | Scene sources | Format | Main risk and the control |
| --- | --- | --- | --- | --- |
| **Faceless YouTube Short** | Topic or script, optional images, a reference Short | Veo and image-model b-roll, composed kinetic captions, voice-over, music | 9:16, 20 to 60 s | Repetitive, mass-produced output can violate YouTube's channel policies, and realistic synthetic content may need disclosure. Vary templates and voices, and read YouTube's current policies before launch. |
| **Treatment explainer** (clinic or procedure; I assume this meaning, tell me if you meant something else) | Procedure steps, diagrams, clinic brand, approved wording | Composed 2D animation and diagrams in Remotion, user's own images, voice-over, captions | 16:9 or 9:16, 45 to 90 s | Medical accuracy. Never let a model invent anatomy or claims; require the user to confirm the script and show a "reviewed by" step. |
| **Real-estate 3D explainer** | Floor plans, renders, photos, price, location, specs | Veo image-to-video for camera moves over real images, Ken Burns motion in Remotion, optional 3D scene via `@remotion/three`, map and spec overlays | 16:9 and 9:16, 30 to 60 s | Generated video can invent rooms or features. Use it only for camera motion on supplied images, add an "illustrative" label, and require human review. |
| **D2C product demo** | Product photos and clips, brand kit, offer, reference ad | Real product cut-out composited over generated backgrounds, Veo image-to-video from a product keyframe, Remotion price and offer overlays | 9:16 and 1:1, 15 to 30 s | Generated models distort labels and logos. Never regenerate the product; composite the real packshot over generated scenes. |
| **SaaS explainer** | Product URL and demo login, or screen recordings; brand kit; story | Screen capture (Playwright in a container), Remotion UI zooms and callouts, composed text scenes, voice-over | 16:9, 30 to 90 s | Generated video garbles UI text, so do not use it for the product itself. Use a demo account, blur any personal data on screen. |

**Preset file (example)**

```json
{
  "id": "faceless_short",
  "aspect": "9:16",
  "max_seconds": 60,
  "allowed_sources": ["compose", "image", "veo_i2v", "veo_t2v"],
  "required_inputs": ["story"],
  "optional_inputs": ["assets", "music"],
  "templates": ["kinetic_caption", "fact_card", "broll_with_caption", "cta_end"],
  "review_steps": ["critique_vs_blueprint_rules"],
  "label_synthetic": true
}
```

The real-estate and treatment presets add a `"human_approval": true` review step before the final render; the SaaS preset adds `"capture"` to `allowed_sources` and removes the Veo sources.

## 15. Scene router, async generation and cost control

**Scene plan v2.** Every scene now names its source. Code, not the model, decides how each source is produced.

```json
{
  "scenes": [
    {"id": 1, "frames": [0, 90], "source": "veo_i2v",
     "keyframe_prompt": "close-up of a hand pouring coffee, warm morning light, no text",
     "motion_prompt": "slow push-in, steam rising", "clip_seconds": 4,
     "overlay": {"template": "kinetic_caption", "text": "You are brewing it wrong"}},
    {"id": 2, "frames": [90, 210], "source": "compose",
     "template": "fact_card", "asset": "asset_07", "text": "92 C is the sweet spot"},
    {"id": 3, "frames": [210, 300], "source": "image",
     "keyframe_prompt": "product bag on wooden counter, soft window light",
     "reference_assets": ["asset_01"], "motion": "ken_burns_in"}
  ]
}
```

**Router rules (all in code)**

1. Reject any scene whose `source` is not in the preset's `allowed_sources`.
2. `compose` goes straight to Remotion. `image` calls the image model, then Remotion adds motion. `veo_i2v` first makes a keyframe image, then starts a Veo job from it. `capture` runs the screen-capture step.
3. If a Veo job fails or is blocked by a safety filter, fall back to the scene's keyframe with Ken Burns motion in Remotion, and log it. The video still finishes.
4. All text is added in Remotion, never generated inside an image or clip, because generated text is unreliable.

**Async generation**

- Veo calls are long-running operations: start, store the operation name in Firestore, poll with backoff. Run all scenes in parallel (fan-out), then wait for all (join) before the render. Cloud Workflows handles this fan-out and join well; the agent loop can also do it with Cloud Tasks.
- Clips are about 8 seconds at most, so a scene longer than that needs two clips or a hold plus slow zoom. Normalise every clip with FFmpeg to the preset's size and fps, trim to the scene length, and limit speed changes to about 15 percent so motion still looks natural.
- Veo 3 can generate its own audio. Discard it and use your voice-over and music so every format sounds consistent.
- Request quota increases early; Veo has low per-minute request quotas by default.

**Consistency across scenes**

- Put the blueprint's palette, lighting and lens words into one "style lock" string and prepend it to every keyframe prompt.
- Pass the same reference images (product, logo, place) to every image call. For continuity, start the next clip from the last frame of the previous one where the model supports it.
- Gemini writes the prompts, but your code assembles the final string from fixed parts (subject, action, camera, light, style lock, "no text").

**Cost control (generation is the expensive part)**

- **Storyboard gate:** generate cheap keyframe images first and show them to the user as a storyboard. Start Veo only after approval. This one rule prevents most wasted spend.
- Use the faster, cheaper Veo variant for drafts and the full model only for the approved final.
- Cache every generated asset by a hash of prompt, reference and parameters; a re-render after a text change must not regenerate clips.
- Cap generated seconds per job and per user per day; record seconds, images and tokens in Firestore `usage` and export billing to BigQuery.
- Veo is billed per second of video; read the current Vertex AI pricing page and compute cost per finished video from the real numbers on your first 10 jobs.

## 16. Originality guardrails and Part 2 milestones

"Make it like this reference" is legitimate when it copies structure and style, and risky when it copies content. Build the guardrails into the product, not into a policy page.

**Guardrails**

- **Blueprint stores structure, not content.** Its fields describe purposes ("surprising question"), never the reference's actual sentences. Delete the reference transcript after the blueprint is written.
- **Similarity checks before delivery.** Compare keyframe hashes of the new video against the reference's keyframes, and compare the new script against the reference transcript with a text-embedding model. Flag anything above a threshold you tune on your own test set, and block or rewrite.
- **No copied voice, music, characters, logos or footage** from the reference. The new video uses the user's assets, generated scenes, your templates and licensed or generated audio.
- **How references arrive.** Accept an upload, or a public YouTube link passed to Gemini directly. Do not build a server-side downloader for video platforms; it usually breaks their terms. Store the user's confirmation that they have the right to use the reference and the assets.
- **Synthetic media.** Keep Veo's built-in watermark, add an on-screen or description label where the preset says so, and never generate a real person's likeness.
- **Claims.** Treatment and real-estate videos make factual claims; keep the human approval step in section 14 mandatory.

I am not a lawyer. Have one review your terms of service and the originality policy before you sell this.

**Part 2 milestones (rough estimates for one developer, on top of Part 1)**

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| P2-A: Deconstruct (about 1 week) | Scene detection, `ffprobe` stats, Gemini video analysis, blueprint JSON and rules for 5 references | A human reads each blueprint and agrees it describes the reference |
| P2-B: Adapt and compose (about 1 to 2 weeks) | Adapt step, scene plan v2, compose-only render using your templates | Same story rendered with 3 different references looks clearly different |
| P2-C: Generate (about 2 weeks) | Image keyframes, storyboard gate, Veo image-to-video, fallback to Ken Burns, caching | A job survives a Veo failure and re-render does not regenerate clips |
| P2-D: Presets 1 and 2 (about 2 weeks) | Faceless Short and D2C product demo presets, similarity checks | 10 real jobs, cost per video known, no flagged copies shipped |
| P2-E: Harder presets (about 3 weeks) | SaaS capture, real-estate, treatment, human approval screen | One reviewed video per preset |

Start with the faceless Short and the D2C demo: both lean on generated scenes and tolerate small errors. The SaaS preset needs the most new engineering (browser capture), and real-estate and treatment need the review screen before they are safe to sell.

**More open questions**

- [ ] Reference input: uploads only in v1, or public YouTube links too?
- [ ] Which two presets do you want first?
- [ ] For "treatment explainer": clinic procedures (my assumption), or something else?
- [ ] Will you offer this publicly, or use it for your own agency work first? (Public use needs the terms, attestation and similarity checks live on day one.)
