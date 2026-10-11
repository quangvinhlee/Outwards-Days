# Submission readiness — 11 October 2026

Target assumed from the existing draft: DEV Hacktoberfest Week 1, Touch Grass.
Rules: https://dev.to/challenges/hacktoberfest-week1-2026-10-05
Deadline: Monday 12 October 2026 at 17:59 Australia/Melbourne (06:59 UTC).
Entry is a published DEV post with devchallenge and hf26challenge tags; this is not an MLH project submission.

- Draft follows the official template in docs/submission-draft.md.
- Repository is publicly readable at https://github.com/quangvinhlee/Outwards-Days.
- Git history records initial project commits on 11 October, inside the challenge window. Confirm actual work began within the window; commit dates alone cannot prove that.
- Candidate prize categories: Gemma and Mastra, backed by implementation and recorded evaluations.
- Primary video: docs/video/outwards-days-full-narrated.mp4. Short voiced video: docs/video/outwards-days-demo-voiced.mp4. Upload and replace the video TODO before publishing.
- Original shared session could not be retrieved: attach/export its transcript to import it to DevRelay. Session sharing is optional for this challenge.
- Physical-device and outdoor testing remain unverified. An outdoor test is optional bonus evidence, not a completed result.
- Fill the website/video placeholders and resolve or remove the optional session TODO before final publication. Review factual claims and publish the DEV entry before the deadline.
- No challenge entry has been published or submitted by this work.
- Private DEV draft (AI disclosure: some_ai): https://dev.to/quangvinhlee/outwards-days-make-a-little-room-for-outside-1kmn-temp-slug-8115898/edit
- Video decoded without errors; dimensions 720 × 1920, H.264, duration 39.72 seconds.

## Browser release decision

The user selected web-only hosting on 11 October. Native distribution and EAS builds are out of the deployment scope. See docs/deployment.md for the full guide and docs/prize-category-audit.md for evidence needed before adding hosted categories.

Prepared: Render static-site blueprint, explicit SPA output and rewrite, public API origin validation at build time, API CORS origin configuration, inference systemd settings, and larger authenticated proxy requests for photo missions. The production web export passed. No cloud resources were created in this task, and no live URLs are claimed.

Pending external access: connect the Render, DigitalOcean and MongoDB Atlas integrations; confirm the inference hostname and GPU budget/availability window. Accounts exist according to the user, but integrations have not been confirmed connected.

## Local deployment verification

- Production web export passed with the sample HTTPS origin `https://api.example.com`; this is a build-validation placeholder, not a live service. The build clears Metro cache and checks the exported bundle contains the requested origin.
- Chromium tested the production static export with requests forwarded to the local API: onboarding saved preferences, schedule navigation worked, and reloading `/schedule/2026-10-05` succeeded through a SPA fallback. No page JavaScript errors were observed. The temporary guest was deleted afterward. Screenshot: `docs/evidence/web-deployment-preview.png`.
- API Docker build passed. A temporary production-mode container passed `/healthz`; the configured browser origin received CORS authorization and a different origin did not. The container was removed after verification. This does not establish remote Atlas access or hosted Gemma inference.
- Both Render blueprints validated against Render's schema; the inference Caddy configuration validated with Caddy 2. Typecheck passed.
- The existing private DEV draft was updated with the browser release, intended deployment architecture, platform limits and supported category claims. It remains unpublished with AI disclosure `some_ai`.
