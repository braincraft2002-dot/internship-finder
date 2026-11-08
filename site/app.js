(function(){
"use strict";
var CFG = window.SITE_CONFIG || {};
var LS = {profile:"if_profile", bookmarks:"if_bookmarks", tracker:"if_tracker", premium:"if_premium", usedCodes:"if_used_codes"};
function load(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
function save(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }

var state = {
  listings: [], generatedAt: null,
  filters: {search:"", region:"", regions:[], kind:"", kinds:[], mode:"", paid:false, saved:false},
  profile: load(LS.profile, {degree:"", sem:"", field:""}),
  bookmarks: load(LS.bookmarks, []),
  tracker: load(LS.tracker, {}),
  premium: load(LS.premium, null) // {activatedAt, expiresAt}
};
state.showExpired = false; // FIX 2

function isPremium(){
  if(!state.premium) return false;
  if(new Date(state.premium.expiresAt) < new Date()){ state.premium=null; save(LS.premium,null); return false; }
  return true;
}
function levelOf(degree){
  if(!degree) return "";
  if(/Ph\.D|Postdoc/.test(degree)) return "Research";
  if(/M\.Sc|M\.Tech|M\.A|M\.Com|MBA|MCA|M\.Pharm|MD \/ MS|MVSc/.test(degree)) return "PG";
  if(/B\.Sc|B\.Tech|B\.A|B\.Com|BBA|BCA|B\.Pharm|MBBS|BVSc|Diploma/.test(degree)) return "UG";
  return "";
}
// FIX 4 — Eligibility tags are FREE for everyone: no Premium check belongs in this function.
function eligibleTag(l){ // FIX 4
  var lvl = levelOf(state.profile.degree);
  if(!lvl || !l.levels || !l.levels.length) return "";
  return l.levels.indexOf(lvl) >= 0 ? "✅ Eligible for you ("+lvl+")" : "Check eligibility";
}
function todayStr(){ return new Date().toISOString().slice(0,10); }

function parseDeadlineDate(l){ // FIX 2
  var t = (l && l.deadlineText) || ""; // FIX 2
  var m = /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*(\d{4})/i.exec(t); // FIX 2
  if(!m) return null; // FIX 2
  var months = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11}; // FIX 2
  return new Date(parseInt(m[3], 10), months[m[2].toLowerCase().slice(0, 3)], parseInt(m[1], 10)); // FIX 2
} // FIX 2
function isExpired(l){ // FIX 2
  var d = parseDeadlineDate(l); // FIX 2
  if(!d) return false; // FIX 2
  var now = new Date(); now.setHours(0, 0, 0, 0); // FIX 2
  return d < now; // FIX 2
} // FIX 2
function latestVerified(){ // FIX 2
  var mx = ""; // FIX 2
  state.listings.forEach(function(l){ if(l.lastVerified && l.lastVerified > mx) mx = l.lastVerified; }); // FIX 2
  return mx; // FIX 2
} // FIX 2
function fmtDate(iso){ // FIX 2
  var d = new Date(iso); // FIX 2
  return isNaN(d) ? iso : d.toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"}); // FIX 2
} // FIX 2
function applyFilters(list){
  var f = state.filters;
  return list.filter(function(l){
    if(!f.saved && !state.showExpired && isExpired(l)) return false; // FIX 2
    if(f.search){
      var hay = (l.title+" "+l.company+" "+l.descriptionSnippet+" "+l.field).toLowerCase();
      if(hay.indexOf(f.search.toLowerCase())<0) return false;
    }
    var activeRegions = (f.regions && f.regions.length) ? f.regions : (f.region ? [f.region] : []);
    if(activeRegions.length > 0){
      var matchesRegion = false;
      if(activeRegions.indexOf("India") >= 0 && l.country === "India") matchesRegion = true;
      if(activeRegions.indexOf("Worldwide") >= 0 && (l.country === "Worldwide" || l.workMode === "Remote")) matchesRegion = true;
      if(!matchesRegion) return false;
    }
    var activeKinds = (f.kinds && f.kinds.length) ? f.kinds : (f.kind ? [f.kind] : []);
    if(activeKinds.length > 0){
      if(activeKinds.indexOf(l.kind) < 0) return false;
    }
    if(f.mode && l.workMode!==f.mode) return false;
    if(f.paid && !l.paid) return false;
    if(f.saved && state.bookmarks.indexOf(l.id)<0) return false;
    if(!f.saved && state.profile.field && state.profile.field!=="Other"){
      // Applied profile: show ONLY internships for the chosen field.
      if(l.field !== state.profile.field) return false;
    }
    if(!f.saved && state.profile.degree){
      // Applied profile: degree-level match. Listings that state levels must
      // include the student's level; listings with no levels stay (open to all).
      var lvl = levelOf(state.profile.degree);
      if(lvl && l.levels && l.levels.length && l.levels.indexOf(lvl) < 0) return false;
    }
    return true;
  });
}
function sortList(list){
  var field = state.profile.field;
  return list.slice().sort(function(a,b){
    var af = (field && a.field===field)?0:1, bf = (field && b.field===field)?0:1;
    if(af!==bf) return af-bf;
    return (b.firstSeenAt||"").localeCompare(a.firstSeenAt||"");
  });
}

function renderSources(){ // FIX 6
  var ul = document.getElementById("sourcesList"); if(!ul) return; // FIX 6
  var seen = {}; // FIX 6
  state.listings.forEach(function(l){ if(l.sourceName && !seen[l.sourceName]) seen[l.sourceName] = l.sourceUrl; }); // FIX 6
  ul.innerHTML = ""; // FIX 6
  Object.keys(seen).sort().forEach(function(name){ // FIX 6
    var li = document.createElement("li"); // FIX 6
    var a = document.createElement("a"); // FIX 6
    var href = seen[name]; try { href = new URL(seen[name]).origin; } catch(e){} // FIX 6
    a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = name; // FIX 6
    li.appendChild(a); ul.appendChild(li); // FIX 6
  }); // FIX 6
} // FIX 6
function reportError(l){ // FIX 6
  var ta = document.getElementById("contactMessage"); // FIX 6
  if(ta) ta.value = "Report an error — Listing ID: " + l.id + "\nTitle: " + l.title + "\nWhat is wrong: "; // FIX 6
  var c = document.getElementById("contact"); // FIX 6
  if(c) c.scrollIntoView({behavior:"smooth"}); // FIX 6
  if(ta) ta.focus(); // FIX 6
} // FIX 6
function render(){
  var premium = isPremium();
  document.getElementById("premiumBadge").classList.toggle("hidden", !premium);
  document.getElementById("premiumBtn").textContent = premium ? "⭐ Premium Active" : ("⭐ Go Premium — ₹"+(CFG.premiumPriceRupees||PRICE)); // FIX 5
  var filtered = sortList(applyFilters(state.listings));
  var freeLimit = CFG.freeListingsPerDay || 10;
  var visible = premium ? filtered : filtered.slice(0, freeLimit);
  var lockedCount = filtered.length - visible.length;

  document.getElementById("statTotal").textContent = state.listings.length;
  document.getElementById("statToday").textContent = state.listings.filter(function(l){return l.firstSeenAt===todayStr();}).length;
  document.getElementById("statUpdated").textContent = latestVerified() ? fmtDate(latestVerified()) : (state.generatedAt ? new Date(state.generatedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "—"); // FIX 2
  document.getElementById("showingCount").textContent = "Showing "+visible.length+" of "+filtered.length+" listings" + (lockedCount>0 ? " — "+lockedCount+" more with Premium" : "");

  var grid = document.getElementById("listings");
  grid.innerHTML = "";
  if(!visible.length){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem 1rem;">'+
      '<p class="muted" style="margin-bottom:0.75rem;">No listings match these filters yet. Try clearing a filter.</p>'+
      '<button id="clearFiltersBtn" type="button" class="btn btn-ghost" style="padding:6px 14px;font-size:0.8125rem;">Reset all filters</button>'+
      '</div>';
    var clr = document.getElementById("clearFiltersBtn");
    if(clr){ clr.addEventListener("click", resetAllFilters); }
  }
  visible.forEach(function(l){
    var el = document.createElement("article"); el.className="listing";
    var saved = state.bookmarks.indexOf(l.id)>=0;
    var elig = eligibleTag(l);
    el.innerHTML =
      "<h3></h3><div class='org'></div>"+
      "<div class='meta'></div>"+
      (l.stipendText? "<div><span class='tag paid'>💰 </span></div>":"")+
      (elig? "<div><span class='tag'></span></div>":"")+
      "<p class='desc'></p>"+
      (l.eligibilityText? "<div class='meta elig-meta'>🎓 </div>":"")+ // FIX 2
      "<div class='meta deadline-meta'>⏰ Deadline: <strong></strong></div>"+ // FIX 2
      "<div class='card-actions'><a class='apply' target='_blank' rel='noopener'>Apply on original site →</a>"+
      "<button class='bm'></button><button class='bm report-btn' type='button'>Report an error</button></div>"+ // FIX 6
      "<div class='meta source-meta'>Source: </div>"+ // FIX 2
      "<div class='meta verified-meta'>Last verified: <span></span></div>"; // FIX 2
    el.querySelector("h3").textContent = l.title;
    el.querySelector(".org").textContent = l.company;
    el.querySelectorAll(".meta")[0].textContent = "📍 "+(l.locationText||"—")+(l.workMode? " • "+l.workMode:"")+" • "+l.kind;
    if(l.stipendText) el.querySelector(".tag.paid").textContent = "💰 "+l.stipendText;
    if(elig) el.querySelectorAll(".tag")[l.stipendText?1:0].textContent = elig;
    el.querySelector(".desc").textContent = l.descriptionSnippet||"";
    if(l.eligibilityText){ el.querySelector(".elig-meta").textContent = "🎓 "+l.eligibilityText; } // FIX 2
    el.querySelector(".deadline-meta strong").textContent = l.deadlineText ? (l.deadlineText + (isExpired(l) ? " (Expired)" : "")) : "Rolling / check official site"; // FIX 2
    var a = el.querySelector(".apply"); a.href = l.sourceUrl;
    var sm = el.querySelector(".source-meta"); // FIX 6
    sm.textContent = "Source: "; // FIX 6
    var sa = document.createElement("a"); sa.href = l.sourceUrl; sa.target = "_blank"; sa.rel = "noopener"; sa.textContent = l.sourceName || "official site"; // FIX 6
    sm.appendChild(sa); // FIX 6
    sm.appendChild(document.createTextNode(" • Found: " + (l.firstSeenAt || "—"))); // FIX 6
    el.querySelector(".verified-meta span").textContent = l.lastVerified ? fmtDate(l.lastVerified) : "—"; // FIX 2
    var bm = el.querySelector(".bm"); bm.textContent = saved? "🔖 Saved" : "🔖 Bookmark";
    bm.addEventListener("click", function(){ toggleBookmark(l.id); });
    el.querySelector(".report-btn").addEventListener("click", function(){ reportError(l); }); // FIX 6
    grid.appendChild(el);
  });

  var note = document.getElementById("lockedNote");
  if(lockedCount>0){
    note.classList.remove("hidden");
    note.innerHTML = "<div class='inner'>🔒 <strong>"+lockedCount+" more listings are locked on the free plan.</strong> Premium (₹"+(CFG.premiumPriceRupees||PRICE)+" / "+(CFG.premiumMonths||MONTHS)+" months, UPI only) unlocks the full daily list. <a href='#premiumBox'>See Premium ↓</a></div>";
  } else { note.classList.add("hidden"); note.innerHTML=""; }
  renderTracker(); renderPremiumPay(); renderSources(); // FIX 6
}

function toggleBookmark(id){
  var i = state.bookmarks.indexOf(id);
  if(i>=0){ state.bookmarks.splice(i,1); delete state.tracker[id]; }
  else { state.bookmarks.push(id); if(!state.tracker[id]) state.tracker[id]="Saved"; }
  save(LS.bookmarks, state.bookmarks); save(LS.tracker, state.tracker); render();
}

function renderTracker(){
  var box = document.getElementById("trackerList");
  if(!state.bookmarks.length){ box.innerHTML = '<p class="muted">Bookmark a listing and it will appear here. Set its status as you apply.</p>'; return; }
  box.innerHTML = "";
  state.bookmarks.forEach(function(id){
    var l = state.listings.find(function(x){return x.id===id;}); if(!l) return;
    var row = document.createElement("div"); row.className="tracker-item";
    row.innerHTML = "<span></span><select><option>Saved</option><option>Applied</option><option>Interview</option><option>Selected</option><option>Rejected</option></select>";
    row.querySelector("span").textContent = l.title + " — " + l.company;
    var sel = row.querySelector("select"); sel.value = state.tracker[id]||"Saved";
    sel.addEventListener("change", function(){ state.tracker[id]=sel.value; save(LS.tracker,state.tracker); });
    box.appendChild(row);
  });
}

function renderPremiumPay(){
  var pp = document.getElementById("planPrice"); if(pp) pp.innerHTML = "₹"+(CFG.premiumPriceRupees||PRICE)+" <small>/ "+(CFG.premiumMonths||MONTHS)+" months</small>"; // FIX 5
  var box = document.getElementById("premiumPay");
  if(isPremium()){
    box.innerHTML = "<p>✅ <strong>Premium is active</strong> on this browser until <strong>"+new Date(state.premium.expiresAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})+"</strong>.</p>";
    return;
  }
  if(!CFG.upiId){
    box.innerHTML = "<p class='muted'>💳 <strong>Premium opening soon</strong> — the owner is activating UPI payments. Check back shortly.</p>";
    return;
  }
  var amt = CFG.premiumPriceRupees||PRICE; // FIX 5
  var upiLink = "upi://pay?pa="+encodeURIComponent(CFG.upiId)+"&pn="+encodeURIComponent(CFG.siteName||"Internship Finder")+"&am="+amt+"&cu=INR";
  box.innerHTML = "<p><strong>Pay ₹"+amt+" by UPI:</strong> UPI ID <code>"+CFG.upiId+"</code> &nbsp; <a class='apply' href='"+upiLink+"'>Pay in UPI app →</a></p>"+
    "<p class='muted'>After paying, note your UPI transaction / UTR ID and contact the owner"+(CFG.ownerContact? " ("+CFG.ownerContact+")":"")+" with it. You will receive an activation code — enter it below to unlock Premium for "+(CFG.premiumMonths||MONTHS)+" months on this browser.</p>";
}

function activate(){ // ACCESS-CODE — one shared code, set by the owner in config.js
  var code = document.getElementById("activationInput").value.trim();
  var msg = document.getElementById("activateMsg");
  if(!CFG.accessCode){ msg.textContent = "Access codes are not enabled on this site yet."; return; }
  if(!code){ msg.textContent = "Please enter the access code."; return; }
  if(code !== CFG.accessCode){ msg.textContent = "❌ Wrong access code. Please check and try again."; return; }
  var now = new Date(); var exp = new Date(now); exp.setMonth(exp.getMonth() + (CFG.premiumMonths||MONTHS));
  state.premium = {activatedAt: now.toISOString(), expiresAt: exp.toISOString(), via: "access-code"};
  save(LS.premium, state.premium);
  msg.textContent = "✅ Premium unlocked till "+exp.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})+". Full list unlocked!";
  render();
}

function digest(){
  var list = sortList(applyFilters(state.listings)).slice(0, isPremium()? 50 : (CFG.freeListingsPerDay||10));
  var lines = ["Your Daily Opportunities — "+new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}),
    "For: "+(state.profile.degree||"All degrees")+(state.profile.sem? ", Sem "+state.profile.sem:"")+(state.profile.spec || state.profile.field ? " · "+(state.profile.spec || state.profile.field):""), ""];
  list.forEach(function(l,i){ lines.push((i+1)+". "+l.title+" — "+l.company+(l.stipendText? " ("+l.stipendText+")":"")+(l.deadlineText? " • Deadline: "+l.deadlineText:"")+"\n   "+l.sourceUrl); });
  lines.push("", "Never pay anyone for an internship. Apply only on the original site.");
  document.getElementById("digestText").textContent = lines.join("\n");
  document.getElementById("digestDialog").showModal();
}

// Wire up UI
document.getElementById("siteName").textContent = CFG.siteName || "Internship Finder";
var _cl = document.getElementById("contactLine"); if(_cl) _cl.textContent = "Use the contact form below"; // FIX 3
var pd=document.getElementById("profileDegree"), ps=document.getElementById("profileSem"), pf=document.getElementById("profileField");

// ===== CASCADE — Degree drives Field of Study (specializations) and Semester ===== // CASCADE
var BROAD_FIELDS = ["Environmental Science", "Agriculture", "Life Sciences / Biology", "Biotechnology", "Forestry", "Food Technology", "Veterinary and Animal Sciences", "Earth Sciences / Geology", "Chemistry", "Physics", "Mathematics and Statistics", "Computer Science / IT", "Data Science / AI", "Engineering", "Pharmacy", "Medicine and Health Sciences", "Commerce / Management", "Social Sciences and Humanities", "Law", "Education", "Media and Communication", "Other"]; // CASCADE
// Each specialization maps to ONE existing broad field tag (used for matching). // CASCADE
var DEGREE_FIELDS = { // CASCADE
  "Diploma": [["Civil Engineering","Engineering"],["Mechanical Engineering","Engineering"],["Electrical Engineering","Engineering"],["Computer Engineering","Computer Science / IT"],["Electronics","Engineering"],["Agriculture","Agriculture"],["Pharmacy","Pharmacy"],["Other","Other"]],
  "B.Sc.": [["Botany","Life Sciences / Biology"],["Zoology","Life Sciences / Biology"],["Chemistry","Chemistry"],["Physics","Physics"],["Mathematics","Mathematics and Statistics"],["Statistics","Mathematics and Statistics"],["Environmental Science","Environmental Science"],["Biotechnology","Biotechnology"],["Microbiology","Life Sciences / Biology"],["Computer Science","Computer Science / IT"],["Geology","Earth Sciences / Geology"],["Forestry","Forestry"],["Food Technology","Food Technology"],["Other","Other"]],
  "B.Sc. Agriculture": [["Agronomy","Agriculture"],["Horticulture","Agriculture"],["Soil Science","Agriculture"],["Plant Pathology","Agriculture"],["Entomology","Agriculture"],["Agricultural Economics","Agriculture"],["Genetics and Plant Breeding","Agriculture"],["Agricultural Extension","Agriculture"],["Forestry","Forestry"],["Environmental Science","Environmental Science"],["Food Technology","Food Technology"],["Other","Other"]],
  "B.Tech / B.E.": [["Computer Science","Computer Science / IT"],["IT","Computer Science / IT"],["AI and Data Science","Data Science / AI"],["Mechanical","Engineering"],["Civil","Engineering"],["Electrical","Engineering"],["Electronics and Communication","Engineering"],["Chemical","Engineering"],["Agricultural Engineering","Engineering"],["Biotechnology","Biotechnology"],["Food Technology","Food Technology"],["Environmental Engineering","Environmental Science"],["Other","Other"]],
  "B.A. / B.Com / BBA": [["Economics","Social Sciences and Humanities"],["Political Science","Social Sciences and Humanities"],["History","Social Sciences and Humanities"],["Sociology","Social Sciences and Humanities"],["Psychology","Social Sciences and Humanities"],["English","Social Sciences and Humanities"],["Geography","Social Sciences and Humanities"],["Journalism and Mass Communication","Media and Communication"],["Commerce","Commerce / Management"],["Accounting","Commerce / Management"],["Business Administration","Commerce / Management"],["Education","Education"],["Law","Law"],["Other","Other"]],
  "BCA": [["Computer Applications","Computer Science / IT"],["Other","Other"]],
  "B.Pharm": [["Pharmacy","Pharmacy"],["Other","Other"]],
  "MBBS / BDS": [["Medicine and Dentistry","Medicine and Health Sciences"],["Other","Other"]],
  "BVSc (Veterinary)": [["Veterinary Science","Veterinary and Animal Sciences"],["Other","Other"]],
  "M.Sc.": [["Environmental Science","Environmental Science"],["Botany","Life Sciences / Biology"],["Zoology","Life Sciences / Biology"],["Microbiology","Life Sciences / Biology"],["Biotechnology","Biotechnology"],["Chemistry","Chemistry"],["Physics","Physics"],["Mathematics","Mathematics and Statistics"],["Statistics","Mathematics and Statistics"],["Geology","Earth Sciences / Geology"],["Geography","Earth Sciences / Geology"],["Remote Sensing and GIS","Earth Sciences / Geology"],["Forestry","Forestry"],["Food Technology","Food Technology"],["Data Science","Data Science / AI"],["Computer Science","Computer Science / IT"],["Other","Other"]],
  "M.Sc. Agriculture": [["Agronomy","Agriculture"],["Horticulture","Agriculture"],["Soil Science","Agriculture"],["Plant Pathology","Agriculture"],["Entomology","Agriculture"],["Agricultural Economics","Agriculture"],["Genetics and Plant Breeding","Agriculture"],["Agricultural Extension","Agriculture"],["Agricultural Microbiology","Agriculture"],["Forestry","Forestry"],["Environmental Science","Environmental Science"],["Other","Other"]],
  "M.Tech": [["Computer Science","Computer Science / IT"],["AI and Data Science","Data Science / AI"],["Mechanical","Engineering"],["Civil","Engineering"],["Electrical","Engineering"],["Electronics","Engineering"],["Chemical","Engineering"],["Environmental Engineering","Environmental Science"],["Biotechnology","Biotechnology"],["Food Technology","Food Technology"],["Other","Other"]],
  "M.A. / M.Com / MBA": [["Economics","Social Sciences and Humanities"],["Political Science","Social Sciences and Humanities"],["History","Social Sciences and Humanities"],["Sociology","Social Sciences and Humanities"],["Psychology","Social Sciences and Humanities"],["English","Social Sciences and Humanities"],["Geography","Social Sciences and Humanities"],["Mass Communication","Media and Communication"],["Commerce","Commerce / Management"],["Finance","Commerce / Management"],["Marketing","Commerce / Management"],["HR","Commerce / Management"],["Operations","Commerce / Management"],["Education","Education"],["Law","Law"],["Other","Other"]],
  "MCA": [["Computer Applications","Computer Science / IT"],["Other","Other"]],
  "M.Pharm": [["Pharmaceutics","Pharmacy"],["Pharmacology","Pharmacy"],["Pharmaceutical Chemistry","Pharmacy"],["Other","Other"]],
  "MD / MS (Medical)": [["Medicine","Medicine and Health Sciences"],["Surgery","Medicine and Health Sciences"],["Pediatrics","Medicine and Health Sciences"],["Community Medicine","Medicine and Health Sciences"],["Other","Other"]],
  "MVSc (Veterinary)": [["Veterinary Science","Veterinary and Animal Sciences"],["Other","Other"]],
  "Ph.D / Research": null,
  "Postdoctoral Research": null
}; // CASCADE
var DEGREE_SEM_COUNT = {"Diploma":6, "B.Sc.":6, "B.Sc. Agriculture":8, "B.Tech / B.E.":8, "B.A. / B.Com / BBA":8, "BCA":6, "B.Pharm":8, "MBBS / BDS":10, "BVSc (Veterinary)":10, "M.Sc.":4, "M.Sc. Agriculture":4, "M.Tech":4, "M.A. / M.Com / MBA":4, "MCA":4, "M.Pharm":4, "MD / MS (Medical)":6, "MVSc (Veterinary)":4, "Ph.D / Research":10, "Postdoctoral Research":"NA"}; // CASCADE
function specsFor(degree){ // CASCADE
  if(degree === "Ph.D / Research" || degree === "Postdoctoral Research") return BROAD_FIELDS.map(function(f){ return [f, f]; });
  return DEGREE_FIELDS[degree] || null;
}
function broadOf(degree, spec){ // CASCADE
  var specs = specsFor(degree); if(!specs) return "";
  for(var i = 0; i < specs.length; i++){ if(specs[i][0] === spec) return specs[i][1]; }
  return "";
}
function fillSelect(sel, placeholder, values, selected){ // CASCADE
  sel.innerHTML = "";
  var o = document.createElement("option"); o.value = ""; o.textContent = placeholder; sel.appendChild(o);
  values.forEach(function(v){ var op = document.createElement("option"); op.value = v; op.textContent = v; sel.appendChild(op); });
  sel.value = (selected && values.indexOf(selected) >= 0) ? selected : "";
}
function rebuildFieldSelect(selectedSpec){ // CASCADE
  var degree = pd.value;
  if(!degree){ pf.disabled = true; pf.innerHTML = '<option value="">Select degree first</option>'; return; }
  var specs = specsFor(degree); if(!specs){ pf.disabled = true; pf.innerHTML = '<option value="">Select degree first</option>'; return; }
  pf.disabled = false;
  fillSelect(pf, "Select field of study…", specs.map(function(s){ return s[0]; }), selectedSpec || "");
  if(!selectedSpec){ // CASCADE — single-field degrees auto-select their only specialization
    var nonOther = specs.filter(function(s){ return s[0] !== "Other"; });
    if(nonOther.length === 1) pf.value = nonOther[0][0];
  }
}
function rebuildSemSelect(selectedSem){ // CASCADE
  var degree = pd.value;
  var values = [];
  var n = DEGREE_SEM_COUNT[degree];
  if(n === "NA") values = ["Not applicable"];
  else if(typeof n === "number"){ for(var i = 1; i <= n; i++) values.push(String(i)); }
  values.push("Final year completed");
  fillSelect(ps, "Select semester…", values, selectedSem || "");
}
function rebuildProfileSelects(selectedSpec, selectedSem){ rebuildFieldSelect(selectedSpec); rebuildSemSelect(selectedSem); } // CASCADE
// Restore the saved profile; a saved field that is not valid for the saved degree is cleared. // CASCADE
pd.value = state.profile.degree || "";
var _savedSpec = state.profile.spec || state.profile.field || "";
var _specsNow = specsFor(pd.value);
var _specValid = !!_savedSpec && !!_specsNow && _specsNow.some(function(s){ return s[0] === _savedSpec; });
if(state.profile.degree && _savedSpec && !_specValid){ state.profile.field = ""; state.profile.spec = ""; _savedSpec = ""; save(LS.profile, state.profile); } // CASCADE
rebuildProfileSelects(_specValid ? _savedSpec : "", state.profile.sem || "");
pd.addEventListener("change", function(){ rebuildFieldSelect(""); rebuildSemSelect(ps.value); }); // CASCADE
var applyBtn = document.getElementById("applyProfileBtn");
var profileStatus = document.getElementById("profileStatus");
function profileSummary(p){
  var parts = [];
  if(p.degree) parts.push(p.degree);
  if(p.spec || p.field) parts.push(p.spec || p.field); // CASCADE — show the specialization the user picked
  if(p.sem) parts.push(p.sem === "Not applicable" ? "Not applicable" : "Semester " + p.sem); // CASCADE
  return parts.join(" \u00b7 ");
}
function showSavedStatus(){
  if(!profileStatus) return;
  var s = profileSummary(state.profile);
  profileStatus.className = "profile-status" + (s ? " applied" : "");
  profileStatus.textContent = s ? ("Applied: " + s + " \u2014 listings are matched to you below.") : "Choose your degree, field of study and semester, then apply \u2014 listings will be matched to you.";
}
function profPending(){
  if(!profileStatus) return;
  profileStatus.className = "profile-status pending";
  profileStatus.textContent = "Changes not applied yet \u2014 click Apply changes to see internships for this selection.";
}
[pd,ps,pf].forEach(function(el){ el.addEventListener("change", profPending); });
function applyProfile(){
  var _spec = pf.disabled ? "" : pf.value; // CASCADE
  state.profile = {degree: pd.value, sem: ps.value, field: _spec ? broadOf(pd.value, _spec) : "", spec: _spec}; // CASCADE — filtering matches on the broad tag
  save(LS.profile, state.profile);
  render();
  if(profileStatus){
    var lvl = levelOf(state.profile.degree);
    var fieldMatches = state.profile.field ? state.listings.filter(function(l){ return l.field === state.profile.field; }).length : state.listings.length;
    var eligible = lvl ? state.listings.filter(function(l){ return l.levels && l.levels.indexOf(lvl) >= 0; }).length : 0;
    var s = profileSummary(state.profile);
    profileStatus.className = "profile-status applied";
    if(!s){
      profileStatus.textContent = "Applied: no profile selected \u2014 showing all listings.";
    } else {
      var bits = "Applied: " + s + ".";
      if(state.profile.field) bits += " " + fieldMatches + " listing" + (fieldMatches===1?"":"s") + " in your field, shown first.";
      if(lvl) bits += " " + eligible + " marked eligible for your degree level (" + lvl + ").";
      profileStatus.textContent = bits;
    }
  }
  var target = document.getElementById("listings");
  if(target) target.scrollIntoView({behavior:"smooth", block:"start"});
}
if(applyBtn) applyBtn.addEventListener("click", applyProfile);
showSavedStatus();
document.getElementById("searchBox").addEventListener("input", function(e){ state.filters.search=e.target.value; render(); });
function resetAllFilters(){
  state.profile = {degree:"", sem:"", field:"", spec:""}; // CASCADE
  save(LS.profile, state.profile);
  var _pd=document.getElementById("profileDegree"), _pf=document.getElementById("profileField"), _ps=document.getElementById("profileSem");
  if(_pd) _pd.value=""; if(_pf) _pf.value=""; if(_ps) _ps.value="";
  if(typeof rebuildProfileSelects === "function") rebuildProfileSelects("", ""); // CASCADE
  if(typeof showSavedStatus === "function") showSavedStatus();
  state.showExpired = false; // FIX 2
  var _exp = document.querySelector('.chip[data-filter="expired"]'); if(_exp) _exp.classList.remove("active"); // FIX 2
  state.filters.search = "";
  state.filters.region = "";
  state.filters.regions = [];
  state.filters.kind = "";
  state.filters.kinds = [];
  state.filters.mode = "";
  state.filters.paid = false;
  state.filters.saved = false;
  var sb = document.getElementById("searchBox");
  if(sb) sb.value = "";
  document.querySelectorAll(".chip").forEach(function(c){
    var k = c.getAttribute("data-filter");
    var v = c.getAttribute("data-value");
    if(k === "region" && v === ""){
      c.classList.add("active");
    } else {
      c.classList.remove("active");
    }
  });
  render();
}

document.querySelectorAll(".chip").forEach(function(ch){
  ch.addEventListener("click", function(){
    var kind = ch.getAttribute("data-filter"), val = ch.getAttribute("data-value");
    if(kind==="expired"){ // FIX 2
      state.showExpired = !state.showExpired; // FIX 2
      ch.classList.toggle("active", state.showExpired); // FIX 2
    } // FIX 2
    else if(kind==="paid"){
      state.filters.paid = !state.filters.paid;
      ch.classList.toggle("active", state.filters.paid);
    }
    else if(kind==="saved"){
      state.filters.saved = !state.filters.saved;
      ch.classList.toggle("active", state.filters.saved);
    }
    else if(kind==="mode"){
      var on = state.filters.mode !== val;
      state.filters.mode = on ? val : "";
      ch.classList.toggle("active", on);
    }
    else if(kind==="kind"){
      if(!state.filters.kinds) state.filters.kinds = [];
      var kIdx = state.filters.kinds.indexOf(val);
      if(kIdx >= 0){
        // Deselect
        state.filters.kinds.splice(kIdx, 1);
        ch.classList.remove("active");
      } else {
        // Select
        state.filters.kinds.push(val);
        ch.classList.add("active");
      }
      state.filters.kind = state.filters.kinds.length === 1 ? state.filters.kinds[0] : "";
    }
    else if(kind==="region"){
      if(!state.filters.regions) state.filters.regions = [];
      if(val === ""){
        // "All regions" clicked: clear specific region selections
        state.filters.regions = [];
        state.filters.region = "";
        document.querySelectorAll('.chip[data-filter="region"]').forEach(function(c){
          c.classList.remove("active");
        });
        ch.classList.add("active");
      } else {
        // Toggle specific region (select / deselect)
        var rIdx = state.filters.regions.indexOf(val);
        if(rIdx >= 0){
          state.filters.regions.splice(rIdx, 1);
          ch.classList.remove("active");
        } else {
          state.filters.regions.push(val);
          ch.classList.add("active");
        }
        state.filters.region = state.filters.regions.length === 1 ? state.filters.regions[0] : "";
        var allReg = document.querySelector('.chip[data-filter="region"][data-value=""]');
        if(allReg){
          allReg.classList.toggle("active", state.filters.regions.length === 0);
        }
      }
    }
    render();
  });
});
document.getElementById("premiumBtn").addEventListener("click", function(){ document.getElementById("premiumBox").scrollIntoView({behavior:"smooth"}); });
document.getElementById("activateBtn").addEventListener("click", activate);
document.getElementById("digestBtn").addEventListener("click", digest);
document.getElementById("closeDigest").addEventListener("click", function(){ document.getElementById("digestDialog").close(); });
document.getElementById("copyDigest").addEventListener("click", function(){
  var t=document.getElementById("digestText").textContent;
  if(navigator.clipboard) navigator.clipboard.writeText(t);
});

// Load data: data/listings.json is refreshed daily by the collector script.
function useEmbedded(){
  var d = window.EMBEDDED_LISTINGS;
  if(d && d.listings){ state.listings = d.listings; state.generatedAt = d.generatedAt||null; render(); return true; }
  return false;
}
function setStatsLoading(){ // FIX 1
  ["statTotal", "statPaid", "statIndia", "statToday", "statUpdated"].forEach(function(id){ var el = document.getElementById(id); if(el) el.textContent = "–"; }); // FIX 1
} // FIX 1
function loadListings(){ // FIX 1
  setStatsLoading(); // FIX 1
  var sc = document.getElementById("showingCount"); if(sc) sc.textContent = "Loading listings…"; // FIX 1
  fetch("data/listings.json", {cache:"no-store"}) // FIX 1
    .then(function(r){ if(!r.ok) throw new Error("no data"); return r.json(); }) // FIX 1
    .then(function(d){ state.listings = d.listings||[]; state.generatedAt = d.generatedAt||null; render(); }) // FIX 1
    .catch(function(){ // FIX 1
      if(useEmbedded()) return; // FIX 1
      var sc2 = document.getElementById("showingCount"); if(sc2) sc2.textContent = "Could not load listings."; // FIX 1
      var grid = document.getElementById("listings"); // FIX 1
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem 1rem;" role="alert"><p style="margin-bottom:0.75rem;"><strong>Could not load internships.</strong> Please check your connection and try again.</p><button id="retryLoadBtn" type="button" class="btn btn-primary">Retry</button></div>'; // FIX 1
      var rb = document.getElementById("retryLoadBtn"); // FIX 1
      if(rb) rb.addEventListener("click", function(){ grid.innerHTML = ""; loadListings(); }); // FIX 1
    }); // FIX 1
} // FIX 1
loadListings(); // FIX 1
})();
