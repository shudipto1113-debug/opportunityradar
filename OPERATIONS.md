# OpportunityRadar Operations

## Runtime architecture
- Cloudflare Worker: `worker.js`
- Static assets: `public/`
- Scheduled refresh: every 6 hours via `wrangler.jsonc`
- Persistent opportunity store: KV binding `OPPORTUNITIES`
- Verification/audit log: KV binding `OPPORTUNITY_LOG`
- Refresh metadata: KV binding `META`

## Public endpoints
- `/api/health` — runtime + last refresh metadata
- `/api/opportunities` — only checkpoint-passing opportunities
- `/api/stats` — refresh/storage status; never returns credentials or raw secrets

## Safety model
The refresh agent is source-first and fail-closed. Records are not published as recommendations unless they have an approved source, verification date, open status, and valid future deadline when one is required. Stale records are held for review.

## Refresh behavior
The current autonomous adapter starts with Grants.gov. Additional official source adapters should be added one at a time and must reuse the same normalization + checkpoint path. AI is enrichment only; it must never fill a missing source fact or override an official rule.

## Deployment
Cloudflare Git integration deploys commits from `main`. After a commit reaches `main`, verify the deployment build is green before treating the new version as live.
