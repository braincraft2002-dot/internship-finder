// ============================================================
// OWNER SETTINGS — Praveen, edit ONLY this file to go live.
// ============================================================
// Premium price and duration live in these two constants ONLY. // FIX 5
// Every price mention on the site — the "Go Premium" button, the // FIX 5
// plan card, the locked-listings note, the payment box and the // FIX 5
// Terms page — reads from here. Change them in this one place. // FIX 5
const PRICE = 149; // FIX 5 — Premium price in ₹
const MONTHS = 6; // FIX 5 — Premium duration in months
window.SITE_CONFIG = {
  siteName: "Internship Finder",
  // PLACEHOLDER — your custom domain, e.g. "https://internshipfinder.in". // FIX 3
  // Leave "" while the site lives on its Netlify address; when you buy a // FIX 3
  // domain, set it here once and the whole site can read it from here. // FIX 3
  customDomain: "", // FIX 3
  // Your UPI ID where students pay for Premium, e.g. "yourname@okhdfcbank".
  // Leave "" until you are ready to take payments — the site will then
  // show "Premium opening soon" instead of a payment ID.
  upiId: "",
  // How a student reaches you after paying. The public WhatsApp number // FIX 3
  // was removed: students now use the contact form on the homepage, and // FIX 3
  // your email is shown only inside Terms.html — so this stays "". // FIX 3
  ownerContact: "", // FIX 3
  // ACCESS CODE — set your secret code here. Anyone who enters it on // ACCESS-CODE
  // the site gets Premium free for the full duration below, without // ACCESS-CODE
  // paying. Leave "" to switch access codes off. Change it anytime; // ACCESS-CODE
  // the new code applies to new unlocks (existing unlocks keep their // ACCESS-CODE
  // expiry). Note: this file is public, so treat the code as a      // ACCESS-CODE
  // shareable pass for friends/testers, not a hard paywall.          // ACCESS-CODE
  accessCode: "GODPARTICLE", // ACCESS-CODE — set by Praveen 2026-11-08
  premiumPriceRupees: PRICE, // FIX 5
  premiumMonths: MONTHS, // FIX 5
  freeListingsPerDay: 10,
  // Legacy — kept for JS compatibility. Do not add new codes.
  activationCodes: []
};
