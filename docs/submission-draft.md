---
title: Outwards Days — make a little room for outside
tags: devchallenge, hf26challenge, ai, opensource
published: false
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).*

## What I Built

Outwards Days helps someone with a crowded week find a realistic reason to go outside. It starts with their actual schedule: work, busy blocks, lunch gaps, preferred times, travel limits, and the days they really have free. It can suggest a short walk or a little garden care on a workday, then make room for a longer outing when the whole day allows it. The goal is to make the screen the shortest part of the experience.

Each suggestion has a time budget that includes preparation and travel, a category, and a concrete activity. When place data is available, it can name a nearby destination instead of saying only “go to a park.” Small missions can ask for an observation, a written reflection, a simple action, or a photo. For a photo mission, the person can choose another visible subject if the original is not on the route. Completed places, categories, missions, and notes help vary future plans; a return to the garden might ask how an earlier planting has grown.

People can review a proposed week, accept or move an outing, and record what actually happened. Guest profiles can be upgraded to an email/password account so their server-side schedule, plans, and history follow that account.

## Demo

[Watch or download the narrated demo (MP4)](https://github.com/quangvinhlee/Outwards-Days/blob/main/docs/video/outwards-days-full-narrated.mp4)

The 40-second video shows the Android emulator: preferences, schedule review, the generated week, outing budgets and missions, nearby places, and progress. It uses the local backend and model. It does **not** show a hosted browser deployment, a live model request being generated on camera, or a real outdoor trip. The browser release has been prepared and tested locally, but it has not yet been verified at a public URL. A physical-phone camera-to-verdict test and a real outdoor trial are still outstanding.

## Code

[Source code and local setup](https://github.com/quangvinhlee/Outwards-Days) · [Architecture](https://github.com/quangvinhlee/Outwards-Days/blob/main/docs/architecture.md) · [Recorded evaluation](https://github.com/quangvinhlee/Outwards-Days/blob/main/evals/results.json)

The repository includes the Expo app, Fastify API, deterministic scheduler, Mastra workflow, tests, evaluation data, and deployment guide. The intended public release is the browser app; the narrated walkthrough was captured from the Android build of the shared interface.

## How I Built It

The interface uses Expo and React Native. Fastify handles sessions, plans, acceptance, completion, and owner-scoped MongoDB data. A Mastra workflow gathers schedule, weather, place, and bounded history context, then asks **Gemma 4 E2B** through Ollama to choose and personalize eligible outdoor activities.

The model does not get to decide whether a suggestion fits. Code calculates the free intervals, travel allowance, duration, daylight, weather limits, and activity frequency. Model output is parsed and checked against those rules. If it fails, the workflow makes one repair attempt; if it still fails, the app labels its basic catalogue suggestions as a fallback. Acceptance checks the schedule again, since it may have changed after generation. This keeps an interesting suggestion from becoming a conflicting calendar commitment.

I recorded a small, five-case local evaluation with `gemma4:e2b`. Three cases attempted inference: two produced validated Gemma plans in 2.390 and 13.429 seconds, and one used the labelled basic fallback after two rejected attempts. Two infeasible cases correctly returned no activities without inference. This is functional evidence for those cases, not a reliability benchmark or proof of hosted performance.

The app can retain plans and queue completions locally. Stable event IDs make a repeated sync request idempotent on the server. [Salazar's discussion of offline retry failures](https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8) reinforced the value of keeping failed work visible; [this discussion of deterministic AI control](https://dev.to/rcortez056/why-probabilistic-ai-needs-deterministic-control-g8d) echoes the boundary between model suggestions and code-enforced rules. These are design references, not claims that Outwards Days implements their entire architectures.

## Why Does Open Innovation Matter?

Gemma is an open-weight model I can run through Ollama, inspect, and replace without outsourcing the planning decision to a closed API. Mastra and the scheduling code make the workflow and its limits visible. That separation matters here: the model can make an outing feel personal, while the program remains responsible for whether there is actually time to do it. The application code is MIT-licensed; Gemma has its own model terms.

This is not an offline AI app on the phone. Generating a new plan needs the backend and inference service, and weather and place discovery need network services. The browser stores a cached plan and completion queue while loaded, but it has no service worker to guarantee reopening offline. Native local reminders are not part of the browser release.

## Prize Categories

- **Best Use of Gemma:** Gemma 4 E2B supplies the activity choices and personalized wording. The repository includes the real Ollama integration, model digest, and local evaluation results.
- **Best Use of Mastra:** The planning workflow coordinates context gathering, model generation, validation, bounded repair, and a clearly labelled fallback.

Render, DigitalOcean, and MongoDB Atlas are planned for the hosted release, so I am not entering their categories on deployment plans alone. AI assistance was used in building the project and drafting this post.
