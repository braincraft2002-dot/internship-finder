# Internship Finder — Complete Handover for Redesign

**Purpose of this document:** everything about the product EXCEPT its visual design.
The design is to be created fresh. The features, behaviour, data format and contracts
below must stay exactly the same, so the existing JavaScript keeps working.
Owner: Praveen Thakur. Prepared: 2026-11-07.

---

## 1. What the product is

- **Name:** Internship Finder
- **Live site:** https://internship-finder-zp6g.netlify.app
- **What it does:** a free public website that shows students ONE daily list of
  internships, research programmes, scholarships, fellowships, foreign programmes
  and Indian government schemes — matched to the student's own degree, semester
  and field. It is an **aggregator**: it never hosts applications; every listing
  links out to the original posting.
- **Audience:** Indian students first (esp. Environmental Science / agriculture /
  life sciences), then worldwide. Mobile-first audience, mostly phones.
- **Business model:** Freemium. Free plan shows the first 10 listings per day.
  **Premium = ₹50 for 6 months, UPI only** (no cards, no auto-renewal), unlocks
  the full list and extra sections.
- **Budget rule:** ₹0 upfront. Free tiers only (Netlify free hosting, free data
  APIs, free subdomain — no custom domain yet).

## 2. Tech setup (do not change without asking the owner)

- **Type:** fully static website — plain HTML + CSS + vanilla JavaScript.
  No framework, no build step, no server, no database (yet).
- **Hosting:** Netlify. Publish folder = `site/`. `netlify.toml` at project root
  contains only: publish = "site", no build command.
- **Project folder:** `internship-finder-public/`
  - `site/index.html` — the page (REDESIGN THIS VISUALLY)
  - `site/styles.css` — styling (REDESIGN THIS)
  - `site/app.js` — ALL behaviour/logic (keep working; see contracts in §6)
  - `site/config.js` — owner settings (see §7; do not hardcode its values elsewhere)
  - `site/data/listings.json` — the listings data file (format in §5)
  - `scripts/collect.py` — daily data collector (Python, stdlib only)
  - `data/curated.json` — 10 hand-picked govt/EVS listings used as collector seed
  - `.github/workflows/daily-refresh.yml` — GitHub Actions, daily 07:00 IST
    (prepared but NOT yet active — repo not pushed to GitHub yet)
  - `supabase/schema.sql` — future multi-user backend pack (not in use yet)

## 3. Complete feature list (all must keep working)

### 3.1 Listings feed
- Listings load from `data/listings.json` (fetched at page load, cache: no-store).
- Each listing shows: title, organisation/company, location + work mode + kind,
  ~2-line description snippet, stipend (if any), eligibility note (if any),
  deadline (if any), duration (if any), "Source: <name> • Found: <date>",
  an **Apply** link (opens `sourceUrl` in a new tab) and a **Bookmark** button.
- Standing safety line shown on the site: "Never pay anyone for an internship.
  Always apply only on the original website linked on each listing."
- Footer note: listings belong to their original publishers; users must verify
  stipend & deadline on the original site.

### 3.2 Search
- One search box. Matches against title + company + description + field
  (case-insensitive substring). Filters the list live as the user types.

### 3.3 Filters (chip/button group)
- **Region** (single-select): All regions / India / Worldwide–Remote.
  India = `country === "India"`. Worldwide = `country === "Worldwide"` OR remote.
- **Kind** (single-select): Internships (`kind = "Internship"`) /
  Research (`"Research Programme"`) / Scholarships (`"Scholarship"`) /
  Foreign (`"Foreign Programme"`).
- **Remote only** (toggle): `workMode === "Remote"`.
- **Paid only** (toggle): `paid === true`.
- **My list** (toggle): only bookmarked listings.
- Result count text: "Showing X of Y listings" (+ "— Z more with Premium"
  when the free limit hides some).
- If nothing matches: "No listings match these filters yet. Try clearing a filter."

### 3.4 My Profile (student personalisation)
- Three dropdowns, saved automatically in the visitor's own browser
  (localStorage key `if_profile` = `{degree, sem, field}`). No login, no server.
- **Degree options (exact, expanded 2026-11-07):** Diploma, B.Sc.,
  B.Sc. Agriculture, B.Tech / B.E., B.A. / B.Com / BBA, BCA, B.Pharm,
  MBBS / BDS, BVSc (Veterinary), M.Sc., M.Sc. Agriculture, M.Tech,
  M.A. / M.Com / MBA, MCA, M.Pharm, MD / MS (Medical), MVSc (Veterinary),
  Ph.D / Research, Postdoctoral Research.
- **Semester options (exact):** 1–8, "Final year completed".
- **Field options (exact, expanded 2026-11-07):** Environmental Science,
  Agriculture, Life Sciences / Biology, Biotechnology, Forestry,
  Food Technology, Veterinary and Animal Sciences, Earth Sciences / Geology,
  Chemistry, Physics, Mathematics and Statistics, Computer Science / IT,
  Data Science / AI, Engineering, Pharmacy, Medicine and Health Sciences,
  Commerce / Management, Social Sciences and Humanities, Law, Education,
  Media and Communication, Other.
- Profile drives two things:
  1. **Eligibility tags** (see 3.5).
  2. **Sorting:** listings whose `field` equals the profile field sort first
     (other listings are NOT hidden, just lower).

### 3.5 Eligibility tags
- Degree → level mapping: all M.* degrees (M.Sc. incl. Agriculture, M.Tech,
  M.A./M.Com/MBA, MCA, M.Pharm, MD/MS, MVSc) → `PG`; Ph.D and Postdoctoral
  → `Research`; all B.* degrees and Diploma (incl. B.Sc. Agriculture, BCA,
  B.Pharm, MBBS/BDS, BVSc) → `UG`.
- If the listing's `levels[]` contains the student's level → tag
  "✅ Eligible for you (PG)" (level name varies). If levels exist but do not
  contain it → tag "Check eligibility". No levels on listing → no tag.

### 3.6 Bookmarks + Application Tracker
- Bookmark button toggles save state (localStorage `if_bookmarks` = array of ids).
- Every bookmarked listing appears in **My Application Tracker** with a status
  dropdown (localStorage `if_tracker` = `{listingId: status}`).
- **Statuses (exact):** Saved, Applied, Interview, Selected, Rejected.
  New bookmarks start as "Saved". Un-bookmarking removes the tracker entry.
- Empty tracker text: "Bookmark a listing and it will appear here.
  Set its status as you apply."

### 3.7 Free limit + Premium (UPI, manual activation)
- Free visitors see only the first **10** listings per day
  (`freeListingsPerDay` in config). If more matched, a locked note appears:
  "🔒 Z more listings are locked on the free plan. Premium (₹50 / 6 months,
  UPI only) unlocks the full daily list, scholarships & foreign programmes."
- Premium box lists these benefits (keep wording):
  full daily list unlocked; "Eligible for you" tags; Scholarships, Fellowships
  & Foreign Programmes sections; daily digest + deadline reminders (7 days &
  1 day before); application tracker; 30-day promise (no opportunity for your
  degree in 30 days → refund).
- **Payment flow (manual, by design):**
  1. `config.js` → `upiId` is currently EMPTY → site must show
     "💳 Premium opening soon — the owner is activating UPI payments."
     (Premium is INACTIVE right now. Do not invent a UPI ID.)
  2. When `upiId` is set: site shows the UPI ID + a "Pay in UPI app" deep link
     `upi://pay?pa=<upiId>&pn=<siteName>&am=50&cu=INR`.
  3. Student pays, then contacts the owner (`ownerContact` in config —
     braincraft2002@gmail.com · WhatsApp +91 8218941750) with the UPI
     transaction/UTR ID. The owner verifies the payment and unlocks Premium
     for the student. **There is NO activation-code system** (removed on the
     owner's instruction, 2026-11-07); do not design a code-entry UI.
  4. Premium, once active, lasts `premiumMonths` (6) months in that browser
     (localStorage `if_premium` = `{activatedAt, expiresAt}`); expired Premium
     reverts to free automatically.
- Premium state UI: a "⭐ Premium" badge appears; the header Premium button
  switches to "⭐ Premium Active"; Premium box shows the active-until date.

### 3.8 Daily Digest
- "Daily Digest" button builds a plain-text digest of the currently filtered
  listings (free: top 10; Premium: top 50), headed with the date and the
  student's profile line, each item numbered with title — company (stipend)
  • deadline + the source URL, ending with the never-pay safety line.
- Shown in a dialog with **Copy digest** and **Close** buttons.

### 3.9 Header stats
- Live listings (total count) • Paid/stipend count • India count •
  Found today (listings whose `firstSeenAt` = today) • Last updated
  (from `generatedAt` in listings.json, en-IN date format).

### 3.10 About & Policies section (keep this content)
- **What this is:** an aggregator… never charge for an internship itself —
  Premium pays only for the extra features.
- **Refund policy:** refund if no opportunity matching the degree is found in
  the first 30 days, or if Premium was activated by mistake and unused;
  contact owner with UPI transaction ID.
- **Privacy:** profile, bookmarks and tracker are stored only in the visitor's
  own browser — no personal data is collected on a server. Payment is made by
  the student directly in their UPI app.
- **Contact:** shows `ownerContact` from config, else "see Premium section".

### 3.11 Optional extras (added in unpublished redesign drafts — nice to have,
not required): "Listings by field" bar chart (counts per field, top 6);
"Closing soon" panel (nearest parsed deadlines, top 5); per-listing status
pill — Open / Closing soon (deadline ≤ 21 days) / Closed / Rolling.

## 4. Behaviour rules worth knowing

- Everything personal (profile, bookmarks, tracker, premium) lives in the
  visitor's browser localStorage only. Clearing browser data resets it.
  This is intentional for v1; a Supabase accounts version is planned later.
- The site must work if `listings.json` fails to load: show
  "Listings could not be loaded right now. Please refresh in a little while."
  (app.js also supports an `EMBEDDED_LISTINGS` fallback object.)
- Dates render in en-IN format. Currency is ₹ (INR).

## 5. Data format — `site/data/listings.json`

```json
{ "generatedAt": "2026-11-05T03:46:43+05:30", "listings": [ { … } ] }
```

Each listing object (all strings may be empty except id/title/company/sourceUrl):
`id` (unique slug), `title`, `company`, `country` ("India" | "Worldwide"),
`city`, `locationText` (display), `workMode` ("Remote" | "Hybrid" | "On-site" | ""),
`field` (e.g. "Environmental Science", "Agriculture", "General"),
`kind` ("Internship" | "Research Programme" | "Scholarship" | "Foreign Programme"),
`paid` (boolean), `stipendText`, `deadlineText`, `eligibilityText`,
`levels` (array, subset of ["UG","PG","Research"]),
`descriptionSnippet`, `durationText`, `sourceName`, `sourceUrl`, `firstSeenAt` (YYYY-MM-DD).

**Current data:** 15 listings — 10 curated govt/EVS (MoEFCC Internship Scheme
₹10,000/month, deadline 31 Dec 2026; MNRE NREI; ICAR-CSSRI; WWF-India; GEER
Foundation; UNDP; CSTEP; World Unite; ICI) + 5 fresh remote-feed listings.

**Collector (`scripts/collect.py`):** pulls RemoteOK, Remotive and Arbeitnow
free APIs (+ Adzuna if API keys are set), keeps only genuine internships
(word-boundary "intern" matching), dedupes by normalised title+company,
puts curated listings first, rewrites `listings.json`. Not yet running daily
(GitHub repo step pending owner approval).

## 6. Contracts — what a redesign must NOT break

If the new design keeps these intact, the existing `app.js` works unchanged:

- **Element IDs used by app.js:** `siteName`, `premiumBadge`, `digestBtn`,
  `premiumBtn`, `statTotal`, `statPaid`, `statIndia`, `statToday`,
  `statUpdated`, `showingCount`, `searchBox`, `listings`, `lockedNote`,
  `profileDegree`, `profileSem`, `profileField`, `trackerList`, `premiumBox`,
  `premiumPay`, `contactLine`, `digestDialog`, `digestText`, `copyDigest`,
  `closeDigest`. (23 IDs. The old `activationInput` / `activateBtn` /
  `activateMsg` IDs are GONE — no activation-code UI.)
  (Redesign drafts also used `catChart` and `deadlineList` for the optional
  extras in §3.11.)
- **Filter controls:** any element with class `chip` and attributes
  `data-filter` ∈ {region, kind, mode, paid, saved} and `data-value`
  (region: "" | "India" | "Worldwide"; kind: "" | "Internship" |
  "Research Programme" | "Scholarship" | "Foreign Programme";
  mode: "Remote"; paid/saved: "1"). Active state = class `active`.
- **localStorage keys:** `if_profile`, `if_bookmarks`, `if_tracker`,
  `if_premium` (formats as described in §3).
- **Config:** all owner settings come from `window.SITE_CONFIG` in
  `site/config.js` — never hardcode price, UPI ID, limits or codes in design code.
- **Files:** keep `index.html`, `styles.css`, `app.js`, `config.js`,
  `data/listings.json` paths and names. Extra CSS/JS files are fine if linked
  from index.html inside `site/`.

## 7. Owner settings — `site/config.js` (current values)

- `siteName`: "Internship Finder"
- `upiId`: "" (EMPTY — Premium inactive until owner provides it)
- `ownerContact`: "braincraft2002@gmail.com · WhatsApp +91 8218941750" (SET by owner 2026-11-07)
- `premiumPriceRupees`: 50
- `premiumMonths`: 6
- `freeListingsPerDay`: 10
- `activationCodes`: REMOVED (2026-11-07, owner's instruction — no activation codes anywhere in the product)

## 8. Owner's rules for any work on this site

1. **Show the owner the finished design first** (preview/screenshot).
   Publish/deploy ONLY after he approves. No exceptions.
2. Zero budget: free tiers, free fonts/libraries, no paid assets.
3. Never invent data — no fake listings, counts, users or revenue.
4. Keep the site light and mobile-friendly (audience is students on phones).
5. Features in §3 are frozen: redesign = look & layout only.

## 9. Design — intentionally blank

This section is for the designer. Everything above must stay true;
everything visual (layout, colours, typography, components, imagery) is
yours to create from zero.
