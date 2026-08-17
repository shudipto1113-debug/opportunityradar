# OpportunityRadar — Global by Design

## User access
- No country is blocked at the UI level.
- Country is used only to evaluate source-backed eligibility.
- "Global" opportunities can match users in all supported locations, subject to the organizer's own legal exclusions.
- Regional, country-specific and online/remote opportunities are labeled explicitly.

## Language and locale
The frontend should use browser locale detection and `Intl.DateTimeFormat`, `Intl.NumberFormat` and `Intl.DisplayNames` instead of hard-coded US formats.

Initial language strategy:
1. English default.
2. Preserve UI strings in a translation map so additional languages can be added without changing application logic.
3. Use machine translation only for UI convenience; opportunity facts remain anchored to the original source language and official URL.

## Currencies
- Store source award values in the source currency.
- Store an optional normalized USD value only when a reliable exchange-rate source is available.
- Never silently convert a source amount and present the converted amount as the official prize.

## Time zones
- Store deadlines as ISO 8601 timestamps including their source timezone when available.
- Show the user's local time in the browser.
- Also show the source timezone when it matters for a deadline.

## Accessibility
- Keyboard navigation.
- Visible focus states.
- Semantic headings and labels.
- High-contrast text.
- Reduced-motion friendly UI.
- Screen-reader-friendly status text.
- No important information conveyed by color alone.

## Global eligibility
OpportunityRadar must distinguish:
- `global`
- `regional`
- `country_specific`
- `remote_but_restricted`
- `in_person`
- `unknown`

The system must not infer global eligibility merely because an opportunity is online. Organizer rules always win.

## Safety and trust
For users in any country, a recommendation must pass the pre-result verification gate. Country-specific restrictions, sanctions, legal exclusions, age restrictions, student-only rules, and other organizer conditions are displayed rather than hidden.
