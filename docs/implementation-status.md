# Implementation status

Updated on 11 October 2026. The original plan is preserved as the specification; this document records what the code actually does.

## Implemented

- pnpm monorepo with pinned Expo SDK 57 modules, shared Zod contracts, independent Luxon scheduler, Fastify API and Mastra workflow.
- Native onboarding, preference editing, weekly schedule editor, Today / Week / You screens and activity details.
- Redesigned Today, Week, You and outing detail screens with a local illustrated outdoor hero, compact activity cards, category-specific visual cues, clearer time/place/mission summaries, and larger accessible navigation targets. The illustration is decorative and does not claim to show a mapped destination.
- Explicit seven-day review, reusable work hours, sleep/overnight blocks, lunch gaps, preferred outdoor windows and local schedule drafts.
- Workday morning protection, wake and after-work buffers, conservative evening suggestions on weekdays with no work block, explicit full-day-off marking, optional early-morning preference, and earlier starts reserved for longer free-day outings. Existing accepted activities remain valid when a soft time preference changes.
- Guest and email/password sessions, guest-to-account upgrade, expiry/renewal, owner-scoped routes, compare-and-set versions, durable generation jobs with leases, and stale-publication protection. Password reset and email verification remain future work.
- Live Ollama structured-output adapter with one repair attempt and labelled basic fallback.
- Acceptance validation, replacement, rescheduling, conditions refresh, skip/complete/partly-complete, feedback, history and deletion.
- SQLite plan cache, completion outbox, pending outcome overlays, foreground/manual retry and retained permanent errors.
- Optional approximate foreground location, best-effort local reminders, Open-Meteo daylight/forecast summaries, OpenStreetMap nearby-place browser, parks/riverside discovery/eligible loop hikes, and optional SerpApi park results. Recent plan outcomes and place visits penalize repetition.
- Outdoor reading, movement, picnic, photography, garden care, walking and hiking templates; mapped gardens, squares and picnic sites when source data is available. Category labels are visible on week cards and activity details. Completed visits and mission IDs reduce repeated places and prompts. Every category can include a written observation or feeling; notes from earlier matching categories or places inform later prompts, including a garden growth check or a park return visit. Gemma sees bounded completed history and chooses a reflection style from server-defined options during live generation. Photo mini missions use optional camera capture and Gemma vision verification, with a selectable visible subject if the original is absent. Action missions remain manually checkable; short written reflection missions are saved with the outing completion.
- Docker/Render configuration, restricted inference proxy example, CI, setup/privacy/deployment documentation and an unpublished local submission draft.

## Verification

- TypeScript checks: passing for backend, packages, tests/evaluations and native app.
- Planner/API/workflow/file-store tests: 56 passing, with the dedicated MongoDB integration test skipped unless `TEST_MONGODB_URI` is set.
- Expo SDK dependency compatibility check: passing.
- Android and iOS JavaScript/Hermes exports: passing. This is not an iOS native-build or device-test claim.
- Native Android debug build and emulator onboarding, seven-day confirmation, live plan generation, Today card, detail breakdown and acceptance verified; offline queued completion and physical-device checks remain outstanding. An initial native launch crashed; three later cold starts preserved the accepted plan without a recorded app crash. The accepted plan remained visible during an airplane-mode foreground check. Continue testing on a physical device. See [accepted emulator screen](evidence/android-accepted.png).
- The Android emulator opened the nearby browser, saved manually entered approximate Melbourne coordinates when device location was unavailable, and displayed mapped parks from the authenticated API. See [nearby emulator screen](evidence/android-nearby.png). A real phone's location flow is still unverified.
- Authenticated local MongoDB read/write verified; data survived a container restart, repeated setup preserved credentials, and an incorrect password was rejected. Live HTTP smoke test passed guest creation, Gemma generation, acceptance, idempotent completion sync and deletion.
- Live Gemma 4 `gemma4:e2b` structured-output evaluation passed the work/lunch and forecast-backed longer-outing cases. The nearby-parks case returned a validated basic plan with three different mapped parks after two model attempts failed validation. Two infeasible cases correctly returned no activities. The longer outing was a 90-minute walk with a 120-minute total budget; this small sample does not establish general reliability. See `evals/results.json`.
- Local setup generates private environment files and persistent Docker MongoDB storage; no cloud service was provisioned.
- The 12–18 October Melbourne sample generated seven different sessions with Gemma: a photography outing, outdoor reading, movement, picnic, home garden care, a mapped loop hike and a walk. A synthetic potted-plant image was accepted as a plant and rejected as a bird by the installed Gemma vision model. The rebuilt Android app opened this saved week and displayed its mapped University Lawn outing and photo-mission subject picker on the emulator. The camera button remains locked until the outing is accepted and starts; an actual camera-to-verdict device session remains unverified.
- A saved Sunday garden suggestion was accepted on the Android emulator after its scheduled start; the app then displayed the whole-outing completion control. A real calendar overlap remains a validation error. Existing saved sessions retain their original mission list until suggestions are regenerated.
- The 12–18 October local sample week was regenerated with Gemma after the timing change: weekday sessions now start at 18:00, Saturday's hike at 08:00, and Sunday's walk at 09:00. That sample schedule has no recorded work blocks, so weekday evenings are conservative defaults rather than confirmed home times. The user should enter actual work, commute and full-day-off information before relying on the times.

## Remaining before a public/challenge demonstration

- Real physical-phone verification and an actual outdoor activity. Emulator checks cannot establish either.
- Paid provisioning, cloud deployment, public source publication, store distribution and challenge submission are separate later actions.
- Named loop hikes can be proposed when a route has a source-tagged distance and enough time/daylight; the user must confirm actual travel, access and route conditions. Other named/distant hikes remain discovery ideas. Public map coverage cannot guarantee every park, river or trail.
- Hourly weather, persistent weather/SerpApi caches, normalized long-term history collections, verified route directions/entrances, finer completion correction UI, explicit blocked-outbox resolution, reconnect-triggered background retry and comprehensive accessibility/device coverage remain follow-up work. OpenStreetMap place results already use a shared MongoDB cache.
- No claim of DigitalOcean, Render, MongoDB Atlas or SerpApi usage should be made from configuration alone. Record actual successful integrations in the demo.

See [architecture](architecture.md) for the prototype's explicit storage and job-runner tradeoffs, and [demo checklist](demo-script.md) for the remaining human verification.
