# OpportunityRadar — one-time Cloudflare storage setup

The website can serve the verified bootstrap dataset without storage, but the autonomous agent needs persistent storage to publish refreshed opportunities.

## Create two KV namespaces

Cloudflare Dashboard → Workers & Pages → KV → Create namespace.

Create:
1. `OPPORTUNITYRADAR_OPPORTUNITIES`
2. `OPPORTUNITYRADAR_LOG`

Then bind them to the `opportunityradar` Worker:
- `OPPORTUNITIES` → `OPPORTUNITYRADAR_OPPORTUNITIES`
- `OPPORTUNITY_LOG` → `OPPORTUNITYRADAR_LOG`

Also create a small KV namespace/key binding for refresh metadata:
- `META` → the same `OPPORTUNITYRADAR_LOG` namespace is acceptable.

The application already checks whether these bindings exist; without them it falls back to the source-checked bootstrap dataset.

## Why KV

The free plan currently includes 100,000 KV reads/day, 1,000 writes/day, and 1 GB storage. The refresh agent is intentionally bounded so the initial system stays inside free-tier limits.

Do not add billing or upgrade the Workers plan for this setup.
