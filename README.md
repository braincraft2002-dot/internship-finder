# Internship Finder — Public Website (Free Stack)

A public, lightweight internship finder for students: internships, research
programmes, scholarships & govt schemes, filtered and tagged for the student's
own degree/semester. Free plan: first 10 listings/day. Premium: ₹50 / 6 months,
**UPI only**, manual activation by the owner (100% free to run).

## What's built
- `site/` — the website (frontend). Total size ~48 KB (very light = very few
  Netlify credits used). Open `site/index.html` via any static host.
  - Search + filters (region, kind, remote, paid-only, my list)
  - Student profile (degree/semester/field) saved in the browser →
    "✅ Eligible for you" tags
  - Bookmarks + application tracker (browser storage)
  - Free limit (10/day) + locked-listings note
  - Premium section: UPI pay link + activation-code unlock (6 months)
  - Daily Digest generator with copy button
  - About / Refund / Privacy / Contact section (needed later for Razorpay)
- `site/config.js` — OWNER SETTINGS. Set `upiId`, `ownerContact` and your
  secret `activationCodes` here. This is the only file you normally edit.
- `site/data/listings.json` — the live listings file (15 listings at build:
  10 curated govt/EVS + fresh feed listings). Refreshed daily by the collector.
- `data/curated.json` — hand-picked official listings (MoEFCC, MNRE, ICAR,
  WWF-India, GEER, UNDP, CSTEP...). Add new govt/scholarship listings here.
- `scripts/collect.py` — daily collector. Fetches ONLY allowed free sources
  (RemoteOK, Remotive, Arbeitnow APIs/feeds; Adzuna when you add a free API
  key), merges with curated, dedupes by title+company, writes listings.json.
- `.github/workflows/daily-refresh.yml` — runs the collector daily at
  07:00 IST on GitHub Actions (free) once this folder is a GitHub repo.
- `supabase/schema.sql` — full multi-user backend schema (profiles, listings,
  bookmarks, subscriptions) with Row Level Security. Use it when moving to
  real server accounts (Supabase free tier) so data follows the student
  across devices. The Netlify-static version stores data in the browser.

## Publish on Netlify (free) — 5 steps
1. Put this folder in a GitHub repo (free) — OR use Netlify's drag-and-drop.
2. Netlify → Add new site → Import the repo (build settings are already in
   `netlify.toml`: publish folder = `site`, no build command).
   Drag-and-drop alternative: drag the `site` folder onto Netlify Drop.
3. Site goes live at `https://<your-name>.netlify.app` with free HTTPS.
4. Edit `site/config.js` with your UPI ID + contact + activation codes,
   commit/redeploy.
5. When traffic grows past Netlify's free 300 credits/month (~10–20k visits),
   upgrade from Premium income — not before.

## Premium flow (manual UPI — zero fees)
Student pays ₹50 to your UPI ID in their UPI app → sends you the UPI
transaction/UTR ID → you verify in your bank/UPI app → you send them an
activation code from your `activationCodes` list → they enter it on the site →
Premium unlocks for 6 months on their browser.

## Safety rules kept from the plan
- Never scrape LinkedIn / Internshala / Indeed (against their terms).
  Listings come from official APIs/feeds + curated official pages, and every
  card links to the original posting with its source name.
- Standing warning on the site: "Never pay anyone for an internship."
