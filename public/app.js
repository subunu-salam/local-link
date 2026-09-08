/* Local Link — SPA frontend (vanilla JS). Talks to the Express API. */
(() => {
'use strict';

/* ---------------- state ---------------- */
let token = localStorage.getItem('ll_token') || null;
let me = safeParse(localStorage.getItem('ll_user'));
const state = {
  view: 'customer',
  lang: localStorage.getItem('ll_lang') || 'en',
  theme: localStorage.getItem('ll_theme') || 'dark',
  areaId: Number(localStorage.getItem('ll_area')) || 1,
  areaName: localStorage.getItem('ll_area_name') || 'Kunnamangalam',
  onboarded: localStorage.getItem('ll_onboarded') === '1',
  aiStatus: { openai: false, model: 'gpt-4o-mini' },
};
let ref = { categories: [], areas: [], panchayaths: [], districts: [], plans: [] };
const nav = { customer: [], partner: [], admin: [] };

/* ---------------- utils ---------------- */
function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }
const $ = (sel, root=document) => root.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const grad = (a,b) => `linear-gradient(135deg,${a},${b||a})`;
const money = (n) => '₹' + Number(n||0).toLocaleString('en-IN');
/* Real photos: fetched live by keyword, stable per seed. Falls back to the
   gradient tile beneath if the image is slow or unavailable (onerror removes it). */
const pic = (kw, seed, w=640, h=520) => `https://loremflickr.com/${w}/${h}/${encodeURIComponent(kw)}/all?lock=${seed}`;
function coverKw(b){ const s=((b&&(b.subcategory||b.category_name))||'').toLowerCase();
  if(/restaurant|hotel|biriyani|food/.test(s)) return 'restaurant,food';
  if(/bakery|cake/.test(s)) return 'bakery,cakes';
  if(/grocery|supermarket|hypermarket|provision/.test(s)) return 'supermarket,grocery';
  if(/meat|seafood|fish/.test(s)) return 'seafood,market';
  if(/vegetable|fruit/.test(s)) return 'vegetables,market';
  if(/jewel|gold/.test(s)) return 'jewellery,gold,shop';
  if(/cloth|fashion|apparel/.test(s)) return 'clothing,boutique';
  if(/electronic|mobile|phone/.test(s)) return 'electronics,store';
  if(/pharma|medical|clinic|dental/.test(s)) return 'pharmacy,clinic';
  if(/ac|appliance|refriger/.test(s)) return 'air,conditioner';
  if(/electric/.test(s)) return 'electrician,tools';
  if(/salon|beauty/.test(s)) return 'salon,beauty';
  if(/auto|car|tyre|garage/.test(s)) return 'car,garage';
  if(/hardware|paint/.test(s)) return 'hardware,tools';
  return 'local,shop,storefront';
}
/* <img> overlaying a gradient tile — real photo when it loads, graceful gradient if not */
function photoLayer(src){ return `<img class="ph" src="${src}" alt="" loading="lazy" onload="this.classList.add('on')" onerror="this.remove()"/>`; }
function toast(msg){ const t = h(`<div class="toast">${esc(msg)}</div>`); $('#toast-host').appendChild(t); setTimeout(()=>{ t.style.opacity='0'; t.style.transition='.3s'; setTimeout(()=>t.remove(),300); }, 2200); }

async function api(pathname, opts={}) {
  const headers = { 'Content-Type':'application/json', ...(opts.headers||{}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + pathname, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

/* ---------------- i18n ---------------- */
const DICT = {
  en: { greetM:'Good morning', greetA:'Good afternoon', greetE:'Good evening', search:'Search businesses, products, services…',
    nearYou:'Near You', offersNear:'Offers Near You', popularServices:'Popular Services', localUpdates:"What's Happening Locally",
    seeAll:'See all', explore:'Explore Local', categories:'Categories', home:'Home', orders:'Orders', notifications:'Alerts', profile:'Profile',
    call:'Call', whatsapp:'WhatsApp', directions:'Directions', share:'Share', about:'About', products:'Products', services:'Services',
    reviews:'Reviews', offers:'Offers', openNow:'Open now', rating:'Rating', nearby:'Nearby', askTitle:'Ask Local Link',
    askPh:'Try “find a plumber” or “biriyani under ₹250”', enquire:'Send enquiry', requestService:'Request service',
    login:'Log in', continue:'Continue', workers:'Workers', transport:'Transport', localInfo:'Local Info', news:'News', events:'Events',
    askHi:'Hi! Ask me to find local businesses, services, workers or rides — type or tap the mic to speak in English or Malayalam.',
    askOffline:'(Offline smart-search — add an OpenAI key on the server for full AI.)',
    chipPlumber:'Find a plumber', chipBiriyani:'Biriyani under ₹250', chipAuto:'Auto to the station', chipGrocery:'Grocery near me', chipAC:'AC repair today' },
  ml: { greetM:'സുപ്രഭാതം', greetA:'ഉച്ചവന്ദനം', greetE:'ശുഭ സന്ധ്യ', search:'സ്ഥാപനങ്ങൾ, ഉൽപ്പന്നങ്ങൾ, സേവനങ്ങൾ തിരയുക…',
    nearYou:'അടുത്തുള്ളവ', offersNear:'അടുത്തുള്ള ഓഫറുകൾ', popularServices:'ജനപ്രിയ സേവനങ്ങൾ', localUpdates:'പ്രാദേശിക വാർത്തകൾ',
    seeAll:'എല്ലാം', explore:'പ്രാദേശികം കണ്ടെത്തുക', categories:'വിഭാഗങ്ങൾ', home:'ഹോം', orders:'ഓർഡറുകൾ', notifications:'അറിയിപ്പുകൾ', profile:'പ്രൊഫൈൽ',
    call:'വിളിക്കുക', whatsapp:'വാട്ട്‌സ്ആപ്പ്', directions:'വഴി', share:'പങ്കിടുക', about:'വിവരം', products:'ഉൽപ്പന്നങ്ങൾ', services:'സേവനങ്ങൾ',
    reviews:'അവലോകനങ്ങൾ', offers:'ഓഫറുകൾ', openNow:'തുറന്നിരിക്കുന്നു', rating:'റേറ്റിംഗ്', nearby:'സമീപം', askTitle:'ലോക്കൽ ലിങ്കിനോട് ചോദിക്കൂ',
    askPh:'“പ്ലംബറെ കണ്ടെത്തൂ” അല്ലെങ്കിൽ “₹250-ൽ താഴെ ബിരിയാണി”', enquire:'അന്വേഷണം അയയ്ക്കുക', requestService:'സേവനം അഭ്യർത്ഥിക്കുക',
    login:'ലോഗിൻ', continue:'തുടരുക', workers:'തൊഴിലാളികൾ', transport:'ഗതാഗതം', localInfo:'പ്രാദേശിക വിവരം', news:'വാർത്ത', events:'പരിപാടികൾ',
    askHi:'നമസ്കാരം! പ്രാദേശിക ബിസിനസ്സുകൾ, സേവനങ്ങൾ, തൊഴിലാളികൾ, യാത്ര എന്നിവ കണ്ടെത്താൻ ചോദിക്കൂ — ടൈപ്പ് ചെയ്യുക അല്ലെങ്കിൽ മൈക്ക് അമർത്തി സംസാരിക്കുക.',
    askOffline:'(ഓഫ്‌ലൈൻ സ്മാർട്ട് സെർച്ച് — പൂർണ്ണ AI-ക്ക് സെർവറിൽ OpenAI കീ ചേർക്കുക.)',
    chipPlumber:'പ്ലംബറെ കണ്ടെത്തൂ', chipBiriyani:'₹250-ൽ താഴെ ബിരിയാണി', chipAuto:'സ്റ്റേഷനിലേക്ക് ഓട്ടോ', chipGrocery:'അടുത്തുള്ള പലചരക്ക്', chipAC:'എസി റിപ്പയർ ഇന്ന്' },
};
const t = (k) => (DICT[state.lang] && DICT[state.lang][k]) || DICT.en[k] || k;
const catLabel = (c) => state.lang==='ml' && c.name_ml ? c.name_ml : c.name;

/* ---------------- icons ---------------- */
const I = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  explore:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-3.6 1.4L10 14l3.6-1.4L15 9Z"/></svg>',
  bag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  ai:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M8.5 8.5 6.5 6.5M17.5 17.5l-2-2M15.5 8.5l2-2M6.5 17.5l2-2"/><circle cx="12" cy="12" r="3.4"/></svg>',
  phone:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.5 21 3 13.5 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2Z"/></svg>',
  wa:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9 1-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.3-.1.6.1.3.7 1.1 1.4 1.7.9.8 1.6 1 1.9 1.2.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.2.1.7-.1 1.2Z"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-3.9 0-7 3-7 6.9 0 4.6 5.5 10.4 6.4 11.3.3.3.9.3 1.2 0 .9-.9 6.4-6.7 6.4-11.3C19 5 15.9 2 12 2Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>',
  dir:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-8-8 18-2-8-8-2Z"/></svg>',
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.7 7.6-4.4M8.2 13.3l7.6 4.4"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8 3 5 6 5c1.9 0 3 1 3 1s1.1-1 3-1c3 0 4.8 3 3.2 6.4C19 15.6 12 20 12 20Z"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6 6.6.6-5 4.3 1.5 6.5L12 16l-5.9 3.4L7.6 13l-5-4.3L9.1 8 12 2Z"/></svg>',
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  store:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1-5H5L4 9Z"/><path d="M5 9v11h14V9"/><path d="M9 20v-5h6v5"/></svg>',
  tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12 12 3h8v8l-9 9-8-8Z"/><circle cx="16" cy="8" r="1.4"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c1-3.5 4-5 6-5s5 1.5 6 5"/><path d="M17 5a3 3 0 0 1 0 6"/></svg>',
  cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4"/><path d="M10 12h9M13 8l-4 4 4 4"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
};
const ic = (name) => `<span class="ic-svg">${I[name]||''}</span>`;

/* ---------- premium line-icon set (lucide-style, replaces all emoji) ---------- */
const _s='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
const GI = {
  store:_s+'<path d="M4 9h16l-1-4H5L4 9Z"/><path d="M5 9v10h14V9"/><path d="M9 19v-5h6v5"/></svg>',
  fork:_s+'<path d="M7 3v18M5 3v5a2 2 0 0 0 4 0V3"/><path d="M17 3c-1.7 0-3 2-3 5s1 4 3 4.5V21"/></svg>',
  cart:_s+'<circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M2 4h2l2.2 11.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19 8H5.5"/></svg>',
  bread:_s+'<path d="M5 12a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v0H5Z"/><path d="M5 12h14v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4Z"/></svg>',
  fish:_s+'<path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z"/><circle cx="9" cy="12" r=".7" fill="currentColor"/><path d="M18 9.5c1 1 1 4 0 5"/></svg>',
  leaf:_s+'<path d="M20 4C9 4 4 9 4 18c0 0 8 1.5 12-4 3-4 4-10 4-10Z"/><path d="M5 19c3.5-7 9-10.5 13-11.5"/></svg>',
  diamond:_s+'<path d="M6 4h12l3 5-9 11L3 9l3-5Z"/><path d="M3 9h18M9 4l-1.5 5L12 20l4.5-11L15 4"/></svg>',
  shirt:_s+'<path d="M6 4l3-1a3 3 0 0 0 6 0l3 1 2 4-3 1v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9L4 8l2-4Z"/></svg>',
  device:_s+'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg>',
  cross:_s+'<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3Z"/></svg>',
  snow:_s+'<path d="M12 2v20M4.9 6.5l14.2 11M19.1 6.5 4.9 17.5"/><path d="M12 5 9.5 7.5 12 5l2.5 2.5M12 19l-2.5-2.5M12 19l2.5-2.5M5 9l.7 3.2L3 11M19 9l-.7 3.2L21 11M5 15l.7-3.2M19 15l-.7-3.2"/></svg>',
  bolt:_s+'<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
  wrench:_s+'<path d="M20 5a4 4 0 0 1-5.3 5.3L7 18l-2-2 7.7-7.7A4 4 0 0 1 18 3l-2.3 2.3 1.5 1.5L20 5Z"/></svg>',
  scissors:_s+'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 8l12 8M8 16 20 8"/></svg>',
  car:_s+'<path d="M5 11l1.4-4.2A2 2 0 0 1 8.3 5.5h7.4a2 2 0 0 1 1.9 1.3L19 11"/><path d="M4 16v-3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3h-2M6 16H4M20 16h-2M6 16v1.5M18 16v1.5"/><circle cx="7.5" cy="16" r="1.2"/><circle cx="16.5" cy="16" r="1.2"/></svg>',
  package:_s+'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>',
  nut:_s+'<path d="M8 3.5h8l4 8.5-4 8.5H8l-4-8.5L8 3.5Z"/><circle cx="12" cy="12" r="3"/></svg>',
  helmet:_s+'<path d="M3 14a9 9 0 0 1 18 0"/><path d="M3 14h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2ZM9 14V7h2M13 14V8"/></svg>',
  bank:_s+'<path d="M3 10 12 4l9 6M4 10v8M20 10v8M8 10v8M16 10v8M3 20h18"/></svg>',
  cap:_s+'<path d="M2 8l10-4 10 4-10 4L2 8Z"/><path d="M6 10v5c0 1 3 2.5 6 2.5s6-1.5 6-2.5v-5M22 8v5"/></svg>',
  shield:_s+'<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/></svg>',
  flame:_s+'<path d="M12 3c1 3 5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 2 0 0-2-1-3-1-5Z"/></svg>',
  building:_s+'<path d="M4 21V6l8-3 8 3v15M3 21h18M9 21v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/></svg>',
  calendar:_s+'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
  news:_s+'<rect x="3" y="4" width="14" height="16" rx="1.5"/><path d="M17 8h4v10a2 2 0 0 1-2 2M6 8h5M6 12h5M6 16h4"/></svg>',
  percent:_s+'<path d="M5 19 19 5"/><circle cx="7.5" cy="7.5" r="2.2"/><circle cx="16.5" cy="16.5" r="2.2"/></svg>',
  inbox:_s+'<path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6L5 5Z"/><path d="M3 13h5l1 3h6l1-3h5"/></svg>',
  lock:_s+'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  compass:_s+'<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-4 1 2-5 4-1Z"/></svg>',
  megaphone:_s+'<path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M16 8a4 4 0 0 1 0 8"/></svg>',
  card:_s+'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
  chat:_s+'<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>',
  clock:_s+'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  warning:_s+'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v5M12 18h.01"/></svg>',
  mic:_s+'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
  send:_s+'<path d="M4.5 12 20 5l-6.5 15-2.2-6.3L4.5 12Z"/></svg>',
};
Object.assign(GI, { search:I.search, heart:I.heart, star:I.star, bell:I.bell, bag:I.bag, tag:I.tag, users:I.users, user:I.user, pin:I.pin, cog:I.cog });
const CAT_ICON = { 'food-grocery':'fork','shopping':'shirt','services':'wrench','workers':'helmet','transport':'car','healthcare':'cross','local-info':'building','news':'news','events':'calendar','classifieds':'percent' };
const SUB_ICON = [
  [/restaurant|hotel|biriyani|meals|cafe|café|dining|food/,'fork'],
  [/grocery|supermarket|super ?market|hypermarket|provision|mart/,'cart'],
  [/bakery|bake|cake|puff/,'bread'],
  [/meat|seafood|fish|chicken|butcher/,'fish'],
  [/vegetable|fruit|\bveg\b/,'leaf'],
  [/jewel|gold|diamond/,'diamond'],
  [/cloth|fashion|boutique|apparel|footwear|textile/,'shirt'],
  [/electronic|mobile|laptop|digital|gadget/,'device'],
  [/pharma|medical|medicine|chemist|clinic|dental|hospital|doctor|health/,'cross'],
  [/\bac\b|air ?condition|fridge|refriger|washing|appliance/,'snow'],
  [/electric|wiring|electrician/,'bolt'],
  [/plumb|carpenter|wood|furniture|repair|fitting/,'wrench'],
  [/salon|beauty|barber|hair|makeup|spa/,'scissors'],
  [/tyre|tire|auto ?care|automotive|garage|denting|car ?wash/,'car'],
  [/hardware|paint|tools|building material/,'nut'],
  [/taxi|cab/,'car'],[/courier|delivery|parcel/,'package'],
  [/bank|atm/,'bank'],[/school|college|\bnit\b|education|tuition|academy/,'cap'],
  [/police/,'shield'],[/fire/,'flame'],[/ambulance|blood/,'cross'],
  [/govern|panchayath|village office|municipal|corporation/,'building'],
];
function iconKeyFor(o, fallback){
  const s = ((o.subcategory||'')+' '+(o.name||'')+' '+(o.category||'')+' '+(o.skills||'')+' '+(o.service_type||'')).toLowerCase();
  for (const [re,ic2] of SUB_ICON) if (re.test(s)) return ic2;
  if (o.category_slug && CAT_ICON[o.category_slug]) return CAT_ICON[o.category_slug];
  return fallback || 'store';
}
function gi(name){ return `<span class="gi">${GI[name]||GI.store}</span>`; }
function catIcon(slug){ return `<span class="gi">${GI[CAT_ICON[slug]||'store']}</span>`; }
function dIcon(o, fallback){ return `<span class="gi">${GI[iconKeyFor(o,fallback)]||GI.store}</span>`; }
function driverIcon(t){ return gi(t==='delivery'?'package':'car'); }

/* ---------------- shell ---------------- */
function applyTheme(){
  const root = document.documentElement;
  if (state.theme==='system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
}
function stars(r){ return `<span class="stars">${I.star}${Number(r||0).toFixed(1)}</span>`; }

function miniControls(){
  return `<div class="mini-ctrl">
    <div class="lang-toggle" data-mini-lang><button data-l="en" class="${state.lang==='en'?'on':''}">EN</button><button data-l="ml" class="${state.lang==='ml'?'on':''}">മ</button></div>
    <button class="tb-btn" data-mini-theme title="Theme">${I.sun}</button></div>`;
}
function renderShell(){
  applyTheme();
  document.body.classList.toggle('ml', state.lang==='ml');
  document.body.dataset.app = state.view;
  const stage = $('#stage');
  if (state.view==='admin'){ stage.innerHTML = `<div class="admin-shell" id="adminshell"></div>`; renderAdmin($('#adminshell')); return; }
  if (state.view==='launcher'){ renderLauncher(stage); return; }
  // customer / partner render as a standalone full-screen mobile app
  stage.innerHTML = `<div class="appwrap"><div class="phone"><div class="screen" id="screen"></div><div id="navholder"></div></div></div>`;
  if (!nav[state.view].length) nav[state.view].push(state.view==='customer'
    ? (state.onboarded ? {name:'home'} : {name:'splash'})
    : {name: token && me && me.role==='business_partner' ? 'p_dash' : 'p_login'});
  routeRender();
}
function cycleTheme(){ state.theme = state.theme==='system'?'light':state.theme==='light'?'dark':'system'; localStorage.setItem('ll_theme',state.theme); applyTheme(); const b=document.querySelector('[data-mini-theme]'); toast('Theme: '+state.theme); }

function openView(view){
  state.view = view;
  const path = view==='partner'?'/partner':view==='admin'?'/admin':view==='launcher'?'/apps':'/';
  try{ history.pushState({view}, '', path); }catch(e){}
  renderShell();
}
function renderLauncher(stage){
  stage.innerHTML = `<div class="launcher">
    <div class="launch-hero">${logoMark(76)}<h1>Local Link</h1><p>Everything Local. One Place.</p></div>
    <div class="launch-grid">
      ${[['customer','Customer App','Discover shops, services, offers & more near you',GI.compass,'/'],
         ['partner','Partner App','Manage your business, products & orders',GI.store,'/partner'],
         ['admin','Admin Panel','CRM to run the whole platform',GI.wrench,'/admin']].map(([v,t2,d,e,p])=>`
        <button class="launch-card" data-view="${v}">
          <div class="lc-ic">${e}</div><h3>${t2}</h3><p>${d}</p><span class="lc-link">Open ${p} ${I.chev}</span></button>`).join('')}
    </div>
    <p class="faint" style="text-align:center;margin-top:26px;font-size:12.5px">Three separate apps · one backend · one login system</p></div>`;
  stage.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>openView(b.dataset.view));
}

function logoMark(size=26){
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 44" fill="none" aria-hidden="true">
    <path d="M20 2c8 0 14 6.5 14 14.5C34 27 24 37 20 42 16 37 6 27 6 16.5 6 8.5 12 2 20 2Z" fill="url(#lg${size})"/>
    <g fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round">
      <circle cx="24" cy="20" r="5.6"/><circle cx="16.5" cy="14.5" r="5.6"/>
      <path d="M20.6 18.6a5.6 5.6 0 0 1-8 0" stroke="#fff"/></g>
    <circle cx="16.5" cy="14.5" r="1.7" fill="#FF7A59"/>
    <defs><linearGradient id="lg${size}" x1="6" y1="2" x2="34" y2="42" gradientUnits="userSpaceOnUse">
      <stop stop-color="#14B8A6"/><stop offset="1" stop-color="#0B5A55"/></linearGradient></defs></svg>`;
}


/* ---------------- customer router ---------------- */
function stack(){ return nav[state.view]; }
function go(routeName, params){ stack().push({name:routeName, params:params||{}}); routeRender(); const s=$('#screen'); if(s) s.scrollTop=0; }
function back(){ if(stack().length>1){ stack().pop(); routeRender(); } }
function setTab(routeName){ nav[state.view]=[{name:routeName}]; routeRender(); }

const SCREENS = {};
async function routeRender(){
  const cur = stack()[stack().length-1];
  const screen = $('#screen');
  if (!screen) return;
  screen.scrollTop = 0;                 // always start a screen at the top (fixes "stuck in middle")
  const fn = SCREENS[cur.name];
  if (!fn){ screen.innerHTML = emptyState('compass','Screen not found',''); return; }
  try { await fn(screen, cur.params||{}); }
  catch(e){ screen.innerHTML = errorState(e.message, ()=>routeRender()); }
  screen.scrollTop = 0;                 // and again after async data loads
  renderBottomNav();
}

/* ---------------- reusable components ---------------- */
function skeletonRow(n=3){ return `<div class="stack" style="gap:12px">${Array(n).fill(`<div class="sk" style="height:92px;border-radius:16px"></div>`).join('')}</div>`; }
function skeletonCards(n=3){ return `<div class="row" style="gap:13px;overflow:hidden">${Array(n).fill(`<div class="sk" style="height:180px;width:220px;flex:0 0 auto;border-radius:16px"></div>`).join('')}</div>`; }
function emptyState(icon,title,sub,cta){ const g = GI[icon]?`<span class="gi">${GI[icon]}</span>`:(String(icon).startsWith('<')?icon:`<span class="gi">${GI.inbox}</span>`); return `<div class="empty"><div class="eic">${g}</div><h4 style="font-size:16px;color:var(--ink)">${esc(title)}</h4><p style="max-width:230px">${esc(sub||'')}</p>${cta||''}</div>`; }
function errorState(msg,retry){ const id='rt'+Math.random().toString(36).slice(2); setTimeout(()=>{const b=document.getElementById(id); if(b&&retry)b.onclick=retry;},0);
  return `<div class="empty"><div class="eic">${gi('warning')}</div><h4 style="font-size:16px;color:var(--ink)">Something went wrong</h4><p>${esc(msg||'')}</p><button id="${id}" class="btn ghost sm">Try again</button></div>`; }

function businessCard(b){
  const off = b.offer_label ? `<span class="badge accent off">${esc(b.offer_label)}</span>` : '';
  const cover = b.cover_url || pic(coverKw(b), b.id, 480, 300);
  return `<button class="bcard" data-nav="business" data-id="${b.id}">
    <div class="banner" style="background:${grad(b.color1,b.color2)}">${photoLayer(cover)}${off}
      <span class="emoji">${dIcon(b)}</span>
      <span class="fav">${I.heart}</span></div>
    <div class="body"><h4>${esc(b.name)}</h4>
      <div class="meta">${stars(b.rating)}<span class="dot"></span><span>${esc(b.subcategory||b.category_name||'')}</span></div>
      <div class="meta"><span class="badge ${b.is_open?'open':'closed'}">${b.is_open?'Open':'Closed'}</span><span class="dot"></span><span>${esc(b.area_name||'')}</span></div>
    </div></button>`;
}
function catCard(c){ return `<button class="cat" data-nav="category" data-slug="${c.slug}">
  <span class="ic" style="background:${grad(c.color1,c.color2)}">${catIcon(c.slug)}</span><span>${esc(catLabel(c))}</span></button>`; }
function offerCard(o){ return `<button class="ocard" data-nav="business" data-id="${o.business_id}" style="background:${grad(o.color1,o.color2)}">
  <span class="badge tag">${esc(o.discount_label||'OFFER')}</span>
  <div><h4>${esc(o.title)}</h4><div class="biz">${esc(o.business||'')}</div></div>
  <span class="disc">%</span></button>`; }
function productCard(p, biz){ const disc = p.mrp && p.mrp>p.price;
  const src = p.image_url || pic((p.name||'product').toLowerCase(), 500+(p.id||0));
  const off = disc ? `<span class="poff">${Math.round((1-p.price/p.mrp)*100)}% OFF</span>` : '';
  const oos = p.stock_status==='out_of_stock';
  return `<div class="pcard"><div class="pimg" style="background:${grad(biz?biz.color1:'#12A594', biz?biz.color2:'#0C7A6E')}">${photoLayer(src)}${off}${dIcon({name:p.name, category_slug: biz&&biz.category_slug},'cart')}<span class="add" data-add="1">+</span></div>
    <div class="pb"><h4>${esc(p.name)}</h4>${p.unit?`<div class="punit">${esc(p.unit)}</div>`:''}<div class="price">${money(p.price)}${disc?`<span class="old">${money(p.mrp)}</span>`:''}${oos?'<span class="oos">Out of stock</span>':''}</div></div></div>`; }
function serviceCard(s){ return `<button class="brow" data-nav="business" data-id="${s.business_id||s.id}" style="text-align:left">
  <div class="thumb" style="background:${grad('#6366F1','#4338CA')}">${dIcon(s,'wrench')}</div>
  <div class="info"><h4>${esc(s.name)}</h4><div class="muted" style="font-size:12.5px;margin-top:2px">${esc(s.business||'')}</div>
    <div class="row" style="gap:8px;margin-top:7px">${stars(s.rating)}<span class="badge primary">from ${money(s.starting_price)}</span></div></div>
  <span class="chev" style="align-self:center;color:var(--faint);width:18px">${I.chev}</span></button>`; }
function newsCard(n){ return `<button class="ncard" data-nav="newsDetail" data-id="${n.id}" style="text-align:left">
  <div class="nimg" style="background:${grad(n.color1,n.color2)}">${gi('news')}</div>
  <div class="nb"><span class="badge neutral">${esc(n.category)}</span><h4 style="margin-top:7px">${esc(n.title)}</h4></div></button>`; }
function eventCard(e){ const d=new Date(e.start_date); const day=isNaN(d)?'--':d.getDate(); const mon=isNaN(d)?'':d.toLocaleString('en',{month:'short'}).toUpperCase();
  return `<div class="ecard"><div class="date"><b>${day}</b><span>${mon}</span></div>
    <div class="info" style="flex:1"><h4 style="font-size:14.5px">${esc(e.title)}</h4>
      <div class="muted" style="font-size:12px;margin-top:4px">${I.pin.replace('viewBox','style="width:12px;height:12px;vertical-align:-2px;fill:var(--muted)" viewBox')} ${esc(e.venue)}</div>
      <div class="muted" style="font-size:12px;margin-top:2px">${gi('clock')} ${esc(e.time_label||'')}</div></div></div>`; }

function sectionHead(title, action){ return `<div class="sec-head px"><h3>${esc(title)}</h3>${action?`<button class="see" data-nav="${action.route}" ${action.slug?`data-slug="${action.slug}"`:''}>${t('seeAll')}</button>`:''}</div>`; }

/* delegate nav clicks */
document.addEventListener('click', (e) => {
  const nb = e.target.closest('[data-nav]'); if (!nb) return;
  const r = nb.dataset.nav;
  if (r==='business') go('business',{id:Number(nb.dataset.id)});
  else if (r==='category') go('category',{slug:nb.dataset.slug});
  else if (r==='newsDetail') go('newsDetail',{id:Number(nb.dataset.id)});
  else if (r==='catlist') go('category',{slug:nb.dataset.slug});
  else go(r, nb.dataset.slug?{slug:nb.dataset.slug}:{});
});

/* ---------------- bottom nav ---------------- */
function renderBottomNav(){
  const holder = $('#navholder'); if(!holder) return;
  const cur = stack()[stack().length-1].name;
  if (state.view==='customer'){
    if (cur==='splash'||cur==='location'){ holder.innerHTML=''; return; }
    const items=[['home','home',t('home')],['explore','explore',t('explore').split(' ')[0]],['ask','ai','Ask'],['orders','bag',t('orders')],['profile','user',t('profile')]];
    holder.innerHTML = `<div class="bnav">${items.map(([r,icn,lab],i)=>{
      if(r==='ask') return `<button class="fab" data-tabnav="ask"><span class="cir">${I.ai}</span></button>`;
      const on = cur===r?'on':''; return `<button class="${on}" data-tabnav="${r}">${I[icn]}<span>${esc(lab)}</span></button>`;
    }).join('')}</div>`;
  } else if (state.view==='partner'){
    if (cur==='p_login'){ holder.innerHTML=''; return; }
    const items=[['p_dash','home','Home'],['p_products','store','Products'],['p_orders','bag','Orders'],['p_enquiries','bell','Enquiries'],['p_profile','user','Profile']];
    holder.innerHTML = `<div class="bnav">${items.map(([r,icn,lab])=>`<button class="${cur===r?'on':''}" data-tabnav="${r}">${I[icn]}<span>${esc(lab)}</span></button>`).join('')}</div>`;
  }
  holder.querySelectorAll('[data-tabnav]').forEach(b=>b.onclick=()=>{ const r=b.dataset.tabnav; if(r==='ask'){ openAsk(); } else setTab(r); });
}

/* ==================== CUSTOMER SCREENS ==================== */
SCREENS.splash = (el) => {
  el.innerHTML = `<div class="splash">
    <div class="pulse">${logoMark(96)}</div>
    <h1>Local Link</h1><p>Everything Local. One Place.</p>
    <div style="height:8px"></div>
    <div class="sk" style="width:120px;height:5px;background:rgba(255,255,255,.35)"></div></div>`;
  setTimeout(()=>{ if(stack()[stack().length-1].name==='splash'){ nav.customer=[{name: state.onboarded?'home':'location'}]; routeRender(); } }, 1400);
};

SCREENS.location = (el) => {
  el.innerHTML = `<div class="auth-wrap">
    <div class="auth-hero">${logoMark(64)}<h2 style="font-size:22px">Discover what's around you</h2>
      <p class="muted" style="font-size:14px;max-width:280px">Find nearby businesses, services, offers, transport and local information — instantly.</p></div>
    <div class="card" style="padding:6px;margin-bottom:16px">
      <div class="plist" style="border:none">
        <button id="gps"><span class="ic">${I.pin}</span><div><div style="font-weight:600">Use my location</div><div class="muted" style="font-size:12px">Detect automatically (demo → Kunnamangalam)</div></div><span class="chev">${I.chev}</span></button>
      </div></div>
    <div class="muted" style="font-size:12px;font-weight:600;margin:6px 4px 10px">OR CHOOSE YOUR AREA</div>
    <div id="arealist" class="stack" style="gap:8px"></div>
    <div style="flex:1"></div></div>`;
  $('#gps').onclick = ()=>pickArea(1,'Kunnamangalam');
  const areasByP = {};
  ref.areas.forEach(a=>{ const p=ref.panchayaths.find(x=>x.id===a.panchayath_id); (areasByP[p?p.name:'Other']=areasByP[p?p.name:'Other']||[]).push(a); });
  $('#arealist').innerHTML = ref.areas.slice(0,8).map(a=>{ const p=ref.panchayaths.find(x=>x.id===a.panchayath_id);
    return `<button class="brow" data-area="${a.id}" data-name="${esc(a.name)}" style="padding:12px 14px">
      <div class="thumb" style="width:40px;height:40px;font-size:18px;background:${grad('#14B8A6','#0B5A55')}">${I.pin.replace('fill="currentColor"','fill="#fff"')}</div>
      <div class="info"><h4 style="font-size:14px">${esc(a.name)}</h4><div class="muted" style="font-size:12px">${esc(p?p.name:'')}, Kozhikode</div></div>
      <span class="chev" style="align-self:center;color:var(--faint);width:18px">${I.chev}</span></button>`; }).join('');
  el.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>pickArea(Number(b.dataset.area), b.dataset.name));
};
function pickArea(id,name){ state.areaId=id; state.areaName=name; state.onboarded=true;
  localStorage.setItem('ll_area',id); localStorage.setItem('ll_area_name',name); localStorage.setItem('ll_onboarded','1');
  nav.customer=[{name:'home'}]; routeRender(); toast('Location set to '+name); }

SCREENS.home = async (el) => {
  const hour=new Date().getHours(); const greet = hour<12?t('greetM'):hour<17?t('greetA'):t('greetE');
  const name = me? me.name.split(' ')[0] : 'there';
  el.innerHTML = `
    <div class="chead">
      <div class="row" style="justify-content:space-between">
        <div><div class="loc">${I.pin.replace('fill="currentColor"','fill="var(--primary)" style="width:15px;height:15px;vertical-align:-2px"')} ${esc(state.areaName)} <button data-tabnav-loc style="color:var(--primary);font-size:12px;font-weight:700">Change</button></div>
          <div class="muted" style="font-size:12.5px;margin-top:2px">${greet}, <b style="color:var(--ink)">${esc(name)}</b></div></div>
        <div class="row" style="gap:8px">${miniControls()}
        <button class="avatar" data-tabnav-p style="background:${grad(me?me.avatar_color:'#0D9488','#0B5A55')}">${(name[0]||'A').toUpperCase()}</button></div>
      </div>
      <button class="searchbar" data-nav="searchScreen" style="width:100%;margin-top:12px">${I.search}<span style="flex:1;text-align:left">${t('search')}</span></button>
    </div>
    <div class="px" style="margin-top:14px"><div class="catgrid" id="cats"></div></div>
    <div id="offers"></div><div id="near"></div><div id="svcs"></div><div id="updates"></div>
    <div style="height:96px"></div>`;
  el.querySelector('[data-tabnav-loc]').onclick=()=>go('location');
  el.querySelector('[data-tabnav-p]').onclick=()=>setTab('profile');
  const cats = ref.categories.slice(0,8);
  $('#cats').innerHTML = cats.map(catCard).join('') ;
  // sections load in parallel
  $('#offers').innerHTML = sectionHead(t('offersNear'),{route:'offers'}) + `<div class="hscroll" id="offw">${skeletonCards(2)}</div>`;
  $('#near').innerHTML = sectionHead(t('nearYou'),{route:'explore'}) + `<div class="hscroll" id="nearw">${skeletonCards(3)}</div>`;
  $('#svcs').innerHTML = sectionHead(t('popularServices')) + `<div class="px stack" id="svcw" style="gap:10px">${skeletonRow(2)}</div>`;
  $('#updates').innerHTML = sectionHead(t('localUpdates'),{route:'news'}) + `<div class="hscroll" id="newsw">${skeletonCards(2)}</div>` + `<div class="px stack" id="evw" style="gap:10px;margin-top:12px"></div>`;
  const [offers, biz, svcs, news, events] = await Promise.all([
    api('/offers'), api(`/businesses?featured=1`), api('/services'), api('/news'), api('/events')
  ]);
  $('#offw').innerHTML = offers.slice(0,6).map(offerCard).join('') || emptyState('percent','No offers yet','');
  $('#nearw').innerHTML = biz.slice(0,8).map(businessCard).join('');
  $('#svcw').innerHTML = svcs.slice(0,4).map(serviceCard).join('');
  $('#newsw').innerHTML = news.slice(0,5).map(newsCard).join('');
  $('#evw').innerHTML = `<div class="sec-head" style="margin:8px 0 4px"><h3 style="font-size:15px">${t('events')}</h3></div>` + events.slice(0,3).map(eventCard).join('');
};

SCREENS.explore = async (el) => {
  el.innerHTML = `<div class="chead"><h2 style="font-size:21px">${t('explore')}</h2>
    <button class="searchbar" data-nav="searchScreen" style="width:100%;margin-top:10px">${I.search}<span style="flex:1;text-align:left">${t('search')}</span></button></div>
    <div class="px" style="margin-top:14px"><div class="catgrid big" id="cg"></div><div style="height:96px"></div></div>`;
  $('#cg').innerHTML = ref.categories.map(catCard).join('');
};

SCREENS.category = async (el, {slug}) => {
  const cat = ref.categories.find(c=>c.slug===slug) || {name:'Category', slug:'', kind:'business'};
  el.innerHTML = `${topbarBack(catLabel(cat))}
    <div class="px"><div class="hscroll" style="padding:6px 0 4px" id="filters">
      ${['All','Open now','Top rated','Offers'].map((f,i)=>`<button class="chip ${i===0?'on':''}" data-f="${f}">${f}</button>`).join('')}
    </div></div><div class="px stack" id="list" style="gap:11px">${skeletonRow(4)}</div><div style="height:90px"></div>`;
  backWire(el);
  let data=[];
  if (cat.kind==='worker'){ data = await api('/workers'); renderWorkers($('#list'),data); }
  else if (cat.kind==='driver'){ data = await api('/drivers'); renderDrivers($('#list'),data); }
  else if (cat.kind==='info'){ data = await api('/local-info'); renderLocalInfo($('#list'),data); }
  else if (slug==='news'){ setTab('news'); return; }
  else if (slug==='events'){ data = await api('/events'); $('#list').innerHTML = data.map(eventCard).join(''); }
  else {
    data = await api(`/businesses?category=${slug}`);
    const draw=(items)=> $('#list').innerHTML = items.length? items.map(b=>bizRow(b)).join('') : emptyState('search','Nothing here yet','Try another area or category.');
    draw(data);
    $('#filters').addEventListener('click', e=>{ const b=e.target.closest('.chip'); if(!b)return;
      el.querySelectorAll('#filters .chip').forEach(x=>x.classList.remove('on')); b.classList.add('on');
      let f=[...data]; const k=b.dataset.f;
      if(k==='Open now') f=f.filter(x=>x.is_open); if(k==='Top rated') f.sort((a,b)=>b.rating-a.rating);
      draw(f); });
  }
};
function bizRow(b){ return `<button class="brow" data-nav="business" data-id="${b.id}" style="text-align:left">
  <div class="thumb" style="background:${grad(b.color1,b.color2)}">${dIcon(b)}</div>
  <div class="info"><div class="row" style="justify-content:space-between"><h4>${esc(b.name)}</h4>${stars(b.rating)}</div>
    <div class="muted" style="font-size:12.5px;margin-top:3px">${esc(b.subcategory||'')} · ${esc(b.area_name||'')}</div>
    <div class="row" style="gap:7px;margin-top:7px"><span class="badge ${b.is_open?'open':'closed'}">${b.is_open?t('openNow'):'Closed'}</span>
      <span class="muted" style="font-size:11.5px">${esc(b.hours_label||'')}</span></div></div></button>`; }

function renderWorkers(elm,data){ elm.innerHTML = data.map(w=>`
  <div class="brow"><div class="thumb" style="background:${grad(w.color1,w.color2)}">${dIcon(w,'helmet')}</div>
    <div class="info"><div class="row" style="justify-content:space-between"><h4>${esc(w.name)}</h4>${stars(w.rating)}</div>
      <div class="muted" style="font-size:12.5px;margin-top:3px">${esc(w.skills)}</div>
      <div class="row" style="gap:7px;margin-top:7px"><span class="badge primary">${esc(w.rate)}</span><span class="badge ${w.available?'open':'neutral'}">${w.available?'Available':'Busy'}</span>
        <span class="muted" style="font-size:11.5px">${w.experience_years}y exp · ${esc(w.area_name||'')}</span></div>
      <div class="row" style="gap:8px;margin-top:9px">
        <a class="btn sm" href="tel:${w.phone}">${I.phone} Call</a>
        <a class="btn sm accent" href="https://wa.me/${(w.whatsapp||'').replace(/[^0-9]/g,'')}" target="_blank" rel="noopener">${I.wa} WhatsApp</a></div>
    </div></div>`).join(''); }
function renderDrivers(elm,data){ elm.innerHTML = data.map(d=>`
  <div class="brow"><div class="thumb" style="background:${grad('#0EA5E9','#0369A1')}">${driverIcon(d.service_type)}</div>
    <div class="info"><div class="row" style="justify-content:space-between"><h4>${esc(d.name)}</h4>${stars(d.rating)}</div>
      <div class="muted" style="font-size:12.5px;margin-top:3px">${esc(d.vehicle_model)} · ${esc(d.vehicle_number)}</div>
      <div class="row" style="gap:7px;margin-top:7px"><span class="badge accent">${esc(d.fare_note)}</span><span class="badge ${d.available?'open':'neutral'}">${d.available?'Available':'Offline'}</span></div>
      <div class="row" style="gap:8px;margin-top:9px"><a class="btn sm" href="tel:${d.phone}">${I.phone} Call</a>
        <a class="btn sm accent" href="https://wa.me/${(d.whatsapp||'').replace(/[^0-9]/g,'')}" target="_blank" rel="noopener">${I.wa} Book</a></div>
    </div></div>`).join(''); }
function renderLocalInfo(elm,data){ const groups={}; data.forEach(i=>(groups[i.category]=groups[i.category]||[]).push(i));
  elm.innerHTML = Object.entries(groups).map(([g,items])=>`
    <div class="sec-head" style="margin:6px 0 8px"><h3 style="font-size:15px">${esc(g)}</h3></div>
    ${items.map(i=>`<div class="brow" style="margin-bottom:10px"><div class="thumb" style="width:56px;height:56px;font-size:24px;background:${i.emergency?grad('#EF4444','#B91C1C'):grad('#14B8A6','#0F766E')}">${dIcon({name:i.name,category:i.category},'building')}</div>
      <div class="info"><h4 style="font-size:14.5px">${esc(i.name)}</h4><div class="muted" style="font-size:12px;margin-top:3px">${esc(i.description)}</div>
        <div class="muted" style="font-size:11.5px;margin-top:3px">${esc(i.hours||'')}</div></div>
      <a class="btn sm" style="align-self:center" href="tel:${i.phone}">${I.phone}</a></div>`).join('')}`).join(''); }

SCREENS.business = async (el, {id}) => {
  el.innerHTML = `<div class="sk" style="height:190px;border-radius:0"></div><div class="px" style="margin-top:14px">${skeletonRow(2)}</div>`;
  const b = await api(`/businesses/${id}`);
  const wa = (b.whatsapp||'').replace(/[^0-9]/g,'');
  el.innerHTML = `
    <div class="detail-cover" style="background:${grad(b.color1,b.color2)}">${photoLayer(b.cover_url || pic(coverKw(b), b.id, 900, 480))}
      <button class="back" id="bk">${I.back}</button><span class="logo">${dIcon(b)}</span></div>
    <div class="px" style="margin-top:-26px;position:relative">
      <div class="card" style="padding:15px">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><h2 style="font-size:20px">${esc(b.name)}</h2>
            <div class="muted" style="font-size:13px;margin-top:3px">${esc(b.subcategory||'')} · ${esc(b.area_name||'')}</div></div>
          ${stars(b.rating)}</div>
        <div class="row" style="gap:8px;margin-top:10px"><span class="badge ${b.is_open?'open':'closed'}">${b.is_open?'Open now':'Closed'}</span>
          <span class="muted" style="font-size:12px">${esc(b.hours_label||'')}</span><span class="dot" style="width:3px;height:3px;background:var(--faint);border-radius:50%"></span>
          <span class="muted" style="font-size:12px">${b.review_count} reviews</span></div>
        <div class="muted" style="font-size:12.5px;margin-top:8px;display:flex;gap:6px">${I.pin.replace('fill="currentColor"','fill="var(--faint)" style="width:14px;height:14px;flex:0 0 auto"')} ${esc(b.address||'')}</div>
        <div class="actionbar">
          <a href="tel:${b.phone}">${I.phone}${t('call')}</a>
          <a href="https://wa.me/${wa}" target="_blank" rel="noopener">${I.wa}${t('whatsapp')}</a>
          <a href="https://maps.google.com/?q=${encodeURIComponent(b.name+' '+(b.address||''))}" target="_blank" rel="noopener">${I.dir}${t('directions')}</a>
          <a href="#" id="shareb">${I.share}${t('share')}</a>
        </div>
      </div>
      <div class="tabs" id="tabs">
        <button class="on" data-t="about">${t('about')}</button>
        ${b.products.length?`<button data-t="products">${t('products')}</button>`:''}
        ${b.services.length?`<button data-t="services">${t('services')}</button>`:''}
        ${b.offers.length?`<button data-t="offers">${t('offers')}</button>`:''}
        <button data-t="reviews">${t('reviews')} (${b.reviews.length})</button>
      </div>
      <div id="tabbody" style="margin-top:14px"></div>
      <div style="height:90px"></div>
    </div>`;
  $('#bk').onclick=back; $('#shareb').onclick=(e)=>{e.preventDefault(); toast('Link copied to share');};
  const bodies = {
    about: ()=>`<p style="color:var(--body);font-size:14px;line-height:1.6">${esc(b.description||'')}</p>
      <div class="card" style="padding:14px;margin-top:14px">
        <div class="row" style="justify-content:space-between;font-size:13px;margin-bottom:8px"><span class="muted">Category</span><b>${esc(b.category_name)}</b></div>
        <div class="row" style="justify-content:space-between;font-size:13px;margin-bottom:8px"><span class="muted">Hours</span><b>${esc(b.hours_label)}</b></div>
        <div class="row" style="justify-content:space-between;font-size:13px"><span class="muted">Phone</span><b>${esc(b.phone)}</b></div></div>
      <button class="btn block" style="margin-top:14px" id="enqbtn">${t('enquire')}</button>`,
    products: ()=>`<div class="grid2">${b.products.map(p=>productCard(p,b)).join('')}</div>`,
    services: ()=>`<div class="stack" style="gap:11px">${b.services.map(s=>`<div class="brow"><div class="thumb" style="background:${grad('#6366F1','#4338CA')}">${dIcon(s,'wrench')}</div>
      <div class="info"><h4 style="font-size:14.5px">${esc(s.name)}</h4><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(s.description||'')}</div>
      <span class="badge primary" style="margin-top:7px">from ${money(s.starting_price)}</span></div>
      <button class="btn sm" style="align-self:center" data-req="${esc(s.name)}">Request</button></div>`).join('')}</div>`,
    offers: ()=>`<div class="stack" style="gap:11px">${b.offers.map(o=>`<div class="ocard" style="width:auto;background:${grad(o.color1,o.color2)}"><span class="badge tag">${esc(o.discount_label)}</span><div><h4>${esc(o.title)}</h4><div class="biz">${esc(o.description||'')}</div></div></div>`).join('')}</div>`,
    reviews: ()=>`<button class="btn ghost block sm" id="addrev" style="margin-bottom:12px">${I.star} Write a review</button>
      <div class="stack" style="gap:11px">${b.reviews.length?b.reviews.map(r=>`<div class="card" style="padding:13px">
        <div class="row" style="justify-content:space-between"><b style="font-size:13.5px">${esc(r.author_name)}</b>${stars(r.rating)}</div>
        <p style="font-size:13px;color:var(--body);margin:7px 0 0;line-height:1.5">${esc(r.comment)}</p></div>`).join(''):emptyState('star','No reviews yet','Be the first to review.')}</div>`,
  };
  const showTab = (name)=>{ $('#tabbody').innerHTML = bodies[name](); wireTabBody(b); };
  showTab('about');
  $('#tabs').addEventListener('click', e=>{ const btn=e.target.closest('button'); if(!btn)return;
    $('#tabs').querySelectorAll('button').forEach(x=>x.classList.remove('on')); btn.classList.add('on'); showTab(btn.dataset.t); });
};
function wireTabBody(b){
  const enq=$('#enqbtn'); if(enq) enq.onclick=()=>openEnquiry(b);
  const rev=$('#addrev'); if(rev) rev.onclick=()=>openReview(b);
  document.querySelectorAll('[data-req]').forEach(x=>x.onclick=()=>{ if(!token) return openLoginPrompt(); toast('Service request sent to '+b.name); });
  document.querySelectorAll('[data-add]').forEach(x=>x.onclick=()=>toast('Added to cart'));
}

SCREENS.searchScreen = async (el) => {
  el.innerHTML = `${topbarBack('')}
    <div class="px"><div class="searchbar" style="width:100%"><span style="color:var(--muted)">${I.search}</span>
      <input id="sq" placeholder="${t('search')}" autofocus /></div></div>
    <div class="px" style="margin-top:12px"><div class="hscroll" style="padding:0" id="pop">
      ${['Biriyani','Plumber','Grocery','AC repair','Auto','Salon','Pharmacy'].map(x=>`<button class="chip" data-q="${x}">${x}</button>`).join('')}</div></div>
    <div class="px" id="sres" style="margin-top:14px"><p class="muted" style="font-size:13px">Popular searches — or ask the assistant for anything.</p>
      <button class="btn ghost block" style="margin-top:12px" id="askfromsearch">${I.ai} ${t('askTitle')}</button></div><div style="height:90px"></div>`;
  backWire(el);
  const input=$('#sq'); let tmr;
  const run=async(q)=>{ if(!q.trim()){ return; } $('#sres').innerHTML=skeletonRow(3);
    const r=await api('/search?q='+encodeURIComponent(q));
    const total=r.businesses.length+r.products.length+r.services.length+r.workers.length+r.drivers.length;
    if(!total){ $('#sres').innerHTML=emptyState('search','No results','Try “plumber”, “biriyani”, or “auto”.'); return; }
    let html='';
    if(r.businesses.length) html+=`<div class="sec-head" style="margin:4px 0 8px"><h3 style="font-size:14px">Businesses</h3></div>`+r.businesses.map(bizRow).join('');
    if(r.services.length) html+=`<div class="sec-head" style="margin:14px 0 8px"><h3 style="font-size:14px">Services</h3></div>`+r.services.map(serviceCard).join('');
    if(r.products.length) html+=`<div class="sec-head" style="margin:14px 0 8px"><h3 style="font-size:14px">Products</h3></div><div class="grid2">`+r.products.map(p=>productCard(p)).join('')+`</div>`;
    if(r.workers.length){ html+=`<div class="sec-head" style="margin:14px 0 8px"><h3 style="font-size:14px">Workers</h3></div><div class="stack" id="wl" style="gap:11px"></div>`; }
    $('#sres').innerHTML=html; if(r.workers.length) renderWorkers($('#wl'),r.workers);
  };
  input.oninput=()=>{ clearTimeout(tmr); tmr=setTimeout(()=>run(input.value),260); };
  el.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{ input.value=b.dataset.q; run(b.dataset.q); });
  $('#askfromsearch').onclick=()=>openAsk(input.value);
};

SCREENS.offers = async (el) => {
  el.innerHTML = `${topbarBack(t('offers'))}<div class="px stack" id="l" style="gap:12px">${skeletonRow(4)}</div><div style="height:90px"></div>`;
  backWire(el);
  const offers = await api('/offers');
  $('#l').innerHTML = offers.map(o=>`<button class="ocard" data-nav="business" data-id="${o.business_id}" style="width:auto;background:${grad(o.color1,o.color2)}">
    <span class="badge tag">${esc(o.discount_label)}</span><div><h4>${esc(o.title)}</h4><div class="biz">${esc(o.business)} · ${esc(o.description||'')}</div></div><span class="disc">%</span></button>`).join('');
};

SCREENS.news = async (el) => {
  el.innerHTML = `${topbarBack(t('news'))}<div class="px stack" id="l" style="gap:12px">${skeletonRow(4)}</div><div style="height:90px"></div>`;
  backWire(el);
  const news = await api('/news');
  $('#l').innerHTML = news.map(n=>`<button class="brow" data-nav="newsDetail" data-id="${n.id}" style="text-align:left">
    <div class="thumb" style="background:${grad(n.color1,n.color2)}">${gi('news')}</div>
    <div class="info"><span class="badge neutral">${esc(n.category)}</span><h4 style="font-size:14.5px;margin-top:6px">${esc(n.title)}</h4>
    <div class="muted" style="font-size:12px;margin-top:4px">${esc(n.summary)}</div></div></button>`).join('');
};
SCREENS.newsDetail = async (el, {id}) => {
  const n = await api('/news/'+id);
  el.innerHTML = `<div class="detail-cover" style="height:150px;background:${grad(n.color1,n.color2)}"><button class="back" id="bk">${I.back}</button><span class="logo" style="font-size:44px">${gi('news')}</span></div>
    <div class="px" style="margin-top:16px"><span class="badge neutral">${esc(n.category)}</span>
      <h2 style="font-size:22px;margin-top:10px;line-height:1.25">${esc(n.title)}</h2>
      <div class="muted" style="font-size:12px;margin-top:8px">${new Date(n.published_at).toDateString()}</div>
      <p style="color:var(--body);font-size:14.5px;line-height:1.7;margin-top:14px">${esc(n.body)}</p><div style="height:90px"></div></div>`;
  $('#bk').onclick=back;
};

SCREENS.orders = async (el) => {
  if(!token) return openLoginInline(el, 'Log in to see your orders');
  el.innerHTML = `<div class="chead"><h2 style="font-size:21px">${t('orders')}</h2></div><div class="px stack" id="l" style="gap:12px;margin-top:12px">${skeletonRow(3)}</div><div style="height:90px"></div>`;
  const orders = await api('/orders');
  const badge=(s)=>({pending:'warn',accepted:'primary',preparing:'primary',ready:'primary',completed:'open',cancelled:'closed',rejected:'closed',out_for_delivery:'primary'}[s]||'neutral');
  $('#l').innerHTML = orders.length? orders.map(o=>`<div class="card" style="padding:14px">
    <div class="row" style="justify-content:space-between"><div class="row" style="gap:9px"><span class="gi" style="font-size:22px;color:var(--primary)">${GI.package}</span><div><b style="font-size:14px">${esc(o.business)}</b><div class="muted" style="font-size:12px">#${1000+o.id} · ${new Date(o.created_at).toLocaleDateString()}</div></div></div>
      <span class="badge ${badge(o.status)}">${o.status.replace('_',' ')}</span></div>
    <div class="muted" style="font-size:12.5px;margin-top:9px">${esc(o.item_summary)}</div>
    <div class="row" style="justify-content:space-between;margin-top:9px"><b class="price">${money(o.total)}</b><button class="btn ghost sm" data-nav="business" data-id="${o.business_id||''}">Reorder</button></div></div>`).join('')
    : emptyState('bag','No orders yet','Browse local shops and place your first order.');
};

SCREENS.notifications = async (el) => {
  if(!token) return openLoginInline(el, 'Log in to see notifications');
  el.innerHTML = `<div class="chead"><h2 style="font-size:21px">${t('notifications')}</h2></div><div class="px stack" id="l" style="gap:10px;margin-top:12px">${skeletonRow(3)}</div><div style="height:90px"></div>`;
  const items = await api('/notifications');
  const emojiMap={order:'package',offer:'percent',news:'news',event:'calendar',system:'bell',emergency:'cross'};
  $('#l').innerHTML = items.length? items.map(n=>`<div class="brow" style="${n.read?'':'border-left:3px solid var(--primary)'}">
    <div class="thumb" style="width:44px;height:44px;font-size:20px;background:var(--surface-2);color:var(--primary)">${gi(emojiMap[n.type]||'bell')}</div>
    <div class="info"><h4 style="font-size:14px">${esc(n.title)}</h4><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(n.body)}</div>
    <div class="faint" style="font-size:11px;margin-top:4px">${new Date(n.created_at).toLocaleString()}</div></div></div>`).join('')
    : emptyState('bell','No notifications','You are all caught up.');
};

SCREENS.profile = async (el) => {
  const loggedIn = !!token;
  el.innerHTML = `<div class="chead"><h2 style="font-size:21px">${t('profile')}</h2></div>
    <div class="px" style="margin-top:8px">
      <div class="card" style="padding:16px;display:flex;gap:13px;align-items:center">
        <div class="avatar" style="width:54px;height:54px;font-size:20px;background:${grad(loggedIn?me.avatar_color:'#0D9488','#0B5A55')}">${loggedIn?me.name[0].toUpperCase():'<span class="gi" style="color:#fff">'+GI.user+'</span>'}</div>
        <div style="flex:1"><b style="font-size:16px">${loggedIn?esc(me.name):'Guest'}</b><div class="muted" style="font-size:12.5px">${loggedIn?esc(me.email||me.phone):'Log in to order, enquire & review'}</div></div>
        ${loggedIn?'':`<button class="btn sm" id="lg">${t('login')}</button>`}
      </div>
      <div style="height:16px"></div>
      <div class="plist">
        <button data-tabnav="orders"><span class="ic">${gi('package')}</span> My Orders <span class="chev">${I.chev}</span></button>
        <button data-nav="offers"><span class="ic">${gi('percent')}</span> ${t('offers')} <span class="chev">${I.chev}</span></button>
        <button data-nav="localinfo"><span class="ic">${gi('building')}</span> ${t('localInfo')} <span class="chev">${I.chev}</span></button>
        <button data-nav="events"><span class="ic">${gi('calendar')}</span> ${t('events')} <span class="chev">${I.chev}</span></button>
      </div>
      <div style="height:14px"></div>
      <div class="plist">
        <button id="langrow"><span class="ic">${I.globe}</span> Language — ${state.lang==='ml'?'മലയാളം':'English'} <span class="chev">${I.chev}</span></button>
        <button id="themerow"><span class="ic">${I.sun}</span> Theme — ${state.theme} <span class="chev">${I.chev}</span></button>
      </div>
      ${loggedIn?`<button class="btn ghost block" style="margin-top:16px;color:var(--error);border-color:var(--error)" id="out">${I.logout} Log out</button>`:''}
      <div style="height:90px"></div>
    </div>`;
  const lg=$('#lg'); if(lg) lg.onclick=()=>go('login');
  const out=$('#out'); if(out) out.onclick=()=>{ token=null; me=null; localStorage.removeItem('ll_token'); localStorage.removeItem('ll_user'); toast('Logged out'); routeRender(); };
  $('#langrow').onclick=()=>{ state.lang=state.lang==='en'?'ml':'en'; localStorage.setItem('ll_lang',state.lang); renderShell(); };
  $('#themerow').onclick=cycleTheme;
  el.querySelectorAll('[data-tabnav]').forEach(b=>b.onclick=()=>setTab(b.dataset.tabnav));
};
SCREENS.localinfo = async (el)=>{ el.innerHTML=`${topbarBack(t('localInfo'))}<div class="px stack" id="l" style="gap:11px">${skeletonRow(4)}</div><div style="height:90px"></div>`; backWire(el); renderLocalInfo($('#l'), await api('/local-info')); };
SCREENS.events = async (el)=>{ el.innerHTML=`${topbarBack(t('events'))}<div class="px stack" id="l" style="gap:11px">${skeletonRow(4)}</div><div style="height:90px"></div>`; backWire(el); $('#l').innerHTML=(await api('/events')).map(eventCard).join(''); };

SCREENS.login = (el) => renderLogin(el, 'customer');

/* ---------------- shared bits ---------------- */
function topbarBack(title){ return `<div class="row px" style="gap:12px;padding-top:16px;padding-bottom:10px;position:sticky;top:0;background:var(--bg);z-index:6">
  <button class="tb-btn" id="__back">${I.back}</button><h3 style="font-size:17px">${esc(title)}</h3></div>`; }
function backWire(el){ const b=el.querySelector('#__back'); if(b) b.onclick=back; }

function openLoginInline(el, msg){ el.innerHTML=`<div class="center-min px" style="flex-direction:column;gap:14px;text-align:center">
  <div class="eic" style="width:64px;height:64px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center;font-size:28px;color:var(--muted)">${gi('lock')}</div>
  <h3 style="font-size:17px">${esc(msg)}</h3><button class="btn" id="li">${t('login')}</button></div>`;
  $('#li').onclick=()=>go('login'); }
function openLoginPrompt(){ toast('Please log in first'); go('login'); }

function openEnquiry(b){
  if(!token) return openLoginPrompt();
  showSheet(`${t('enquire')} — ${esc(b.name)}`, `
    <div class="field"><label>Your message</label><div class="input"><textarea id="emsg" rows="4" placeholder="e.g. Is this available now? Do you deliver to Kunnamangalam?"></textarea></div></div>
    <button class="btn block" id="esend">${t('enquire')}</button>`, ()=>{
      $('#esend').onclick=async()=>{ const msg=$('#emsg').value.trim(); if(!msg)return; try{ await api('/enquiries',{method:'POST',body:{business_id:b.id,message:msg}}); closeSheet(); toast('Enquiry sent to '+b.name);}catch(e){toast(e.message);} };
    });
}
function openReview(b){
  if(!token) return openLoginPrompt();
  let rating=5;
  showSheet(`Rate ${esc(b.name)}`, `
    <div id="rstars" style="display:flex;gap:6px;justify-content:center;margin:6px 0 14px">${[1,2,3,4,5].map(i=>`<button data-s="${i}" style="font-size:30px;color:${i<=5?'#F5A524':'var(--border-strong)'}">★</button>`).join('')}</div>
    <div class="field"><label>Your review</label><div class="input"><textarea id="rc" rows="3" placeholder="Share your experience"></textarea></div></div>
    <button class="btn block" id="rsend">Submit review</button>`, ()=>{
      const sync=()=>document.querySelectorAll('#rstars button').forEach(x=>x.style.color=Number(x.dataset.s)<=rating?'#F5A524':'var(--border-strong)');
      document.querySelectorAll('#rstars button').forEach(x=>x.onclick=()=>{rating=Number(x.dataset.s);sync();});
      $('#rsend').onclick=async()=>{ try{ await api('/reviews',{method:'POST',body:{business_id:b.id,rating,comment:$('#rc').value.trim()}}); closeSheet(); toast('Thanks for your review!'); back(); go('business',{id:b.id}); }catch(e){toast(e.message);} };
    });
}

/* ---------------- Ask Local Link — chat panel with voice ---------------- */
let aiVoiceLang = localStorage.getItem('ll_voicelang') || 'en-IN';
function openAsk(prefill){
  closeSheet();
  const phone = $('.phone') || document.body;
  const aiOn = state.aiStatus.openai;
  const chips = [t('chipPlumber'),t('chipBiriyani'),t('chipAuto'),t('chipGrocery'),t('chipAC')];
  const panel = h(`<div class="sheet" id="sheet"><div class="ai-panel">
    <div class="ai-head">
      <div class="row" style="gap:9px"><span class="ai-badge">${I.ai}</span><b style="font-size:16px">${t('askTitle')}</b>
        <span class="badge ${aiOn?'primary':'neutral'}" style="font-size:10px">${aiOn?'AI':'Offline'}</span></div>
      <button class="tb-btn" id="ai-close">✕</button>
    </div>
    <div class="ai-msgs" id="ai-msgs">
      <div class="ai-bubble bot">${t('askHi')} ${aiOn?'':`<span class="faint">${t('askOffline')}</span>`}</div>
      <div class="ai-chips" id="ai-chips">${chips.map(x=>`<button class="chip" data-aq="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    </div>
    <div class="ai-inputbar">
      <div class="ai-langtg" id="ai-lang"><button data-vl="en-IN" class="${aiVoiceLang==='en-IN'?'on':''}">EN</button><button data-vl="ml-IN" class="${aiVoiceLang==='ml-IN'?'on':''}">മ</button></div>
      <button class="ai-mic" id="ai-mic" title="Speak">${GI.mic}</button>
      <input id="aq" placeholder="${t('askPh')}" value="${esc(prefill||'')}" autocomplete="off"/>
      <button class="ai-sendbtn" id="asend" title="Send">${GI.send}</button>
    </div>
  </div></div>`);
  phone.appendChild(panel);
  const msgs=$('#ai-msgs'), input=$('#aq');
  const scrollDown=()=>{ msgs.scrollTop = msgs.scrollHeight; };
  const addUser=(txt)=>{ msgs.insertAdjacentHTML('beforeend', `<div class="ai-bubble user">${esc(txt)}</div>`); scrollDown(); };
  const addBot=(html)=>{ const d=h(`<div class="ai-turn">${html}</div>`); msgs.appendChild(d); scrollDown(); return d; };

  const run=async(q)=>{ q=(q||input.value).trim(); if(!q) return;
    input.value=''; const chipsEl=$('#ai-chips'); if(chipsEl) chipsEl.remove();
    addUser(q);
    const loading=addBot(`<div class="ai-bubble bot"><span class="ai-typing"><i></i><i></i><i></i></span></div>`);
    try{
      const r=await api('/ask',{method:'POST',body:{query:q, lang: state.lang}});
      loading.innerHTML = `<div class="ai-bubble bot">${esc(r.answer)}</div>` + (r.results||[]).map(x=>aiResultRow(x)).join('');
      loading.querySelectorAll('[data-go-biz]').forEach(b=>b.onclick=()=>{ closeSheet(); go('business',{id:Number(b.dataset.goBiz)}); });
      scrollDown();
    }catch(e){ loading.innerHTML=`<div class="ai-bubble bot">${esc(e.message)}</div>`; }
  };
  $('#ai-close').onclick=closeSheet;
  panel.addEventListener('click', e=>{ if(e.target===panel) closeSheet(); });
  $('#asend').onclick=()=>run();
  input.onkeydown=e=>{ if(e.key==='Enter') run(); };
  $('#ai-chips').querySelectorAll('[data-aq]').forEach(b=>b.onclick=()=>run(b.dataset.aq));
  $('#ai-lang').querySelectorAll('[data-vl]').forEach(b=>b.onclick=()=>{ aiVoiceLang=b.dataset.vl; localStorage.setItem('ll_voicelang',aiVoiceLang); $('#ai-lang').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.vl===aiVoiceLang)); });
  setupVoice($('#ai-mic'), input, run);
  if(prefill) run(prefill); else setTimeout(()=>input.focus(),200);
}

/* voice input (English + Malayalam) via Web Speech API */
let _recog=null;
function setupVoice(micBtn, input, run){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ micBtn.classList.add('disabled'); micBtn.title='Voice not supported on this device'; micBtn.onclick=()=>toast('Voice input isn’t supported on this browser'); return; }
  let listening=false;
  micBtn.onclick=()=>{
    if(listening){ try{_recog.stop();}catch(e){} return; }
    try{ _recog = new SR(); }catch(e){ toast('Voice unavailable'); return; }
    _recog.lang = aiVoiceLang; _recog.interimResults = true; _recog.maxAlternatives = 1; _recog.continuous=false;
    listening=true; micBtn.classList.add('listening'); input.placeholder = aiVoiceLang==='ml-IN'?'കേൾക്കുന്നു…':'Listening…';
    let finalText='';
    _recog.onresult=(ev)=>{ let interim=''; for(let i=ev.resultIndex;i<ev.results.length;i++){ const tr=ev.results[i]; if(tr.isFinal) finalText+=tr[0].transcript; else interim+=tr[0].transcript; } input.value = (finalText+interim).trim(); };
    _recog.onerror=(ev)=>{ toast(ev.error==='not-allowed'?'Mic permission denied':'Voice error: '+ev.error); };
    _recog.onend=()=>{ listening=false; micBtn.classList.remove('listening'); input.placeholder=t('askPh'); if(finalText.trim()) run(finalText.trim()); };
    try{ _recog.start(); }catch(e){ listening=false; micBtn.classList.remove('listening'); }
  };
}
function aiResultRow(x){
  const map={business:['store','#0EA5A4','Business',x.id],service:['wrench','#6366F1','Service',x.business_id],product:['cart','#F97362','Product',x.business_id],worker:['helmet','#F59E0B','Worker',null],driver:['car','#0EA5E9','Ride',null]};
  const [emoji,color,label,bizId]=map[x.type]||['pin','#0D9488','Result',null];
  const sub = x.type==='business'?`${esc(x.subcategory||'')} · ★ ${x.rating||''}`: x.type==='product'?`${money(x.price)} · ${esc(x.business||'')}`: x.type==='service'?`from ${money(x.starting_price)} · ${esc(x.business||'')}`: x.type==='worker'?esc(x.skills||''):esc(x.fare_note||x.service_type||'');
  return `<div class="airow" ${bizId?`data-go-biz="${bizId}" role="button"`:''}>
    <div class="ai-ic" style="background:${grad(color,color)}">${gi(emoji)}</div>
    <div style="flex:1;min-width:0"><div class="rt">${label}</div><b style="font-size:14px">${esc(x.name)}</b><div class="muted" style="font-size:12px">${sub}</div></div>
    ${x.phone?`<a class="btn sm" href="tel:${x.phone}" onclick="event.stopPropagation()">${I.phone}</a>`:bizId?`<span class="chev" style="color:var(--faint);width:18px">${I.chev}</span>`:''}</div>`;
}

/* ---------------- bottom sheet ---------------- */
function showSheet(title, bodyHtml, wire){
  closeSheet();
  const phone = $('.phone') || document.body;
  const s = h(`<div class="sheet" id="sheet"><div class="panel-s"><div class="grab"></div>
    <div class="sh-head"><h3 style="font-size:16px;flex:1">${title}</h3><button class="tb-btn" id="sclose">✕</button></div>
    <div class="sh-body">${bodyHtml}</div></div></div>`);
  phone.appendChild(s);
  s.addEventListener('click', e=>{ if(e.target===s) closeSheet(); });
  $('#sclose').onclick=closeSheet;
  if(wire) wire();
}
function closeSheet(){ const s=$('#sheet'); if(s) s.remove(); }

/* ---------------- auth (customer/partner/admin shared) ---------------- */
function renderLogin(el, kind){
  const demo = kind==='admin'? {id:'admin@locallink.app'} : kind==='partner'? {id:'partner@locallink.app'} : {id:'customer@locallink.app'};
  const title = kind==='admin'?'Admin sign in':kind==='partner'?'Partner sign in':'Welcome back';
  el.innerHTML = `<div class="auth-wrap">
    ${kind!=='customer'?'':`<button class="tb-btn" id="ab" style="align-self:flex-start">${I.back}</button>`}
    <div class="auth-hero">${logoMark(58)}<h2 style="font-size:22px">${title}</h2>
      <p class="muted" style="font-size:13.5px">Local Link · Everything Local. One Place.</p></div>
    <div class="field"><label>Email or phone</label><div class="input">${I.user.replace('viewBox','style="width:18px;height:18px;stroke:var(--muted)" viewBox')}<input id="lid" value="${demo.id}" /></div></div>
    <div class="field"><label>Password</label><div class="input"><span class="gi" style="color:var(--muted)">${GI.lock}</span><input id="lpw" type="password" value="password" /></div></div>
    <button class="btn block" id="lsubmit">${t('login')}</button>
    <div class="demo-pill"><span class="faint" style="font-size:11.5px;align-self:center">Demo:</span>
      <button data-d="customer@locallink.app">Customer</button>
      <button data-d="partner@locallink.app">Partner</button>
      <button data-d="admin@locallink.app">Admin</button></div>
    <p class="faint" style="font-size:11.5px;text-align:center;margin-top:14px">All demo accounts use password <b>password</b></p>
    <div style="flex:1"></div></div>`;
  const ab=$('#ab'); if(ab) ab.onclick=back;
  el.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ $('#lid').value=b.dataset.d; $('#lpw').value='password'; });
  $('#lsubmit').onclick=async()=>{
    try{ const r=await api('/auth/login',{method:'POST',body:{identifier:$('#lid').value.trim(),password:$('#lpw').value}});
      token=r.token; me=r.user; localStorage.setItem('ll_token',token); localStorage.setItem('ll_user',JSON.stringify(me));
      toast('Welcome, '+me.name.split(' ')[0]);
      routeAfterLogin();
    }catch(e){ toast(e.message); }
  };
}
function routeAfterLogin(){
  if (me.role==='super_admin'||me.role==='admin'){ openView('admin'); return; }
  if (me.role==='business_partner'){ nav.partner=[{name:'p_dash'}]; openView('partner'); return; }
  if (state.view==='customer'){ back(); }
  renderShell();
}

/* ==================== PARTNER SCREENS ==================== */
SCREENS.p_login = (el) => renderLogin(el, 'partner');
SCREENS.p_dash = async (el) => {
  if(!token || (me.role!=='business_partner')) return renderLogin(el,'partner');
  el.innerHTML = `<div class="chead"><div class="row" style="justify-content:space-between">
    <div><div class="muted" style="font-size:12.5px">Partner dashboard</div><h2 style="font-size:20px">${esc(me.name.split(' ')[0])}'s businesses</h2></div>
    <div class="row" style="gap:8px">${miniControls()}<div class="avatar" style="background:${grad(me.avatar_color,'#0B5A55')}">${me.name[0]}</div></div></div></div>
    <div class="px" id="body" style="margin-top:12px">${skeletonRow(2)}</div><div style="height:90px"></div>`;
  const d = await api('/partner/overview');
  const stat=(lab,val,emoji)=>`<div class="stat" style="padding:14px"><span class="ic" style="background:var(--primary-50);font-size:18px;color:var(--primary)">${gi(emoji)}</span><div class="lab">${lab}</div><div class="num" style="font-size:24px">${val}</div></div>`;
  $('#body').innerHTML = `
    <div class="grid2" style="gap:12px">
      ${stat('New orders', d.stats.orders, 'package')}${stat('Enquiries', d.stats.enquiries, 'chat')}
      ${stat('Revenue', money(d.stats.revenue), 'card')}${stat('Profile views', d.stats.views, 'compass')}</div>
    <div class="sec-head" style="margin:20px 0 10px"><h3 style="font-size:16px">Quick actions</h3></div>
    <div class="grid2" style="gap:10px">
      <button class="btn ghost" id="qa-prod">${I.plus} Add product</button>
      <button class="btn ghost" data-tabnav="p_orders">${I.bag} View orders</button>
      <button class="btn ghost" data-tabnav="p_enquiries">${I.bell} Enquiries</button>
      <button class="btn ghost" data-tabnav="p_products">${I.store} Manage catalogue</button></div>
    <div class="sec-head" style="margin:20px 0 10px"><h3 style="font-size:16px">Recent orders</h3></div>
    <div class="stack" style="gap:10px">${d.recentOrders.length?d.recentOrders.map(o=>`<div class="card" style="padding:13px"><div class="row" style="justify-content:space-between"><b style="font-size:13.5px">#${1000+o.id} · ${esc(o.business)}</b><span class="badge ${o.status==='completed'?'open':'warn'}">${o.status.replace('_',' ')}</span></div><div class="muted" style="font-size:12.5px;margin-top:6px">${esc(o.item_summary)}</div><b class="price" style="font-size:14px">${money(o.total)}</b></div>`).join(''):emptyState('package','No orders yet','')}</div>
    <div class="sec-head" style="margin:20px 0 10px"><h3 style="font-size:16px">Your businesses</h3></div>
    <div class="stack" style="gap:10px">${d.businesses.map(b=>`<div class="brow"><div class="thumb" style="background:${grad(b.color1,b.color2)}">${dIcon(b)}</div><div class="info"><h4 style="font-size:14.5px">${esc(b.name)}</h4><div class="muted" style="font-size:12px;margin-top:3px">${esc(b.category_name)} · ${stars(b.rating)}</div><span class="badge open" style="margin-top:6px">${b.status}</span></div></div>`).join('')}</div>`;
  el.querySelectorAll('[data-tabnav]').forEach(b=>b.onclick=()=>setTab(b.dataset.tabnav));
  $('#qa-prod').onclick=()=>openAddProduct(d.businesses[0]);
};
function openAddProduct(biz){
  if(!biz) return toast('No business found');
  showSheet('Add product', `
    <div class="field"><label>Product name</label><div class="input"><input id="pn" placeholder="e.g. Chicken Biriyani"/></div></div>
    <div class="row" style="gap:10px"><div class="field" style="flex:1"><label>Price ₹</label><div class="input"><input id="pp" type="number" placeholder="210"/></div></div>
      <div class="field" style="flex:1"><label>MRP ₹ (optional)</label><div class="input"><input id="pm" type="number" placeholder="240"/></div></div></div>
    <div class="row" style="gap:10px"><div class="field" style="flex:1"><label>Unit</label><div class="input"><input id="pu" placeholder="e.g. plate, kg, piece"/></div></div></div>
    <div class="field"><label>Product photo URL <span class="faint" style="font-weight:500">(optional)</span></label><div class="input"><input id="pimg" placeholder="https://… link to your product photo"/></div></div>
    <p class="faint" style="font-size:11.5px;margin:-4px 0 10px">Paste a link to your own product photo. Leave blank and we’ll show a matching photo automatically.</p>
    <button class="btn block" id="psave">Publish product</button>`, ()=>{
      $('#psave').onclick=async()=>{ const name=$('#pn').value.trim(), price=Number($('#pp').value); if(!name||!price)return toast('Name & price required');
        try{ await api('/partner/products',{method:'POST',body:{business_id:biz.id,name,price,mrp:Number($('#pm').value)||null,unit:$('#pu').value.trim()||null,image_url:$('#pimg').value.trim()||null,emoji:null}}); closeSheet(); toast('Product published'); setTab('p_products'); }catch(e){toast(e.message);} };
    });
}
SCREENS.p_products = async (el) => {
  if(!token||me.role!=='business_partner') return renderLogin(el,'partner');
  el.innerHTML=`<div class="chead"><div class="row" style="justify-content:space-between"><h2 style="font-size:20px">Products</h2><button class="btn sm" id="add">${I.plus} Add</button></div></div><div class="px stack" id="l" style="gap:10px;margin-top:12px">${skeletonRow(3)}</div><div style="height:90px"></div>`;
  const [prods, ov] = await Promise.all([api('/partner/products'), api('/partner/overview')]);
  $('#add').onclick=()=>openAddProduct(ov.businesses[0]);
  $('#l').innerHTML = prods.length? prods.map(p=>`<div class="brow"><div class="thumb pthumb" style="background:${grad('#12A594','#0C7A6E')};overflow:hidden;position:relative">${photoLayer(p.image_url||pic((p.name||'product').toLowerCase(),500+(p.id||0),160,160))}<span style="position:relative;z-index:2">${dIcon({name:p.name},'cart')}</span></div>
    <div class="info"><h4 style="font-size:14.5px">${esc(p.name)}</h4><div class="muted" style="font-size:12px;margin-top:2px">${esc(p.business)}</div>
    <div class="row" style="gap:8px;margin-top:6px"><b class="price" style="font-size:14px">${money(p.price)}</b><span class="badge ${p.stock_status==='in_stock'?'open':'warn'}">${(p.stock_status||'').replace('_',' ')}</span></div></div></div>`).join('')
    : emptyState('bag','No products yet','Add your first product to start selling.', `<button class="btn sm" onclick="void 0" id="e2">${I.plus} Add product</button>`);
  const e2=$('#e2'); if(e2) e2.onclick=()=>openAddProduct(ov.businesses[0]);
};
SCREENS.p_orders = async (el) => {
  if(!token||me.role!=='business_partner') return renderLogin(el,'partner');
  el.innerHTML=`<div class="chead"><h2 style="font-size:20px">Orders</h2></div><div class="px stack" id="l" style="gap:10px;margin-top:12px">${skeletonRow(3)}</div><div style="height:90px"></div>`;
  const draw = async()=>{ const orders=await api('/partner/orders');
    const nextActs={pending:[['accepted','Accept'],['rejected','Reject']],accepted:[['preparing','Start preparing']],preparing:[['ready','Mark ready']],ready:[['completed','Complete']],out_for_delivery:[['completed','Complete']]};
    $('#l').innerHTML = orders.length? orders.map(o=>`<div class="card" style="padding:13px">
      <div class="row" style="justify-content:space-between"><b style="font-size:14px">#${1000+o.id} · ${esc(o.customer||'Customer')}</b><span class="badge ${o.status==='completed'?'open':o.status==='rejected'?'closed':'warn'}">${o.status.replace('_',' ')}</span></div>
      <div class="muted" style="font-size:12.5px;margin-top:7px">${esc(o.item_summary)}</div>
      <div class="row" style="justify-content:space-between;margin-top:9px"><b class="price">${money(o.total)}</b>
        <div class="row" style="gap:7px">${(nextActs[o.status]||[]).map(([s,l])=>`<button class="btn sm ${s==='rejected'?'ghost':''}" data-oid="${o.id}" data-st="${s}">${l}</button>`).join('')}</div></div></div>`).join('')
      : emptyState('package','No orders yet','');
    $('#l').querySelectorAll('[data-oid]').forEach(b=>b.onclick=async()=>{ try{ await api(`/partner/orders/${b.dataset.oid}/status`,{method:'POST',body:{status:b.dataset.st}}); toast('Order updated'); draw(); }catch(e){toast(e.message);} });
  };
  draw();
};
SCREENS.p_enquiries = async (el) => {
  if(!token||me.role!=='business_partner') return renderLogin(el,'partner');
  el.innerHTML=`<div class="chead"><h2 style="font-size:20px">Enquiries</h2></div><div class="px stack" id="l" style="gap:10px;margin-top:12px">${skeletonRow(3)}</div><div style="height:90px"></div>`;
  const items = await api('/partner/enquiries');
  $('#l').innerHTML = items.length? items.map(e=>`<div class="card" style="padding:13px">
    <div class="row" style="justify-content:space-between"><b style="font-size:13.5px">${esc(e.customer_name)}</b><span class="badge ${e.status==='new'?'warn':'primary'}">${e.status}</span></div>
    <div class="muted" style="font-size:12px;margin-top:2px">${esc(e.business)} · ${new Date(e.created_at).toLocaleString()}</div>
    <p style="font-size:13.5px;color:var(--body);margin:8px 0 10px">${esc(e.message)}</p>
    <div class="row" style="gap:8px"><button class="btn sm">Reply</button><button class="btn sm ghost">${I.phone} Call</button></div></div>`).join('')
    : emptyState('chat','No enquiries yet','');
};
SCREENS.p_profile = async (el) => {
  if(!token||me.role!=='business_partner') return renderLogin(el,'partner');
  el.innerHTML = `<div class="chead"><h2 style="font-size:20px">${t('profile')}</h2></div>
    <div class="px" style="margin-top:8px"><div class="card" style="padding:16px;display:flex;gap:13px;align-items:center">
      <div class="avatar" style="width:54px;height:54px;font-size:20px;background:${grad(me.avatar_color,'#0B5A55')}">${me.name[0]}</div>
      <div style="flex:1"><b style="font-size:16px">${esc(me.name)}</b><div class="muted" style="font-size:12.5px">Business Partner · ${esc(me.email)}</div></div></div>
      <div style="height:14px"></div>
      <div class="plist"><button data-tabnav="p_products"><span class="ic">${I.store}</span> Manage catalogue <span class="chev">${I.chev}</span></button>
        <button><span class="ic">${gi('card')}</span> Subscription — Premium <span class="chev">${I.chev}</span></button>
        <button><span class="ic">${I.chart}</span> Analytics <span class="chev">${I.chev}</span></button></div>
      <button class="btn ghost block" style="margin-top:16px;color:var(--error);border-color:var(--error)" id="out">${I.logout} Log out</button></div>`;
  $('#out').onclick=()=>{ token=null;me=null;localStorage.removeItem('ll_token');localStorage.removeItem('ll_user'); nav.partner=[{name:'p_login'}]; toast('Logged out'); routeRender(); };
  el.querySelectorAll('[data-tabnav]').forEach(b=>b.onclick=()=>setTab(b.dataset.tabnav));
};

/* ==================== ADMIN ==================== */
let adminRoute = 'dashboard';
let adminBiz = null;
function renderAdmin(body){
  if(!token || (me && me.role!=='admin' && me.role!=='super_admin')){
    body.innerHTML = `<div class="phone"><div class="screen" id="screen"></div></div>`; renderLogin($('#screen'),'admin'); return;
  }
  const groups = [
    ['Overview', [['dashboard','Dashboard',I.chart]]],
    ['Marketplace', [['businesses','Businesses',I.store],['products','Products',I.bag],['services','Services',I.tag],['offers','Offers',I.tag],['workers','Workers',GI.helmet],['drivers','Drivers',GI.car],['reviews','Reviews',I.star]]],
    ['Community', [['news','News',GI.news],['events','Events',GI.calendar],['local_info','Local Info',GI.building]]],
    ['Operations', [['orders','Orders',I.bag],['users','Users',I.users],['categories','Categories',I.grid]]],
    ['System', [['locations','Locations',I.pin],['subscription_plans','Subscriptions',GI.card],['advertisements','Advertisements',GI.megaphone],['notifications','Notifications',I.bell],['settings','Settings',I.cog]]],
  ];
  body.innerHTML = `<div class="desk">
    <aside class="side">
      <div class="lg">${logoMark(24)} Local Link</div>
      ${groups.map(([g,items])=>`<div class="grp">${g}</div>${items.map(([r,l,icn])=>`<a data-r="${r}" class="${adminRoute===r?'on':''}">${icn.startsWith('<')?icn:`<span style="width:18px;text-align:center">${icn}</span>`}<span>${l}</span></a>`).join('')}`).join('')}
      <div style="flex:1"></div>
      <a id="a-out" style="color:var(--error)">${I.logout}<span>Log out</span></a>
    </aside>
    <main class="admain"><div class="adtop"><h2 id="adtitle">Dashboard</h2><div class="spacer" style="flex:1"></div>
      <div class="searchbar" style="padding:9px 14px;max-width:220px">${I.search}<input placeholder="Search…" style="font-size:13px"/></div>
      ${miniControls()}
      <div class="avatar" style="width:36px;height:36px;font-size:14px;background:${grad(me.avatar_color,'#0B5A55')}">${me.name[0]}</div></div>
      <div class="adbody" id="adbody"></div></main></div>`;
  body.querySelectorAll('.side a[data-r]').forEach(a=>a.onclick=()=>{ adminRoute=a.dataset.r; adminBiz=null; renderAdmin(body); });
  $('#a-out').onclick=()=>{ token=null;me=null;localStorage.removeItem('ll_token');localStorage.removeItem('ll_user'); openView('customer'); };
  renderAdminRoute();
}

async function renderAdminRoute(){
  const el = $('#adbody'); const title=$('#adtitle');
  const NICE = { local_info:'Local Info', subscription_plans:'Subscriptions' };
  const nice = NICE[adminRoute] || (adminRoute.charAt(0).toUpperCase()+adminRoute.slice(1));
  if(title) title.textContent = nice;
  if(!el) return;
  el.innerHTML = `<div class="stat-grid">${Array(4).fill('<div class="sk" style="height:96px"></div>').join('')}</div>`;
  try{
    if(adminRoute==='businesses' && adminBiz){ if(title) title.textContent='Business'; return renderAdminBusinessDetail(el, adminBiz); }
    if(adminRoute==='dashboard') return renderAdminDashboard(el);
    if(adminRoute==='locations') return renderAdminLocations(el);
    if(['businesses','users','categories','products','services','reviews','orders','news','events','offers','workers','drivers','local_info','subscription_plans'].includes(adminRoute)) return renderAdminTable(el, adminRoute, nice);
    // placeholders
    el.innerHTML = adminPlaceholder(nice);
  }catch(e){ el.innerHTML = errorState(e.message); }
}

async function renderAdminLocations(el){
  const { areas, googleEnabled } = await api('/admin/areas');
  const banner = googleEnabled
    ? `<div class="ai-bubble" style="margin-bottom:14px">Google Places is connected. Click <b>Import from Google</b> on any area to fetch real shops (restaurants, groceries, pharmacies, salons and more) live into that area.</div>`
    : `<div class="ai-bubble" style="margin-bottom:14px;background:var(--warning-bg);border-color:var(--warning)">To pull <b>real shops live from Google</b>, add a <code>GOOGLE_PLACES_API_KEY</code> environment variable (Render → your service → Environment) and redeploy. The import buttons below then populate each area automatically — no manual entry.</div>`;
  el.innerHTML = banner + `<div class="panel"><div class="ph"><h3>${areas.length} areas</h3><span class="badge ${googleEnabled?'open':'warn'}">${googleEnabled?'Google connected':'Demo data'}</span></div>
    <div style="overflow-x:auto"><table><thead><tr><th>Area</th><th>Panchayath / Municipality</th><th>Shops</th><th>Actions</th></tr></thead><tbody>
    ${areas.map(a=>`<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.panchayath||'')}</td><td class="tabnums">${a.business_count}</td>
      <td><button class="btn sm" data-imp="${a.id}" data-name="${esc(a.name)}">Import from Google</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
  el.querySelectorAll('[data-imp]').forEach(b=>b.onclick=async()=>{
    b.disabled=true; b.textContent='Importing…';
    try{ const r=await api('/admin/import-google',{method:'POST',body:{area_id:Number(b.dataset.imp)}});
      if(r.needsKey){ toast('Add GOOGLE_PLACES_API_KEY to enable live import'); }
      else { toast(`Imported ${r.imported} shops into ${r.area} (${r.skipped} already existed)`); renderAdminRoute(); }
    }catch(e){ toast(e.message); }
    finally{ b.disabled=false; if(b.textContent==='Importing…') b.textContent='Import from Google'; }
  });
}

function adminPlaceholder(name){
  const info = {
    Locations:['pin','Manage districts, panchayaths and areas so Local Link can expand to new towns.'],
    Subscriptions:['card','Create and price partner plans (Free / Business / Premium) and manage active subscriptions.'],
    Advertisements:['megaphone','Sell banners, featured placement and sponsored products with impression & click analytics.'],
    Notifications:['bell','Broadcast push notifications to all users, or target by district, panchayath or category.'],
    Settings:['cog','Platform settings — languages, payments, verification rules, feature flags and privacy.'],
  }[name] || ['store','Module'];
  return `<div class="panel" style="padding:0"><div class="ph"><h3>${name}</h3><span class="badge primary">Ready to build</span></div>
    <div class="empty" style="padding:56px"><div class="eic">${gi(info[0])}</div><h4 style="color:var(--ink);font-size:16px">${name}</h4><p style="max-width:420px">${info[1]}</p></div></div>`;
}

async function renderAdminDashboard(el){
  const d = await api('/admin/overview');
  const S=d.stats;
  const card=(lab,val,emoji,tone)=>`<div class="stat"><span class="ic" style="background:${tone||'var(--primary-50)'};color:var(--primary)">${gi(emoji)}</span><div class="lab">${lab}</div><div class="num tabnums">${val}</div></div>`;
  const donutColors=['#0EA5A4','#F97362','#6366F1','#F59E0B','#EC4899','#0EA5E9','#22C55E','#8B5CF6'];
  el.innerHTML = `
    <div class="stat-grid">
      ${card('Total users', S.users, 'users')}
      ${card('Active businesses', S.businesses, 'store')}
      ${card('Total orders', S.orders, 'package')}
      ${card('Revenue (completed)', money(S.revenue), 'card','var(--success-bg)')}
    </div>
    <div class="stat-grid" style="margin-top:14px">
      ${card('Pending approvals', S.pending, 'store','var(--warning-bg)')}
      ${card('Reviews', S.reviews, 'star')}
      ${card('Published news', S.news, 'news')}
      ${card('Upcoming events', S.events, 'calendar')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px" id="charts">
      <div class="panel"><div class="ph"><h3>Businesses by category</h3></div><div style="padding:18px;display:flex;gap:20px;align-items:center" id="donut"></div></div>
      <div class="panel"><div class="ph"><h3>Orders by status</h3></div><div style="padding:18px" id="bars"></div></div>
    </div>
    <div class="panel" style="margin-top:16px"><div class="ph"><h3>Top rated businesses</h3></div>
      <table><thead><tr><th>Business</th><th>Rating</th><th>Reviews</th></tr></thead><tbody>
      ${d.topRated.map(b=>`<tr><td><b>${esc(b.name)}</b></td><td>${stars(b.rating)}</td><td class="tabnums">${b.review_count}</td></tr>`).join('')}
      </tbody></table></div>`;
  // donut
  const total=d.byCategory.reduce((s,x)=>s+x.value,0)||1; let acc=0; const R=54,C=2*Math.PI*R;
  const segs=d.byCategory.map((x,i)=>{ const frac=x.value/total; const dash=frac*C; const seg=`<circle cx="70" cy="70" r="${R}" fill="none" stroke="${donutColors[i%donutColors.length]}" stroke-width="20" stroke-dasharray="${dash} ${C-dash}" stroke-dashoffset="${-acc*C}" transform="rotate(-90 70 70)"/>`; acc+=frac; return seg; }).join('');
  $('#donut').innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140" style="flex:0 0 auto">${segs}<text x="70" y="66" text-anchor="middle" style="font:700 22px var(--font-display);fill:var(--ink)">${total}</text><text x="70" y="84" text-anchor="middle" style="font:600 10px var(--font-body);fill:var(--muted)">BUSINESSES</text></svg>
    <div class="legend">${d.byCategory.map((x,i)=>`<div class="li"><span class="sw" style="background:${donutColors[i%donutColors.length]}"></span>${esc(x.label)} <b style="margin-left:auto;color:var(--ink)">${x.value}</b></div>`).join('')}</div>`;
  // bars
  const maxV=Math.max(...d.ordersByStatus.map(x=>x.value),1);
  $('#bars').innerHTML = d.ordersByStatus.map(x=>`<div class="bar-row"><span class="bl">${esc(x.label.replace('_',' '))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.value/maxV*100)}%"></div></div><span class="bv tabnums">${x.value}</span></div>`).join('') || '<p class="muted">No orders yet.</p>';
}

const SINGULAR = { businesses:'Business', users:'User', categories:'Category', products:'Product', services:'Service', news:'News', events:'Event', offers:'Offer', workers:'Worker', drivers:'Driver', local_info:'Local Info', subscription_plans:'Plan' };
const CREATABLE = ['businesses','products','services','offers','news','events','workers','drivers','local_info','categories','subscription_plans','users'];
let adminOptions = null;
async function getAdminOptions(){ if(!adminOptions) adminOptions = await api('/admin/options'); return adminOptions; }

// ---- form field schemas ----
const O = {
  status_biz:[['approved','Approved'],['pending','Pending'],['suspended','Suspended'],['rejected','Rejected']],
  status_news:[['published','Published'],['draft','Draft'],['scheduled','Scheduled'],['archived','Archived']],
  status_offer:[['active','Active'],['expired','Expired']],
  price_level:[[1,'₹ Budget'],[2,'₹₹ Mid'],[3,'₹₹₹ Premium']],
  stock:[['in_stock','In stock'],['low_stock','Low stock'],['out_of_stock','Out of stock']],
  news_cat:[['Local','Local'],['Government','Government'],['Education','Education'],['Business','Business'],['Community','Community'],['Health','Health']],
  info_cat:[['Emergency','Emergency'],['Government','Government'],['Healthcare','Healthcare'],['Bank','Bank'],['Education','Education'],['Community','Community'],['Tourism','Tourism']],
  cat_kind:[['business','Business'],['service','Service'],['worker','Worker'],['driver','Driver'],['info','Info'],['content','Content']],
  driver_type:[['auto','Auto'],['taxi','Taxi'],['delivery','Delivery']],
  roles:[['customer','Customer'],['business_partner','Business Partner'],['service_provider','Service Provider'],['worker','Worker'],['driver','Driver'],['admin','Admin']],
};
const ADMIN_FORMS = {
  businesses:[ ['name','Name','text',{req:1}],['category_id','Category','ref-categories',{req:1}],['area_id','Area','ref-areas',{req:1}],['subcategory','Type / subcategory','text'],['phone','Phone','text'],['whatsapp','WhatsApp','text'],['address','Address','text'],['description','Description','textarea'],['price_level','Price level','sel:price_level'],['rating','Rating','number'],['status','Status','sel:status_biz'],['featured','Featured on home','check'],['cover_url','Cover photo URL','text',{ph:'https://… shop cover photo'}],['open_min','Opens','time'],['close_min','Closes','time'],['plan_id','Plan','ref-plans'] ],
  products:[ ['business_id','Business','ref-businesses',{req:1}],['name','Product name','text',{req:1}],['price','Price ₹','number',{req:1}],['mrp','MRP ₹','number'],['unit','Unit','text'],['stock_status','Stock','sel:stock'],['image_url','Photo URL','text',{ph:'https://… product photo'}],['description','Description','textarea'] ],
  services:[ ['business_id','Business','ref-businesses',{req:1}],['category_id','Category','ref-categories'],['name','Service name','text',{req:1}],['starting_price','Starting price ₹','number'],['rating','Rating','number'],['available','Available','check'],['description','Description','textarea'] ],
  offers:[ ['business_id','Business','ref-businesses',{req:1}],['title','Offer title','text',{req:1}],['discount_label','Badge (e.g. 20% OFF)','text'],['description','Description','text'],['start_date','Start date','date'],['end_date','End date','date'],['status','Status','sel:status_offer'] ],
  news:[ ['title','Headline','text',{req:1}],['category','Category','sel:news_cat'],['summary','Summary','text'],['body','Full article','textarea'],['area_id','Area','ref-areas'],['status','Status','sel:status_news'] ],
  events:[ ['title','Event name','text',{req:1}],['description','Description','textarea'],['venue','Venue','text'],['area_id','Area','ref-areas'],['start_date','Date','date'],['time_label','Time (e.g. 5 PM onwards)','text'],['organizer','Organizer','text'],['contact','Contact','text'] ],
  workers:[ ['name','Name','text',{req:1}],['category_id','Category','ref-categories'],['area_id','Area','ref-areas'],['skills','Skills','text'],['experience_years','Experience (years)','number'],['rate','Rate (e.g. ₹1200/day)','text'],['phone','Phone','text'],['whatsapp','WhatsApp','text'],['rating','Rating','number'],['available','Available','check'] ],
  drivers:[ ['name','Name','text',{req:1}],['service_type','Type','sel:driver_type'],['vehicle_model','Vehicle model','text'],['vehicle_number','Vehicle number','text'],['area_id','Area','ref-areas'],['fare_note','Fare note','text'],['phone','Phone','text'],['whatsapp','WhatsApp','text'],['rating','Rating','number'],['available','Available','check'] ],
  local_info:[ ['name','Name','text',{req:1}],['category','Category','sel:info_cat'],['description','Description','text'],['phone','Phone','text'],['address','Address','text'],['area_id','Area','ref-areas'],['emergency','Emergency service','check'],['hours','Hours','text'] ],
  categories:[ ['name','Name','text',{req:1}],['name_ml','Malayalam name','text'],['slug','Slug','text'],['kind','Kind','sel:cat_kind'],['active','Active','check'] ],
  subscription_plans:[ ['name','Plan name','text',{req:1}],['price','Price ₹','number'],['period','Period (month/year/forever)','text'],['tagline','Tagline','text'],['popular','Mark as popular','check'] ],
  users:[ ['name','Name','text',{req:1}],['email','Email','text'],['phone','Phone','text'],['role','Role','sel:roles'],['area_id','Area','ref-areas'] ],
};
function minToTime(m){ if(m==null||m==='')return''; m=Number(m); return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function timeToMin(v){ if(!v)return null; const [h,m]=v.split(':').map(Number); return h*60+(m||0); }

function fieldHtml(spec, val, opts){
  const [k,label,type,extra={}] = spec;
  const id='f_'+k;
  const wrap=(inner)=>`<div class="field"><label>${label}${extra.req?' *':''}</label>${inner}</div>`;
  if(type==='textarea') return wrap(`<div class="input"><textarea id="${id}" rows="3">${esc(val??'')}</textarea></div>`);
  if(type==='number') return wrap(`<div class="input"><input id="${id}" type="number" value="${val??''}"/></div>`);
  if(type==='date') return wrap(`<div class="input"><input id="${id}" type="date" value="${(val||'').slice(0,10)}"/></div>`);
  if(type==='time') return wrap(`<div class="input"><input id="${id}" type="time" value="${minToTime(val)}"/></div>`);
  if(type==='check') return `<label class="checkrow"><input id="${id}" type="checkbox" ${val?'checked':''}/> <span>${label}</span></label>`;
  if(type.startsWith('sel:')){ const arr=O[type.slice(4)]||[]; return wrap(`<div class="input"><select id="${id}">${arr.map(([v,l])=>`<option value="${v}" ${String(val)===String(v)?'selected':''}>${l}</option>`).join('')}</select></div>`); }
  if(type.startsWith('ref-')){ const key=type.slice(4); const list=(opts[key]||[]); return wrap(`<div class="input"><select id="${id}"><option value="">—</option>${list.map(o=>`<option value="${o.id}" ${String(val)===String(o.id)?'selected':''}>${esc(o.name)}${o.panchayath?` (${esc(o.panchayath)})`:''}</option>`).join('')}</select></div>`); }
  return wrap(`<div class="input"><input id="${id}" value="${esc(val??'')}" ${extra.max?`maxlength="${extra.max}"`:''}/></div>`);
}

async function openAdminForm(entity, id, prefill){
  const schema = ADMIN_FORMS[entity]; if(!schema) return toast('No form for '+entity);
  const opts = await getAdminOptions();
  let row = {};
  if(id){ try{ row = await api(`/admin/${entity}/${id}`); }catch(e){ return toast(e.message); } }
  if(prefill) row = { ...prefill, ...row };
  const title = (id?'Edit ':'Add ')+(SINGULAR[entity]||entity);
  const body = `<form id="adminform" onsubmit="return false">${schema.map(s=>fieldHtml(s, row[s[0]], opts)).join('')}
    <button class="btn block" id="afsave" type="submit">${id?'Save changes':'Create'}</button></form>`;
  showSheetAdmin(title, body, ()=>{
    $('#afsave').onclick=async()=>{
      const payload={};
      for(const s of schema){ const [k,,type,extra={}]=s; const elx=document.getElementById('f_'+k); if(!elx)continue;
        let v;
        if(type==='check') v=elx.checked?1:0;
        else if(type==='time') v=timeToMin(elx.value);
        else if(type==='number') v=elx.value===''?null:Number(elx.value);
        else v=elx.value;
        if(extra.req && (v===''||v==null)) { toast(s[1]+' is required'); return; }
        payload[k]=v;
      }
      try{
        if(id) await api(`/admin/${entity}/${id}`,{method:'PATCH',body:payload});
        else await api(`/admin/${entity}`,{method:'POST',body:payload});
        closeSheet(); toast((SINGULAR[entity]||'Record')+(id?' updated':' created'));
        adminOptions=null; if(entity==='categories') await loadRef();
        renderAdminRoute();
      }catch(e){ toast(e.message); }
    };
  });
}

async function renderAdminTable(el, name, nice){
  const rows = await api('/admin/table/'+name);
  const data = Array.isArray(rows)?rows:(rows||[]);
  const cols = data.length? Object.keys(data[0]).filter(k=>k!=='id') : [];
  const canApprove = name==='businesses'; const canModerate=name==='reviews'; const canCat=name==='categories';
  const canEdit = !!ADMIN_FORMS[name]; const canDelete = name!=='orders';
  const canAdd = CREATABLE.includes(name);
  const badgeFor=(k,v)=>{ if(['status','verification_status','stock_status','service_type','period'].includes(k)){ const tone=/approv|publish|in_stock|verified|active|completed/i.test(v)?'open':/pending|new/i.test(v)?'warn':/reject|suspend|hidden|cancel|out_of/i.test(v)?'closed':'neutral'; return `<span class="badge ${tone}">${esc(String(v).replace(/_/g,' '))}</span>`; } if(k==='rating') return stars(v); if(k==='role') return `<span class="badge primary">${esc(String(v).replace(/_/g,' '))}</span>`; if(k==='price'||k==='total') return money(v); if(['active','emergency','popular','available','featured'].includes(k)) return `<span class="badge ${v?'open':'neutral'}">${v?'yes':'no'}</span>`; return esc(v==null?'':String(v).length>54?String(v).slice(0,54)+'…':v); };
  const canView = name==='businesses';
  const hasActions = canView||canApprove||canModerate||canCat||canEdit||canDelete;
  el.innerHTML = `<div class="panel"><div class="ph"><h3>${data.length} ${(nice||name).toLowerCase()}</h3>
      <div class="row" style="gap:8px">
        ${name==='businesses'?`<button class="btn sm ghost" data-goloc="1">${I.pin} Import from Google</button>`:''}
        ${canAdd?`<button class="btn sm" id="addnew">${I.plus} Add ${SINGULAR[name]||name}</button>`:''}</div></div>
    <div style="overflow-x:auto"><table><thead><tr>${cols.map(c=>`<th>${esc(c.replace(/_/g,' '))}</th>`).join('')}${hasActions?'<th style="text-align:right">Actions</th>':''}</tr></thead>
      <tbody>${data.length?data.map(r=>`<tr>${cols.map(c=>`<td>${badgeFor(c,r[c])}</td>`).join('')}
        ${hasActions?`<td class="tbn" style="justify-content:flex-end">
          ${canView?`<button class="btn sm" data-viewbiz="${r.id}">Open</button>`:''}
          ${canApprove?`<button class="btn sm ghost" data-act="approve" data-id="${r.id}">Approve</button><button class="btn sm ghost" data-act="suspend" data-id="${r.id}">Suspend</button>`:''}
          ${canModerate?`<button class="btn sm ghost" data-act="hide" data-id="${r.id}">Hide</button><button class="btn sm" data-act="publish" data-id="${r.id}">Publish</button>`:''}
          ${canCat?`<button class="btn sm ghost" data-act="toggle" data-id="${r.id}">Toggle</button>`:''}
          ${canEdit?`<button class="btn sm ghost" data-edit="${r.id}">Edit</button>`:''}
          ${canDelete?`<button class="btn sm ghost danger" data-del="${r.id}">Delete</button>`:''}
        </td>`:''}
      </tr>`).join(''):`<tr><td colspan="${cols.length+1}"><div class="empty" style="padding:36px"><div class="eic">${gi('inbox')}</div><h4 style="color:var(--ink);font-size:15px">No ${(nice||name).toLowerCase()} yet</h4>${canAdd?'<p>Click Add to create the first one.</p>':''}</div></td></tr>`}</tbody></table></div></div>`;
  el.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{ const id=b.dataset.id, act=b.dataset.act;
    try{
      if(act==='approve') await api(`/admin/businesses/${id}/status`,{method:'POST',body:{status:'approved'}});
      else if(act==='suspend') await api(`/admin/businesses/${id}/status`,{method:'POST',body:{status:'suspended'}});
      else if(act==='hide') await api(`/admin/reviews/${id}/status`,{method:'POST',body:{status:'hidden'}});
      else if(act==='publish') await api(`/admin/reviews/${id}/status`,{method:'POST',body:{status:'published'}});
      else if(act==='toggle') await api(`/admin/categories/${id}/toggle`,{method:'POST'});
      toast('Updated'); renderAdminRoute();
    }catch(e){ toast(e.message); }
  });
  el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openAdminForm(name, b.dataset.edit));
  el.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('Delete this '+(SINGULAR[name]||'record')+'? This cannot be undone.'))return;
    try{ await api(`/admin/${name}/${b.dataset.del}`,{method:'DELETE'}); toast('Deleted'); adminOptions=null; renderAdminRoute(); }catch(e){ toast(e.message); } });
  const an=$('#addnew'); if(an) an.onclick=()=>openAdminForm(name);
  el.querySelectorAll('[data-viewbiz]').forEach(b=>b.onclick=()=>{ adminBiz=Number(b.dataset.viewbiz); renderAdminRoute(); });
  const gl=el.querySelector('[data-goloc]'); if(gl) gl.onclick=()=>{ adminRoute='locations'; const sh=document.getElementById('adminshell'); if(sh) renderAdmin(sh); };
}

async function renderAdminBusinessDetail(el, id){
  const d = await api(`/admin/businesses/${id}/full`);
  const b = d.business;
  const money2 = (n)=>'₹'+Number(n||0).toLocaleString('en-IN');
  const statusTone = /approv/.test(b.status)?'open':/pending/.test(b.status)?'warn':'closed';
  const kv = (k,v)=>`<div class="kv"><span class="kk">${k}</span><span class="vv">${v||'—'}</span></div>`;
  const miniTable = (title, rows, addEntity, cols) => `
    <div class="panel" style="margin-top:16px"><div class="ph"><h3>${title} <span class="muted" style="font-weight:500">(${rows.length})</span></h3>
      ${addEntity?`<button class="btn sm" data-add-sub="${addEntity}">${I.plus} Add</button>`:''}</div>
      ${rows.length?`<div style="overflow-x:auto"><table><thead><tr>${cols.map(c=>`<th>${esc(c[0])}</th>`).join('')}<th></th></tr></thead><tbody>
        ${rows.map(r=>`<tr>${cols.map(c=>`<td>${c[1](r)}</td>`).join('')}
          <td class="tbn" style="justify-content:flex-end">${addEntity?`<button class="btn sm ghost" data-sub-edit="${addEntity}" data-sub-id="${r.id}">Edit</button><button class="btn sm ghost danger" data-sub-del="${addEntity}" data-sub-id="${r.id}">Delete</button>`:''}</td>
        </tr>`).join('')}</tbody></table></div>`
      :`<div class="empty" style="padding:30px"><div class="eic">${gi('inbox')}</div><p>No ${title.toLowerCase()} yet.</p></div>`}</div>`;

  el.innerHTML = `
    <button class="btn ghost sm" id="biz-back" style="margin-bottom:14px">${I.back} Back to businesses</button>
    <div class="panel" style="overflow:hidden">
      <div class="detail-cover" style="height:120px;border-radius:0;background:${grad(b.color1,b.color2)}"><span class="logo" style="font-size:44px">${dIcon(b)}</span></div>
      <div style="padding:18px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div><h2 style="font-size:22px">${esc(b.name)}</h2>
            <div class="muted" style="margin-top:4px">${esc(b.subcategory||'')} · ${esc(b.category_name||'')} · ${esc(b.area_name||'')}</div>
            <div class="row" style="gap:8px;margin-top:10px">${stars(b.rating)}<span class="badge ${statusTone}">${esc(b.status)}</span><span class="badge primary">${esc(b.plan_name||'Free')}</span><span class="badge neutral">${esc(b.verification_status)}</span></div>
          </div>
          <div class="row" style="gap:8px">
            <button class="btn sm ghost" id="biz-edit">${I.plus} Edit</button>
            <button class="btn sm ghost danger" id="biz-del">Delete</button>
          </div>
        </div>
        <div class="kvgrid" style="margin-top:16px">
          ${kv('Phone', esc(b.phone))}${kv('WhatsApp', esc(b.whatsapp))}${kv('Address', esc(b.address))}
          ${kv('Owner', esc(b.owner_name||'—'))}${kv('Reviews', b.review_count)}${kv('Featured', b.featured?'Yes':'No')}
        </div>
        ${b.description?`<p style="color:var(--body);margin-top:14px;line-height:1.6">${esc(b.description)}</p>`:''}
      </div>
    </div>
    ${miniTable('Products', d.products, 'products', [['Name',r=>esc(r.name)],['Price',r=>money2(r.price)],['Stock',r=>`<span class="badge ${r.stock_status==='in_stock'?'open':'warn'}">${esc((r.stock_status||'').replace(/_/g,' '))}</span>`]])}
    ${miniTable('Services', d.services, 'services', [['Name',r=>esc(r.name)],['From',r=>money2(r.starting_price)],['Available',r=>`<span class="badge ${r.available?'open':'neutral'}">${r.available?'Yes':'No'}</span>`]])}
    ${miniTable('Offers', d.offers, 'offers', [['Title',r=>esc(r.title)],['Badge',r=>esc(r.discount_label||'')],['Status',r=>`<span class="badge ${r.status==='active'?'open':'neutral'}">${esc(r.status)}</span>`]])}
    ${miniTable('Reviews', d.reviews, null, [['By',r=>esc(r.author_name)],['Rating',r=>stars(r.rating)],['Comment',r=>esc((r.comment||'').slice(0,60))]])}
    ${miniTable('Orders', d.orders, null, [['#',r=>1000+r.id],['Total',r=>money2(r.total)],['Status',r=>`<span class="badge ${r.status==='completed'?'open':'warn'}">${esc(r.status.replace(/_/g,' '))}</span>`]])}
  `;
  $('#biz-back').onclick=()=>{ adminBiz=null; renderAdminRoute(); };
  $('#biz-edit').onclick=()=>openAdminForm('businesses', id);
  $('#biz-del').onclick=async()=>{ if(!confirm('Delete this business and all its products/offers?'))return; try{ await api(`/admin/businesses/${id}`,{method:'DELETE'}); toast('Business deleted'); adminBiz=null; renderAdminRoute(); }catch(e){toast(e.message);} };
  el.querySelectorAll('[data-add-sub]').forEach(x=>x.onclick=()=>openAdminForm(x.dataset.addSub, null, {business_id:id}));
  el.querySelectorAll('[data-sub-edit]').forEach(x=>x.onclick=()=>openAdminForm(x.dataset.subEdit, Number(x.dataset.subId)));
  el.querySelectorAll('[data-sub-del]').forEach(x=>x.onclick=async()=>{ if(!confirm('Delete this item?'))return; try{ await api(`/admin/${x.dataset.subDel}/${x.dataset.subId}`,{method:'DELETE'}); toast('Deleted'); renderAdminRoute(); }catch(e){toast(e.message);} });
}

function showSheetAdmin(title, body, wire){ // center modal for desktop
  closeSheet();
  const s=h(`<div class="sheet" id="sheet" style="align-items:center;justify-content:center"><div class="panel-s" style="max-width:440px;border-radius:20px;max-height:88%"><div class="sh-head"><h3 style="flex:1;font-size:16px">${title}</h3><button class="tb-btn" id="sclose">✕</button></div><div class="sh-body">${body}</div></div></div>`);
  document.body.appendChild(s); s.addEventListener('click',e=>{if(e.target===s)closeSheet();}); $('#sclose').onclick=closeSheet; if(wire)wire();
}

/* ==================== BOOT ==================== */
async function loadRef(){
  const b = await api('/bootstrap'); ref = b;
}
function viewFromPath(){
  const p = location.pathname;
  if (p.startsWith('/admin')) return 'admin';
  if (p.startsWith('/partner')) return 'partner';
  if (p.startsWith('/apps')) return 'launcher';
  return 'customer';
}
// global mini-control + launcher popstate handlers (bound once)
document.addEventListener('click', (e) => {
  const lb = e.target.closest('[data-mini-lang] button');
  if (lb){ state.lang=lb.dataset.l; localStorage.setItem('ll_lang',state.lang); renderShell(); return; }
  if (e.target.closest('[data-mini-theme]')){ cycleTheme(); return; }
});
window.addEventListener('popstate', () => { const v=viewFromPath(); if(v!==state.view){ state.view=v; renderShell(); } });

async function boot(){
  try{
    const [_, ai] = await Promise.all([loadRef(), api('/ai-status').catch(()=>({openai:false}))]);
    state.aiStatus = ai;
    state.view = viewFromPath();
    renderShell();
  }catch(e){
    $('#stage').innerHTML = `<div style="padding:40px;text-align:center"><h3>Couldn't reach the server</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
boot();
})();
