---
title: OutsideWeek — a little room for outside
tags: devchallenge, hf26challenge, ai, opensource
published: false
---

# What I built

OutsideWeek is a native mobile planner that starts with the week you actually have. A busy Saturday might get a small break; a free weekday can support a longer outing. The app asks you to confirm your availability each local week, then proposes outdoor activities within that schedule.

# How it works

A deterministic scheduler calculates eligible intervals, including sleep, commute, explicit lunch breaks and accepted plans. A Mastra workflow asks self-hosted Gemma to choose and personalize activities from a small catalogue. Zod checks the response shape; scheduling code separately checks interests, equipment, effort, daylight and the full preparation/travel/activity/return budget. Invalid output gets one repair attempt and then an honestly labelled basic fallback.

The Expo app saves plans in SQLite and queues offline completion events with stable IDs. The backend owns acceptance and progress, so retries cannot create extra completed activities.

# Why open matters

The model runs through Ollama and can be hosted locally or on infrastructure we control. Mastra makes the planning sequence inspectable. The availability engine can be tested without inference. Gemma is open-weight under its own terms; it is not MIT-licensed. Application code has a separate MIT license.

# Demo and source

[TODO: add public source URL, working native demo recording, setup instructions and exact deployed components. No deployment or publication is implied by this draft.]

# Real outdoor test

[TODO: record an actual short outdoor activity on a real phone. Include what was useful, what failed, and a truthful outcome.]

# Evaluation

[TODO: copy measured model digest, latency, rejection/repair/fallback rates from evals/results.json and describe the small sample size. Do not treat fallback plans as successful live AI generation.]

# Partner technology actually demonstrated

[TODO: list only the providers that worked in the recorded demo. In particular, do not claim DigitalOcean, Render, Atlas or SerpApi deployment from configuration files alone.]

AI assistance was used to build and draft this project. This file is a local draft and has not been posted to DEV. Verify the current challenge template before publishing.
