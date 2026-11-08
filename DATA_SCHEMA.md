# Internship Finder — listings data schema (v2 collector)

File: `site/data/listings.json` → `{ "generatedAt": ISO datetime (IST), "listings": [ ... ] }`
Written daily by `scripts/collect.py` (GitHub Actions, 06:00 IST) and committed
back to the repo; Netlify auto-deploys on push. Sources: `scripts/sources.json`.
Tagging rules: `scripts/tagging.json`.

## Listing fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable per listing; used for firstSeenAt preservation, bookmarks, tracker |
| `title`, `company` | string | HTML stripped, whitespace normalised |
| `country`, `city`, `locationText`, `workMode` | string | Display/location |
| `kind` | string | Internship / Research Programme / Scholarship / Foreign Programme |
| `paid`, `stipendText` | bool, string | |
| `degrees` | string[] | Any of the 19 site degrees, or `["All"]` when the text names no specific degree or says any discipline/all streams |
| `fields` | string[] | Any of the 22 site field tags, or `["All"]` when degree info exists but no field can be matched (never guessed) |
| `field` | string | Legacy single tag (= first specific field, else previous value / "Other") — kept so older site code and the digest keep working |
| `taggingConfidence` | "high" \| "low" | "high" when a degree/field matched on eligibility text, "low" when only title/description matched |
| `levels` | string[] | Legacy UG/PG/Research levels (curated entries); used as fallback when `degrees` is absent |
| `eligibilityText` | string | As published by the source |
| `descriptionSnippet` | string | Plain text, cut at a word boundary at 240 characters |
| `deadlineText` | string | Deadline as the source words it (display) |
| `deadline` | string \| null | Parsed ISO date (YYYY-MM-DD) or null |
| `deadlineType` | "fixed" \| "recurring" \| "rolling" | |
| `sourceName`, `sourceUrl` | string | Apply/source link; official URL preferred over aggregator |
| `sourceType` | "official" \| "aggregator" | Aggregator listings show a "Third-party source, verify on official site" badge on the site |
| `firstSeenAt` | string | ISO datetime (or date for pre-v2 entries) of the FIRST run that saw this id — never reset |
| `lastSeenAt` | string | Date of the most recent run that saw this listing |
| `lastVerified` | string | Date the listing was last seen/verified (= run date for seen listings) |
| `status` | "active" \| "stale" | Not seen for >30 days → "stale" (hidden on the site); >60 days → dropped. Fixed deadlines are dropped 3 days after they pass |

## Site matching rule (app.js)

A listing shows for a profile when
`(degrees contains the user's degree OR degrees contains "All")`
AND `(fields contains the user's broad field OR fields contains "All")`.
Listings without `degrees`/`fields` (pre-v2 data) fall back to the legacy
`levels` + single `field` matching, so old data keeps working until the
collector's first run republishes everything in the new schema.
