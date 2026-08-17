# OpportunityRadar production test plan

## User flow
- Open homepage
- Enter country, age, skills, student status
- Click Find my matches
- Confirm results are produced without relying on the live API
- Confirm browse filters work independently
- Confirm every displayed result shows a checkpoint pass
- Confirm official source opens in a new tab

## API
- /api/health returns online status and version
- /api/opportunities returns JSON and only published records
- /api/stats returns refresh/storage state
- API responses use no-store caching

## Verification gate
- bad source -> reject
- missing verification date -> reject
- closed opportunity -> reject
- expired deadline -> reject
- missing eligibility -> reject
- stale record -> review/reject from published index

## Automation
- scheduled handler runs every 6 hours
- source failure does not delete good data
- new/updated/unchanged/removed counts are recorded
- every update passes the checkpoint before publication

## Monetization safety
- ad slots must not cover the match CTA or official source links
- sponsorship/affiliate state must not affect match scores
- privacy/consent pages must remain reachable

## Global readiness
- country is optional
- geographic scope is explicit
- deadlines use timezone-aware ISO timestamps internally
- site remains usable without assuming USD, US education status, or US date format
