# Deployment preparation (not yet provisioned)

`infra/render.yaml` is a paid-service blueprint, not evidence of a deployment. Review costs, account quota and the desired availability window before creating resources.

1. Create/configure MongoDB Atlas and restrict network access to the API's outbound addresses. Set `MONGODB_URI` in Render's secret environment. Use a dedicated database.
2. Build the API from the repository root with `docker build -f apps/api/Dockerfile -t outsideweek-api .`. Configure the Render blueprint path as `infra/render.yaml`. Run one instance; the prototype worker has a concurrency of one per process.
3. On the inference host, install a supported Ollama build, keep `OLLAMA_HOST=127.0.0.1:11434`, set `OLLAMA_NUM_PARALLEL=1`, and pull `gemma4:e2b`.
4. Use `infra/inference/Caddyfile` with `INFERENCE_HOST` and a generated `OLLAMA_SERVICE_TOKEN` in the service environment. Configure DNS and firewall inbound HTTPS to the API's outbound ranges where possible. Ollama's raw port must not be publicly reachable. The proxy exposes only authenticated POST `/api/chat`; no model administration routes.
5. Set the matching HTTPS `OLLAMA_BASE_URL`, service token and model on the API. Optionally set `SERPAPI_API_KEY`. Never put these in Expo public variables.
6. Run the fixed tests and live evaluation against the exact model deployment. Record its digest, measured latency, repair and fallback rates. Check account access and GPU availability before treating cloud inference as available.
7. Set the mobile public API URL to the deployed HTTPS address. Build an Android internal-distribution APK via the `preview` EAS profile, or locally. iOS distribution needs appropriate Apple provisioning.
8. Follow the real-device/demo checklist. Publish only after verifying the deployed flow.

No cloud resources, billing configuration, public repository, store submission or challenge entry have been created by this implementation. GPU and hosting prices must be checked at provisioning; the older plan's estimates are not purchase authorization.
