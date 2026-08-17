# OpportunityRadar Autonomous Agent

The agent keeps the opportunity database current while obeying the pre-result verification gate.

## Cadence
- Run every 6 hours with Cloudflare Cron Triggers.
- Cron expressions are UTC; the user-facing site converts deadlines to the visitor's local timezone.

## Pipeline
1. Discover from approved official APIs/pages.
2. Fetch official detail records.
3. Normalize dates, award values, eligibility, geographic scope and source metadata.
4. Compare with the previous stored version.
5. Detect meaningful changes: deadline, status, prize, eligibility, source-update timestamp.
6. Run deterministic validation.
7. Run the pre-result verification gate.
8. Save only PASS records into the recommendation store.
9. Keep NEEDS_REVIEW records separate from recommendations.
10. Reject failed records from user results.
11. Optionally use Workers AI for classification, concise summaries and category tags.
12. Never use AI to invent missing facts or override source-backed rules.
13. Record refresh time and source timestamp.

## Global behavior
The agent must search multiple geographic scopes rather than defaulting to one country. Every source adapter emits an explicit geographic scope.

## Change handling
If a published record changes, replace it only after re-verification and record the previous facts in a change log. Re-run the checkpoint before it remains recommended.

If a source becomes unavailable or stale, mark the record NEEDS_REVIEW and stop recommending it until re-verified.

## Free-tier safety
Batch sizes remain bounded so one scheduled run stays within the Cloudflare Workers Free limits and does not crawl the whole internet at once.
