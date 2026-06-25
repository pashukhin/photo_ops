# E2E: Structured Logging + Trace Correlation

Preconditions: `make dev` and `make migrate` are running.

1. Sign up and upload a JPEG via the web app (or `make smoke-stack`).
2. Capture logs: `make logs > /tmp/photoops.logs` (or `make logs-svc svc=...`).
3. Pick one request's trace id:
   `grep -o '"trace_id":"[a-f0-9]\{32\}"' /tmp/photoops.logs | sort | uniq -c`
4. Confirm the SAME trace_id appears in api-gateway, identity-service, and
   photo-service lines, and that the photo→worker chain shares it
   (media-worker `trace_id` parsed from the job's `correlation_id`).
5. Confirm NO secrets: the following must return nothing:
   `grep -Ei '"(cookie|authorization|password|passwordHash|uploadUrl)":"[^\[]' /tmp/photoops.logs`
   (matches any value NOT starting with `[`, i.e. anything other than `[REDACTED]`;
   GNU `grep -E` has no PCRE lookahead, so this `[^\[]` form is used — same as `smoke-stack.sh`)
   and no raw `X-Amz-Signature` / presigned PUT URL appears.

Pass: one trace_id threads gateway → identity/photo → worker; no secret values
in any line.
