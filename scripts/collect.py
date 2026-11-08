#!/usr/bin/env python3
"""
Internship Finder — daily collector v2.

Collects student opportunities (internships, fellowships, scholarships,
traineeships, summer/winter programmes, apprenticeships, govt schemes) from
the sources in scripts/sources.json, tags them with degrees + fields using
scripts/tagging.json, applies quality gates, merges them with the curated
listings in data/curated.json, and writes site/data/listings.json.

Rules honoured:
  - robots.txt is fetched and obeyed for every domain; disallowed paths are
    skipped. Sites that forbid scraping (LinkedIn, Internshala, Naukri,
    Indeed, Glassdoor) are hard-blocked in code, config or not.
  - Rate limit: at most 1 request per 2 seconds per domain, 25s timeout,
    2 retries with backoff. One source failing never stops the run.
  - Playwright is used only for sources with type "playwright" and only if
    it is installed; otherwise those sources are skipped with a log line.

Run:  python3 scripts/collect.py [--only NAME ...] [--out PATH] [--dry-run]
Requires: requests, beautifulsoup4, feedparser, python-dateutil
          (playwright optional — only for type "playwright" sources)
"""
import argparse, json, os, re, sys, time, unicodedata
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, urljoin
from urllib import robotparser

import requests
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

try:
    import feedparser
except Exception:  # pragma: no cover
    feedparser = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")
DEFAULT_OUT = os.path.join(ROOT, "site", "data", "listings.json")
CURATED = os.path.join(ROOT, "data", "curated.json")
IST = timezone(timedelta(hours=5, minutes=30))
TODAY = datetime.now(IST).date()
NOW_ISO = datetime.now(IST).isoformat(timespec="seconds")

USER_AGENT = "InternshipFinderCollector/1.0 (contact: braincraft2002@gmail.com)"
BLOCKED_DOMAINS = ("linkedin.com", "internshala.com", "naukri.com",
                   "indeed.com", "indeed.co.in", "glassdoor.com", "glassdoor.co.in")
AGGREGATOR_DOMAINS = ("rasayanika.com", "biotecnika.org", "konnifel.com",
                      "impactpool.org", "arbeitnow.com", "arbeitnow.co.uk",
                      "remoteok.com", "remotive.com", "adzuna.com", "jooble.org",
                      "freshersworld.com", "news.google.com")
STUDENT_TERMS = ("intern", "internship", "trainee", "fellowship", "scholarship",
                 "summer programme", "summer program", "winter programme",
                 "winter program", "dissertation", "research programme",
                 "research program", "apprentice", "apprenticeship", "traineeship",
                 "studentship", "summer training", "project trainee", "govt scheme",
                 "scheme for students", "student programme", "student program")
DEGREES_ALL = ["All"]

# ---------------------------------------------------------------- HTTP layer
class Http:
    """requests session with robots.txt obedience, per-domain rate limiting
    (1 request / 2 s) and 2 retries. Every failure is soft (returns None)."""
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self._robots = {}
        self._last_hit = {}

    def _robots_ok(self, url):
        host = urlparse(url).netloc
        if any(b in host for b in BLOCKED_DOMAINS):
            return False
        if host not in self._robots:
            rp = robotparser.RobotFileParser()
            robots_url = f"{urlparse(url).scheme}://{host}/robots.txt"
            try:
                r = self.session.get(robots_url, timeout=10)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except Exception:
                rp.parse([])  # unreachable robots.txt -> allow, still rate-limited
            self._robots[host] = rp
        return self._robots[host].can_fetch(USER_AGENT, url)

    def _throttle(self, url):
        host = urlparse(url).netloc
        wait = 2.0 - (time.time() - self._last_hit.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        self._last_hit[host] = time.time()

    def get(self, url, timeout=25):
        if not self._robots_ok(url):
            raise PermissionError(f"robots.txt disallows {url}")
        last_err = None
        for attempt in range(3):  # 1 try + 2 retries
            self._throttle(url)
            try:
                r = self.session.get(url, timeout=timeout)
                r.raise_for_status()
                return r
            except Exception as e:
                last_err = e
                time.sleep(2 * (attempt + 1))
        raise last_err

    def get_json(self, url):
        return self.get(url).json()

    def post_json(self, url, payload):
        if not self._robots_ok(url):
            raise PermissionError(f"robots.txt disallows {url}")
        self._throttle(url)
        r = self.session.post(url, json=payload, timeout=25)
        r.raise_for_status()
        return r.json()

HTTP = Http()

# ---------------------------------------------------------------- text utils
def clean_text(text):
    if not text:
        return ""
    text = BeautifulSoup(str(text), "html.parser").get_text(" ")
    text = unicodedata.normalize("NFKC", text)
    text = (text.replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
                .replace("\u2013", "-").replace("\u2014", "-").replace("\xa0", " "))
    return re.sub(r"\s+", " ", text).strip()

def snippet(text, limit=240):
    text = clean_text(text)
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",.;:") + "…"

def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:70] or "listing"

def norm_key(title, company):
    return re.sub(r"\s+", " ", f"{title}|{company}".lower()).strip()

_STUDENT_RE = re.compile(r"\b(" + "|".join(re.escape(t) for t in STUDENT_TERMS) + r")\b")

def is_student_opportunity(text):
    # Word boundaries matter: "internal" / "international" must not count
    # as "intern" (this exact bug hit the v1 collector).
    return bool(_STUDENT_RE.search((text or "").lower()))

def is_india_open(listing_text, country_hint):
    if country_hint == "India":
        return True
    t = (listing_text or "").lower()
    if "india" in t or "indian" in t:
        return True
    if country_hint in ("Worldwide", "Remote"):
        return True
    return any(w in t for w in ("worldwide", "remote", "work from home", "anywhere"))

def is_english_or_hindi(text):
    if not text:
        return True
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    ok = sum(1 for c in letters if c.isascii() or "\u0900" <= c <= "\u097F")
    return ok / len(letters) >= 0.85

# ---------------------------------------------------------------- tagging
TAGGING = json.load(open(os.path.join(SCRIPTS, "tagging.json"), encoding="utf-8"))

def tag_listing(title, eligibility, description):
    """Return (degrees, fields, confidence). Eligibility text wins: a match
    there is 'high' confidence; title/description-only matches are 'low'.
    No specific degree -> degrees ["All"]; degree known but no field ->
    fields ["All"] (never guess a field)."""
    elig = (eligibility or "").lower()
    rest = f"{title or ''} {description or ''}".lower()
    everything = f"{elig} {rest}"

    def match(rules, key, text):
        out = []
        for rule in rules:
            if any(k in text for k in rule["keywords"]):
                out.append(rule[key])
        return out

    deg_elig = match(TAGGING["degrees"], "degree", elig)
    deg_rest = match(TAGGING["degrees"], "degree", rest)
    fld_elig = match(TAGGING["fields"], "field", elig)
    fld_rest = match(TAGGING["fields"], "field", rest)

    all_deg = any(p in everything for p in TAGGING["allDegreePhrases"])
    all_fld = any(p in everything for p in TAGGING["allFieldPhrases"])
    elig_hit = bool(deg_elig or fld_elig
                    or any(p in elig for p in TAGGING["allDegreePhrases"])
                    or any(p in elig for p in TAGGING["allFieldPhrases"]))

    degrees = deg_elig or deg_rest
    if not degrees:
        degrees = ["All"]
    elif all_deg and not deg_elig:
        degrees = ["All"]
    fields = fld_elig or fld_rest
    if not fields:
        fields = ["All"]
    elif all_fld and not fld_elig:
        fields = ["All"]
    confidence = "high" if elig_hit else "low"
    return degrees, fields, confidence

# ---------------------------------------------------------------- dates
DATE_CANDIDATE = re.compile(
    r"(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*\d{4}"
    r"|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2}"
    r"|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})", re.I)
RECURRING_WORDS = ("every month", "monthly", "every year", "annual", "each month",
                   "20th of every month", "throughout the year", "round the year")
ROLLING_WORDS = ("rolling", "no deadline", "open throughout", "apply anytime",
                 "applications are invited throughout")

def parse_deadline(text):
    """Return (deadline_iso_or_None, deadlineType)."""
    t = (text or "").lower()
    if any(w in t for w in RECURRING_WORDS):
        m = DATE_CANDIDATE.search(text or "")
        iso = None
        if m:
            try:
                iso = dateparser.parse(m.group(1), dayfirst=True).date().isoformat()
            except Exception:
                iso = None
        return iso, "recurring"
    m = DATE_CANDIDATE.search(text or "")
    if m:
        try:
            d = dateparser.parse(m.group(1), dayfirst=True).date()
            return d.isoformat(), "fixed"
        except Exception:
            pass
    if any(w in t for w in ROLLING_WORDS):
        return None, "rolling"
    return None, "rolling"


# ---------------------------------------------------------------- listing factory
def make_listing(*, lid, title, company, source_url, source_name, source_type,
                 country="India", city="", location="", work_mode="", kind="Internship",
                 paid=False, stipend="", deadline_text="", eligibility="", description="",
                 duration="", levels=None, posted=None, base=None):
    """Build one listing in the site schema, applying tagging + date parsing.
    `base` carries curated fields through untouched when re-processing them."""
    l = dict(base) if base else {}
    degrees, fields, confidence = tag_listing(title, eligibility, description)
    deadline_iso, deadline_type = parse_deadline(
        " ".join([deadline_text or "", eligibility or "", description or ""]))
    if deadline_text and deadline_type == "rolling" and not deadline_iso:
        deadline_iso, deadline_type = parse_deadline(deadline_text)
    l.update({
        "id": lid,
        "title": clean_text(title)[:160],
        "company": clean_text(company),
        "country": country or l.get("country", "India"),
        "city": city or l.get("city", ""),
        "locationText": location or l.get("locationText", "") or (city or country or ""),
        "workMode": work_mode or l.get("workMode", ""),
        "field": (fields[0] if fields and fields[0] != "All" else l.get("field", "Other")),
        "fields": fields,
        "degrees": degrees,
        "taggingConfidence": confidence,
        "kind": kind or l.get("kind", "Internship"),
        "paid": bool(paid) if paid else bool(l.get("paid", False)),
        "stipendText": stipend or l.get("stipendText", ""),
        "deadlineText": deadline_text if deadline_text else l.get("deadlineText", ""),
        "deadline": deadline_iso,
        "deadlineType": deadline_type,
        "eligibilityText": clean_text(eligibility)[:400] if eligibility else l.get("eligibilityText", ""),
        "levels": levels if levels is not None else l.get("levels", []),
        "descriptionSnippet": snippet(description) if description else l.get("descriptionSnippet", ""),
        "durationText": duration or l.get("durationText", ""),
        "sourceName": source_name,
        "sourceUrl": source_url,
        "sourceType": source_type,
        "status": "active",
    })
    if posted:
        l["_posted"] = str(posted)[:10]
    return l

def source_type_for(url, default="official"):
    host = urlparse(url or "").netloc.lower()
    if any(d in host for d in AGGREGATOR_DOMAINS):
        return "aggregator"
    return default

# ---------------------------------------------------------------- API parsers
def parse_remotive(src):
    data = HTTP.get_json(src["url"])
    out = []
    for j in data.get("jobs", []):
        out.append(make_listing(
            lid="remotive-" + str(j.get("id")), title=j.get("title", ""),
            company=j.get("company_name", ""), source_url=j.get("url", ""),
            source_name="remotive.com", source_type="aggregator", country="Worldwide",
            location=j.get("candidate_required_location", "Remote") or "Remote",
            work_mode="Remote", description=j.get("description", ""),
            posted=j.get("publication_date", "")))
    return out

def parse_arbeitnow(src):
    data = HTTP.get_json(src["url"])
    out = []
    for j in data.get("data", []):
        out.append(make_listing(
            lid="arbeitnow-" + slugify(j.get("title", "") + "-" + j.get("company_name", "")),
            title=j.get("title", ""), company=j.get("company_name", ""),
            source_url=j.get("url", ""), source_name="arbeitnow.com",
            source_type="aggregator", country="Worldwide",
            city=j.get("location", "") or "", location=j.get("location", "") or "—",
            work_mode="Remote" if j.get("remote") else "",
            description=j.get("description", "")))
    return out

def parse_remoteok(src):
    data = HTTP.get_json(src["url"])
    out = []
    for j in data[1:]:
        out.append(make_listing(
            lid="remoteok-" + str(j.get("id")), title=j.get("position", ""),
            company=j.get("company", ""), source_url=j.get("url", ""),
            source_name="remoteok.com", source_type="aggregator", country="Worldwide",
            location="Remote", work_mode="Remote",
            description=j.get("description", ""), posted=j.get("date", "")))
    return out

def parse_adzuna(src):
    app_id, app_key = os.environ.get("ADZUNA_APP_ID"), os.environ.get("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        raise RuntimeError("skipped: ADZUNA_APP_ID / ADZUNA_APP_KEY not set")
    url = (f"{src['url']}?app_id={app_id}&app_key={app_key}"
           f"&what=internship&results_per_page=30&sort_by=date")
    data = HTTP.get_json(url)
    out = []
    for j in data.get("results", []):
        out.append(make_listing(
            lid="adzuna-" + str(j.get("id")), title=j.get("title", ""),
            company=(j.get("company", {}) or {}).get("display_name", ""),
            source_url=j.get("redirect_url", ""), source_name="adzuna.com",
            source_type="aggregator", country="India",
            city=(j.get("location", {}) or {}).get("display_name", ""),
            description=j.get("description", ""), posted=j.get("created", "")))
    return out

def parse_jooble(src):
    key = os.environ.get("JOOBLE_API_KEY")
    if not key:
        raise RuntimeError("skipped: JOOBLE_API_KEY not set")
    data = HTTP.post_json(src["url"].rstrip("/") + "/" + key,
                          {"keywords": "internship", "location": "India"})
    out = []
    for j in data.get("jobs", []):
        out.append(make_listing(
            lid="jooble-" + slugify(j.get("title", "") + "-" + j.get("company", "")),
            title=j.get("title", ""), company=j.get("company", ""),
            source_url=j.get("link", ""), source_name="jooble.org",
            source_type="aggregator", country="India",
            city=j.get("location", ""), description=j.get("snippet", ""),
            posted=j.get("updated", "")))
    return out

API_PARSERS = {"remotive": parse_remotive, "arbeitnow": parse_arbeitnow,
               "remoteok": parse_remoteok, "adzuna": parse_adzuna,
               "jooble": parse_jooble}

# ---------------------------------------------------------------- RSS parser
def parse_rss(src):
    if feedparser is None:
        raise RuntimeError("feedparser not installed")
    r = HTTP.get(src["url"])
    feed = feedparser.parse(r.content)
    out = []
    for e in feed.entries[:60]:
        title = clean_text(e.get("title", ""))
        link = e.get("link", "")
        desc = clean_text(e.get("summary", ""))
        posted = ""
        if getattr(e, "published_parsed", None):
            posted = datetime(*e.published_parsed[:6]).date().isoformat()
        # Prefer the organisation's own page when the entry links onward.
        out.append(make_listing(
            lid=slugify(src["name"]) + "-" + slugify(title),
            title=title, company=src.get("org", ""), source_url=link,
            source_name=urlparse(link).netloc or src["name"],
            source_type=src.get("sourceType", "aggregator"),
            country=src.get("country", "India"), description=desc, posted=posted))
    return out

# ---------------------------------------------------------------- HTML parser
LINK_TERMS = ("intern", "fellow", "scholar", "trainee", "apprentice", "summer",
              "winter school", "dissertation", "studentship", "research programme")

def harvest_links(html, base_url):
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for a in soup.find_all("a", href=True):
        text = clean_text(a.get_text(" "))
        href = urljoin(base_url, a["href"])
        hay = (text + " " + href).lower()
        if not any(t in hay for t in LINK_TERMS):
            continue
        if len(text) < 8 or len(text) > 140:
            continue
        ctx = ""
        parent = a.find_parent(["li", "div", "tr", "article", "section"])
        if parent:
            ctx = clean_text(parent.get_text(" "))[:600]
        found.append((text, href, ctx))
    return found

def parse_html(src, html=None):
    if html is None:
        html = HTTP.get(src["url"]).text
    out = []
    for text, href, ctx in harvest_links(html, src["url"])[:25]:
        if urlparse(href).netloc == urlparse(src["url"]).netloc and href.rstrip("/") == src["url"].rstrip("/"):
            continue
        out.append(make_listing(
            lid=slugify(src["name"]) + "-" + slugify(text),
            title=text, company=src.get("org", ""), source_url=href,
            source_name=urlparse(href).netloc or src["name"],
            source_type=src.get("sourceType", "official"),
            country=src.get("country", "India"), description=ctx, eligibility=ctx))
    return out

def parse_playwright(src):
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        raise RuntimeError("playwright not installed — source skipped")
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(user_agent=USER_AGENT)
        page.goto(src["url"], timeout=60000)
        page.wait_for_timeout(3000)
        html = page.content()
        browser.close()
    return parse_html(src, html=html)

# ---------------------------------------------------------------- curated
def load_curated():
    if not os.path.exists(CURATED):
        return [], {"source": "curated.json", "found": 0, "kept": 0, "dropped": {}, "status": "missing"}
    raw = json.load(open(CURATED, encoding="utf-8"))
    out, dropped = [], {}
    for c in raw:
        try:
            l = make_listing(
                lid=c.get("id") or slugify(c.get("title", "") + "-" + c.get("company", "")),
                title=c.get("title", ""), company=c.get("company", ""),
                source_url=c.get("sourceUrl", ""),
                source_name=c.get("sourceName", ""),
                source_type=source_type_for(c.get("sourceUrl", ""), "official"),
                country=c.get("country", "India"), city=c.get("city", ""),
                location=c.get("locationText", ""), work_mode=c.get("workMode", ""),
                kind=c.get("kind", "Internship"), paid=c.get("paid", False),
                stipend=c.get("stipendText", ""), deadline_text=c.get("deadlineText", ""),
                eligibility=c.get("eligibilityText", ""),
                description=c.get("descriptionSnippet", ""),
                duration=c.get("durationText", ""), levels=c.get("levels", []), base=c)
            out.append(l)
        except Exception as e:
            dropped[str(e)] = dropped.get(str(e), 0) + 1
    return out, {"source": "curated.json (hand-curated, always kept)", "found": len(raw),
                 "kept": len(out), "dropped": dropped, "status": "ok"}

def recheck_curated(curated):
    """Re-fetch each curated listing's own page; if the page now shows a
    different explicit deadline date, adopt it. Marks every reachable curated
    listing as seen today. Failures are logged, never fatal."""
    changed = 0
    for l in curated:
        url = l.get("sourceUrl", "")
        if not url:
            continue
        try:
            html = HTTP.get(url).text
            text = clean_text(BeautifulSoup(html, "html.parser").get_text(" "))
            iso, dtype = parse_deadline(text)
            if iso and dtype == "fixed" and iso != l.get("deadline"):
                l["deadline"] = iso
                l["deadlineType"] = "fixed"
                changed += 1
            l["_seen"] = True
        except Exception:
            l["_seen"] = True  # curated entries are kept regardless; page may be a PDF/binary
    return changed


# ---------------------------------------------------------------- quality gates
def quality_gate(l, source_country):
    """Return None to keep, or a short drop reason."""
    if not l.get("title") or not l.get("sourceUrl"):
        return "missing title or URL"
    # NOTE: kind is excluded on purpose — the parsers default it to
    # "Internship", so counting it would make this gate always pass.
    blob = " ".join([l.get("title", ""), l.get("eligibilityText", ""),
                     l.get("descriptionSnippet", "")])
    if not is_student_opportunity(blob):
        return "not a student opportunity"
    if not is_india_open(blob + " " + l.get("locationText", ""), source_country or l.get("country", "")):
        return "not open to India / worldwide"
    if not is_english_or_hindi(blob):
        return "not English/Hindi"
    if l.get("deadline") and l.get("deadlineType") == "fixed":
        try:
            d = datetime.fromisoformat(l["deadline"]).date()
            if (TODAY - d).days > 3:
                return "deadline passed >3 days ago"
        except Exception:
            pass
    return None

# ---------------------------------------------------------------- main run
def run_source(src):
    row = {"source": src["name"], "found": 0, "kept": 0, "dropped": {}, "status": "ok"}
    try:
        if src["type"] == "api":
            items = API_PARSERS[src["parser"]](src)
        elif src["type"] == "rss":
            items = parse_rss(src)
        elif src["type"] == "playwright":
            items = parse_playwright(src)
        else:
            items = parse_html(src)
    except Exception as e:
        row["status"] = f"ERROR: {e}"
        return [], row
    row["found"] = len(items)
    kept = []
    for l in items:
        reason = quality_gate(l, src.get("country"))
        if reason:
            row["dropped"][reason] = row["dropped"].get(reason, 0) + 1
        else:
            l["_seen"] = True
            kept.append(l)
    row["kept"] = len(kept)
    return kept, row

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None, help="run only these source names")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--prev", default=None, help="previous listings.json (defaults to --out)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-recheck", action="store_true", help="skip re-fetching curated pages")
    args = ap.parse_args()
    prev_path = args.prev or args.out

    prev = {}
    if os.path.exists(prev_path):
        try:
            old = json.load(open(prev_path, encoding="utf-8"))
            for l in old.get("listings", []):
                prev[l.get("id", "")] = l
        except Exception as e:
            print(f"WARNING: could not read previous listings: {e}")

    sources = json.load(open(os.path.join(SCRIPTS, "sources.json"), encoding="utf-8"))["sources"]
    rows, collected = [], []

    curated, crow = load_curated()
    rows.append(crow)
    if not args.no_recheck and curated:
        n = recheck_curated(curated)
        print(f"curated recheck: {n} deadline(s) changed on official pages")
    collected += curated

    for src in sources:
        if not src.get("enabled", True):
            rows.append({"source": src["name"], "found": 0, "kept": 0, "dropped": {}, "status": "disabled"})
            continue
        if args.only and src["name"] not in args.only:
            continue
        kept, row = run_source(src)
        rows.append(row)
        collected += kept
        print(f"{src['name']}: found={row['found']} kept={row['kept']} status={row['status']}")

    # ---- merge with previous run: preserve firstSeenAt, apply stale rules
    seen_ids = {l["id"] for l in collected}
    merged, seen_keys = [], set()
    for l in collected:  # curated first, then sources in config order
        key = norm_key(l.get("title", ""), l.get("company", "")) or l["id"]
        if key in seen_keys or l["id"] in {m["id"] for m in merged}:
            continue
        seen_keys.add(key)
        old = prev.get(l["id"])
        if old and old.get("firstSeenAt"):
            l["firstSeenAt"] = old["firstSeenAt"]
        elif l.get("firstSeenAt"):
            pass  # curated entries carry their own original firstSeenAt
        elif l.get("_posted"):
            l["firstSeenAt"] = l["_posted"]
        else:
            l["firstSeenAt"] = NOW_ISO
        l["lastSeenAt"] = TODAY.isoformat()
        l["lastVerified"] = TODAY.isoformat()
        l.pop("_posted", None); l.pop("_seen", None)
        merged.append(l)

    carried = dropped_stale = dropped_dead = 0
    for pid, old in prev.items():
        if pid in seen_ids or not old.get("id"):
            continue
        last_seen = old.get("lastSeenAt") or old.get("lastVerified") or old.get("firstSeenAt", "")
        try:
            age = (TODAY - datetime.fromisoformat(str(last_seen)[:10]).date()).days
        except Exception:
            age = 999
        if age > 60:
            dropped_dead += 1
            continue
        if old.get("deadline") and old.get("deadlineType") == "fixed":
            try:
                if (TODAY - datetime.fromisoformat(old["deadline"]).date()).days > 3:
                    dropped_dead += 1
                    continue
            except Exception:
                pass
        old["status"] = "stale" if age > 30 else old.get("status", "active")
        if age > 30:
            dropped_stale += 1
        merged.append(old)
        carried += 1

    merged.sort(key=lambda x: str(x.get("firstSeenAt", "")), reverse=True)
    payload = {"generatedAt": NOW_ISO, "listings": merged}
    if not args.dry_run:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)

    # ---- run summary
    print("\n================ RUN SUMMARY ================")
    print(f"Date (IST): {TODAY}   Output: {args.out}{' (dry run)' if args.dry_run else ''}")
    print(f"{'Source':<42} {'Found':>5} {'Kept':>5}  Status / drops")
    tf = tk = 0
    for r in rows:
        tf += r["found"]; tk += r["kept"]
        drops = "; ".join(f"{k} x{v}" for k, v in r["dropped"].items())
        print(f"{r['source']:<42} {r['found']:>5} {r['kept']:>5}  {r['status']}{(' | ' + drops) if drops else ''}")
    print(f"{'TOTAL (sources)':<42} {tf:>5} {tk:>5}")
    print(f"Carried over from previous run: {carried} (of which stale >30d: {dropped_stale}); dropped >60d/expired: {dropped_dead}")
    print(f"Final listings written: {len(merged)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
