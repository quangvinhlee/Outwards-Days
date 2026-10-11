---
title: Outwards Days — make a little room for outside
tags: devchallenge, hf26challenge, ai, opensource
published: false
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).*

## What I Built

Outwards Days is an outdoor planner for people who want more time outside but have a busy week. I am preparing the browser version so judges can try it without installing an app. Instead of asking for another daily streak, it starts with the time you actually have. Confirm your schedule, review a small outdoor idea, accept it, and put the phone away.

A short workday gap can become a walk, outdoor reading, or time with your plants. A genuinely free day can support something longer. Plans include preparation and the journey home, rather than treating a 25-minute walk as the whole commitment. Optional photography, observation, and action missions give an outing a little purpose without making every moment a task.

## Demo

[TODO: add the verified public browser-app URL after deployment.]

[TODO: upload docs/video/outwards-days-full-stereo.mp4 to YouTube, Vimeo or Loom and insert its public URL here.]

The video is an Android emulator walkthrough of the existing saved plan: preferences, weekly schedule review, an explanation of the Gemma planning and validation workflow, the week view, outing time budgets and mini missions, nearby-place discovery, and progress history. An Australian English voice narrates the walkthrough, with captions. It is not a recording of fresh inference or a physical outdoor trip. The recording uses the local backend and model. The web deployment is prepared for Render (frontend and API), DigitalOcean (Gemma inference), and MongoDB Atlas (data), but no hosted flow has yet been verified. The video demonstrates the shared app design; it is not footage of the deployed browser version.

Physical-phone testing and a real outdoor trial remain unfinished. I cannot yet report what it felt like to use on a walk. Cached plans and an offline completion outbox are implemented; a full physical-device offline journey remains to be verified.

## Code

[Source and local setup](https://github.com/quangvinhlee/Outwards-Days)

The repository contains the Expo browser/mobile app, Fastify API, scheduler, tests, evaluation results, and setup instructions. This submission targets the browser release; no mobile install is required once the website is deployed. [Web deployment instructions](https://github.com/quangvinhlee/Outwards-Days/blob/main/docs/deployment.md) describe each hosted component. Prepared local changes must be pushed before those instructions appear in the public repository.

## How I Built It

The shared interface uses Expo / React Native. On the browser, localStorage retains the guest token, cached plans and queued completion. The native implementation uses SQLite and SecureStore. Native local reminders do not run in the browser, and the web app does not yet have a service worker for offline page reloads. The backend uses Fastify, MongoDB, Zod and Luxon. A Mastra workflow calls Gemma through Ollama.

The separation that mattered most was between choosing an activity and deciding whether it fits. The scheduler calculates available intervals and full time budgets. Gemma chooses and personalizes activities within those constraints. The backend validates the result, permits one repair attempt, and uses explicitly labelled basic catalogue suggestions if live inference is unavailable or fails validation. Acceptance checks the schedule again.

In the recorded five-case evaluation, three cases attempted inference: two produced validated Gemma plans and one used the basic fallback after two rejected attempts. The two live successes took 2.390 and 13.429 seconds. The fallback case took 2.730 seconds. Two infeasible cases correctly returned no activities without inference. This is a small functional sample, not a general reliability benchmark. The exact model was `gemma4:e2b`; its digest and case results are committed in `evals/results.json`.

## Why Does Open Innovation Matter?

Local inference makes the model endpoint something I can operate and inspect. I can change the model or workflow without rebuilding the scheduling rules. The Mastra sequence and validation code are visible, and the availability engine can be tested independently of model output.

This does not mean every feature runs offline on the phone. Generation needs the backend and inference service; weather and nearby-place lookups need their respective services. The browser can retain a plan and queue completion locally while the app is loaded; reopening the page offline is not yet guaranteed. Gemma is open-weight under Google's own terms, while the application code is MIT-licensed.

## My Agent Session

[Shared build session](https://chatgpt.com/s/cx_6acb6515866081918931f7a4499732dd)

[TODO: replace or supplement with the DevRelay session embed after importing the original transcript.]

## Prize Categories

- **Best Use of Gemma:** Gemma runs locally through Ollama to choose and personalize outdoor suggestions, with independently validated constraints and recorded inference evaluations.
- **Best Use of Mastra:** a Mastra workflow coordinates model planning, validation and a bounded repair/fallback sequence.

Render, DigitalOcean and MongoDB Atlas are intended deployment categories, pending a working hosted demonstration. They are not yet claimed. Optional SerpApi configuration does not establish successful usage. The video narration uses edge-tts, so I am not claiming ElevenLabs. A DevRelay session export alone does not establish Entire usage.

AI assistance was used to build the app and draft this post. All outdoor and device limitations above remain part of the submission.
