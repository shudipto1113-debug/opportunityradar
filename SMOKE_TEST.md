# OpportunityRadar deployment smoke test

Run these checks after each Cloudflare deployment:

1. `/` returns the OpportunityRadar page.
2. `/api/health` returns JSON with `status: online`.
3. `/api/opportunities` returns JSON with an `opportunities` array.
4. `Find my matches` works using the embedded verified fallback even when the API is unavailable.
5. A result must show `CHECKPOINT PASSED` before recommendation.
6. Official-source links must open HTTPS URLs on approved source domains.
7. `/api/stats` reports KV/log configuration and the latest refresh metadata.
8. The scheduled worker refresh must update `META:last-refresh` and not publish records that fail the checkpoint.

Current deployment URL: https://opportunityradar.shudipto1113.workers.dev/
