import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, seed } from './src/db.js';
import { login, signToken, publicUser, attachUser, requireAuth, requireRole } from './src/auth.js';
import { ask } from './src/assistant.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(attachUser);

// Ensure DB has data (self-seeds on first boot / after an ephemeral reset)
seed();

/* ---------------- helpers ---------------- */
const IST_OFFSET = 5.5 * 60; // minutes
function nowISTminutes() {
  const utc = new Date();
  const m = utc.getUTCHours() * 60 + utc.getUTCMinutes() + IST_OFFSET;
  return ((m % 1440) + 1440) % 1440;
}
function withOpen(b) {
  if (b == null) return b;
  const n = nowISTminutes();
  const open = b.open_min <= b.close_min ? (n >= b.open_min && n < b.close_min) : (n >= b.open_min || n < b.close_min);
  const fmt = (mins) => { let h = Math.floor(mins / 60), mm = mins % 60; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(mm).padStart(2,'0')} ${ap}`; };
  return { ...b, is_open: open, hours_label: (b.open_min===0 && b.close_min>=1439) ? 'Open 24 hours' : (open ? `Open until ${fmt(b.close_min)}` : `Opens ${fmt(b.open_min)}`) };
}
const catName = db.prepare('SELECT id,name,slug,name_ml,icon,color1,color2,kind FROM categories');

/* ---------------- auth ---------------- */
app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body || {};
  const user = login(identifier, password);
  if (!user) return res.status(401).json({ error: 'Invalid email/phone or password.' });
  res.json({ token: signToken(user), user: publicUser(user) });
});
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------------- reference / bootstrap ---------------- */
app.get('/api/bootstrap', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY sort').all();
  const districts = db.prepare('SELECT * FROM districts').all();
  const panchayaths = db.prepare('SELECT * FROM panchayaths').all();
  const areas = db.prepare('SELECT * FROM areas').all();
  const plans = db.prepare('SELECT * FROM subscription_plans ORDER BY sort').all().map(p => ({ ...p, features: JSON.parse(p.features) }));
  res.json({ categories, districts, panchayaths, areas, plans });
});

app.get('/api/categories', (_req, res) => res.json(db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY sort').all()));

/* ---------------- businesses ---------------- */
app.get('/api/businesses', (req, res) => {
  const { category, area, q, sort, featured } = req.query;
  let sql = `SELECT b.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon, a.name AS area_name
             FROM businesses b JOIN categories c ON c.id=b.category_id LEFT JOIN areas a ON a.id=b.area_id
             WHERE b.status='approved'`;
  const args = [];
  if (category) { sql += ' AND c.slug=?'; args.push(category); }
  if (area) { sql += ' AND b.area_id=?'; args.push(area); }
  if (featured) { sql += ' AND b.featured=1'; }
  if (q) { sql += ' AND (b.name LIKE ? OR b.subcategory LIKE ? OR b.description LIKE ?)'; args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (sort === 'rating') sql += ' ORDER BY b.rating DESC';
  else if (sort === 'reviews') sql += ' ORDER BY b.review_count DESC';
  else sql += ' ORDER BY b.featured DESC, b.rating DESC';
  res.json(db.prepare(sql).all(...args).map(withOpen));
});

app.get('/api/businesses/:id', (req, res) => {
  const b = db.prepare(`SELECT b.*, c.name AS category_name, c.slug AS category_slug, a.name AS area_name
    FROM businesses b JOIN categories c ON c.id=b.category_id LEFT JOIN areas a ON a.id=b.area_id WHERE b.id=?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Business not found' });
  const products = db.prepare('SELECT * FROM products WHERE business_id=? ORDER BY sort').all(b.id);
  const services = db.prepare('SELECT * FROM services WHERE business_id=?').all(b.id);
  const offers = db.prepare("SELECT * FROM offers WHERE business_id=? AND status='active'").all(b.id);
  const reviews = db.prepare("SELECT * FROM reviews WHERE business_id=? AND status='published' ORDER BY created_at DESC").all(b.id);
  res.json({ ...withOpen(b), products, services, offers, reviews });
});

/* ---------------- other catalogues ---------------- */
app.get('/api/services', (_req, res) => res.json(db.prepare(`SELECT s.*, b.name AS business, b.area_id, a.name AS area_name
  FROM services s JOIN businesses b ON b.id=s.business_id LEFT JOIN areas a ON a.id=b.area_id`).all()));
app.get('/api/workers', (req, res) => {
  let sql = 'SELECT w.*, a.name AS area_name FROM workers w LEFT JOIN areas a ON a.id=w.area_id';
  res.json(db.prepare(sql).all());
});
app.get('/api/drivers', (req, res) => {
  const { type } = req.query;
  let sql = 'SELECT d.*, a.name AS area_name FROM drivers d LEFT JOIN areas a ON a.id=d.area_id';
  const args = [];
  if (type) { sql += ' WHERE d.service_type=?'; args.push(type); }
  res.json(db.prepare(sql).all(...args));
});
app.get('/api/offers', (_req, res) => res.json(db.prepare(`SELECT o.*, b.name AS business, b.area_id FROM offers o JOIN businesses b ON b.id=o.business_id WHERE o.status='active'`).all()));
app.get('/api/news', (_req, res) => res.json(db.prepare("SELECT * FROM news WHERE status='published' ORDER BY published_at DESC").all()));
app.get('/api/news/:id', (req, res) => { const n = db.prepare('SELECT * FROM news WHERE id=?').get(req.params.id); n ? res.json(n) : res.status(404).json({ error:'Not found' }); });
app.get('/api/events', (_req, res) => res.json(db.prepare('SELECT * FROM events ORDER BY start_date').all()));
app.get('/api/local-info', (_req, res) => res.json(db.prepare('SELECT * FROM local_info ORDER BY emergency DESC, category').all()));
app.get('/api/subscription-plans', (_req, res) => res.json(db.prepare('SELECT * FROM subscription_plans ORDER BY sort').all().map(p=>({...p,features:JSON.parse(p.features)}))));

/* ---------------- unified search ---------------- */
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ businesses: [], products: [], services: [], workers: [], drivers: [] });
  const like = `%${q}%`;
  res.json({
    businesses: db.prepare(`SELECT b.*, c.icon AS category_icon, a.name AS area_name FROM businesses b JOIN categories c ON c.id=b.category_id LEFT JOIN areas a ON a.id=b.area_id WHERE b.status='approved' AND (b.name LIKE ? OR b.subcategory LIKE ?) LIMIT 12`).all(like,like).map(withOpen),
    products: db.prepare('SELECT p.*, b.name AS business, b.id AS business_id FROM products p JOIN businesses b ON b.id=p.business_id WHERE p.name LIKE ? LIMIT 12').all(like),
    services: db.prepare('SELECT s.*, b.name AS business, b.id AS business_id FROM services s JOIN businesses b ON b.id=s.business_id WHERE s.name LIKE ? LIMIT 12').all(like),
    workers: db.prepare('SELECT * FROM workers WHERE name LIKE ? OR skills LIKE ? LIMIT 12').all(like,like),
    drivers: db.prepare('SELECT * FROM drivers WHERE name LIKE ? OR service_type LIKE ? LIMIT 12').all(like,like),
  });
});

/* ---------------- Ask Local Link (AI) ---------------- */
app.post('/api/ask', async (req, res) => {
  try { res.json(await ask((req.body && req.body.query) || '', req.body && req.body.lang)); }
  catch (e) { res.status(500).json({ error: 'Assistant unavailable', detail: e.message }); }
});
app.get('/api/ai-status', (_req, res) => res.json({ openai: !!process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' }));

/* ---------------- customer actions ---------------- */
app.get('/api/notifications', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC').all(req.user.id)));
app.get('/api/orders', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT o.*, b.name AS business, b.emoji FROM orders o JOIN businesses b ON b.id=o.business_id WHERE o.customer_id=? ORDER BY o.created_at DESC').all(req.user.id)));
app.post('/api/enquiries', requireAuth, (req, res) => {
  const { business_id, message } = req.body || {};
  if (!business_id || !message) return res.status(400).json({ error: 'business_id and message required' });
  const info = db.prepare('INSERT INTO enquiries(customer_id,business_id,customer_name,message) VALUES (?,?,?,?)').run(req.user.id, business_id, req.user.name, message);
  res.json({ id: info.lastInsertRowid, ok: true });
});
app.post('/api/reviews', requireAuth, (req, res) => {
  const { business_id, rating, comment } = req.body || {};
  if (!business_id || !rating) return res.status(400).json({ error: 'business_id and rating required' });
  db.prepare('INSERT INTO reviews(business_id,user_id,author_name,rating,comment) VALUES (?,?,?,?,?)').run(business_id, req.user.id, req.user.name, rating, comment || '');
  const agg = db.prepare("SELECT AVG(rating) a, COUNT(*) c FROM reviews WHERE business_id=? AND status='published'").get(business_id);
  db.prepare('UPDATE businesses SET rating=ROUND(?,1), review_count=? WHERE id=?').run(agg.a, agg.c, business_id);
  res.json({ ok: true });
});
app.post('/api/orders', requireAuth, (req, res) => {
  const { business_id, total, item_summary } = req.body || {};
  const info = db.prepare("INSERT INTO orders(customer_id,business_id,status,total,item_summary) VALUES (?,?,'pending',?,?)").run(req.user.id, business_id, total || 0, item_summary || '');
  res.json({ id: info.lastInsertRowid, ok: true });
});
app.get('/api/saved', requireAuth, (req, res) => res.json(db.prepare('SELECT * FROM saved_items WHERE user_id=?').all(req.user.id)));
app.post('/api/saved', requireAuth, (req, res) => {
  const { entity_type, entity_id } = req.body || {};
  try { db.prepare('INSERT INTO saved_items(user_id,entity_type,entity_id) VALUES (?,?,?)').run(req.user.id, entity_type, entity_id); } catch {}
  res.json({ ok: true });
});

/* ---------------- partner ---------------- */
const partnerOnly = requireRole('business_partner');
function ownerBusinessIds(uid) { return db.prepare('SELECT id FROM businesses WHERE owner_id=?').all(uid).map(r => r.id); }
app.get('/api/partner/overview', partnerOnly, (req, res) => {
  const ids = ownerBusinessIds(req.user.id);
  if (!ids.length) return res.json({ businesses: [], stats: { orders:0, enquiries:0, revenue:0, views:0, products:0 }, recentOrders: [], recentEnquiries: [] });
  const ph = ids.map(()=>'?').join(',');
  const orders = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) rev FROM orders WHERE business_id IN (${ph})`).get(...ids);
  const enq = db.prepare(`SELECT COUNT(*) c FROM enquiries WHERE business_id IN (${ph}) AND status='new'`).get(...ids);
  const prod = db.prepare(`SELECT COUNT(*) c FROM products WHERE business_id IN (${ph})`).get(...ids);
  const businesses = db.prepare(`SELECT b.*, c.name category_name FROM businesses b JOIN categories c ON c.id=b.category_id WHERE b.owner_id=?`).all(req.user.id).map(withOpen);
  const recentOrders = db.prepare(`SELECT o.*, b.name business FROM orders o JOIN businesses b ON b.id=o.business_id WHERE o.business_id IN (${ph}) ORDER BY o.created_at DESC LIMIT 6`).all(...ids);
  const recentEnquiries = db.prepare(`SELECT * FROM enquiries WHERE business_id IN (${ph}) ORDER BY created_at DESC LIMIT 6`).all(...ids);
  res.json({ businesses, stats: { orders: orders.c, revenue: orders.rev, enquiries: enq.c, products: prod.c, views: 1240 + orders.c*37 }, recentOrders, recentEnquiries });
});
app.get('/api/partner/products', partnerOnly, (req, res) => {
  const ids = ownerBusinessIds(req.user.id); if (!ids.length) return res.json([]);
  const ph = ids.map(()=>'?').join(',');
  res.json(db.prepare(`SELECT p.*, b.name business FROM products p JOIN businesses b ON b.id=p.business_id WHERE p.business_id IN (${ph}) ORDER BY p.sort`).all(...ids));
});
app.post('/api/partner/products', partnerOnly, (req, res) => {
  const { business_id, name, price, mrp, emoji, unit, description, image_url } = req.body || {};
  if (!ownerBusinessIds(req.user.id).includes(Number(business_id))) return res.status(403).json({ error: 'Not your business' });
  const info = db.prepare('INSERT INTO products(business_id,name,description,price,mrp,emoji,image_url,unit) VALUES (?,?,?,?,?,?,?,?)').run(business_id, name, description||'', price, mrp||null, emoji||'🛍️', image_url||null, unit||'unit');
  res.json({ id: info.lastInsertRowid, ok: true });
});
app.get('/api/partner/orders', partnerOnly, (req, res) => {
  const ids = ownerBusinessIds(req.user.id); if (!ids.length) return res.json([]);
  const ph = ids.map(()=>'?').join(',');
  res.json(db.prepare(`SELECT o.*, b.name business, u.name customer FROM orders o JOIN businesses b ON b.id=o.business_id LEFT JOIN users u ON u.id=o.customer_id WHERE o.business_id IN (${ph}) ORDER BY o.created_at DESC`).all(...ids));
});
const ORDER_FLOW = { pending:['accepted','rejected'], accepted:['preparing'], preparing:['ready'], ready:['out_for_delivery','completed'], out_for_delivery:['completed'] };
app.post('/api/partner/orders/:id/status', partnerOnly, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o || !ownerBusinessIds(req.user.id).includes(o.business_id)) return res.status(403).json({ error: 'Not allowed' });
  const next = req.body?.status;
  if (!(ORDER_FLOW[o.status] || []).includes(next)) return res.status(400).json({ error: `Cannot move ${o.status} → ${next}` });
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(next, o.id);
  res.json({ ok: true, status: next });
});
app.get('/api/partner/enquiries', partnerOnly, (req, res) => {
  const ids = ownerBusinessIds(req.user.id); if (!ids.length) return res.json([]);
  const ph = ids.map(()=>'?').join(',');
  res.json(db.prepare(`SELECT e.*, b.name business FROM enquiries e JOIN businesses b ON b.id=e.business_id WHERE e.business_id IN (${ph}) ORDER BY e.created_at DESC`).all(...ids));
});

/* ---------------- admin ---------------- */
const adminOnly = requireRole('admin');
app.get('/api/admin/overview', adminOnly, (_req, res) => {
  const one = (q) => db.prepare(q).get().c;
  const stats = {
    users: one('SELECT COUNT(*) c FROM users'),
    businesses: one("SELECT COUNT(*) c FROM businesses WHERE status='approved'"),
    pending: one("SELECT COUNT(*) c FROM businesses WHERE status='pending'"),
    orders: one('SELECT COUNT(*) c FROM orders'),
    revenue: db.prepare("SELECT COALESCE(SUM(total),0) c FROM orders WHERE status='completed'").get().c,
    reviews: one('SELECT COUNT(*) c FROM reviews'),
    news: one("SELECT COUNT(*) c FROM news WHERE status='published'"),
    events: one('SELECT COUNT(*) c FROM events'),
  };
  const byCategory = db.prepare(`SELECT c.name label, COUNT(b.id) value FROM categories c LEFT JOIN businesses b ON b.category_id=c.id WHERE c.kind='business' GROUP BY c.id HAVING value>0 ORDER BY value DESC`).all();
  const ordersByStatus = db.prepare('SELECT status label, COUNT(*) value FROM orders GROUP BY status').all();
  const topRated = db.prepare("SELECT name, rating, review_count FROM businesses WHERE status='approved' ORDER BY rating DESC LIMIT 5").all();
  res.json({ stats, byCategory, ordersByStatus, topRated });
});
const ADMIN_TABLES = {
  businesses: `SELECT b.id, b.name, c.name category, a.name area, b.rating, b.verification_status, b.status FROM businesses b JOIN categories c ON c.id=b.category_id LEFT JOIN areas a ON a.id=b.area_id`,
  users: `SELECT id, name, email, phone, role, created_at FROM users`,
  categories: `SELECT id, name, slug, kind, sort, active FROM categories`,
  products: `SELECT p.id, p.name, b.name business, p.price, p.stock_status FROM products p JOIN businesses b ON b.id=p.business_id`,
  reviews: `SELECT r.id, r.author_name, b.name business, r.rating, r.comment, r.status, r.created_at FROM reviews r JOIN businesses b ON b.id=r.business_id`,
  orders: `SELECT o.id, b.name business, o.total, o.status, o.created_at FROM orders o JOIN businesses b ON b.id=o.business_id`,
  news: `SELECT id, title, category, status, published_at FROM news`,
  events: `SELECT id, title, venue, start_date FROM events`,
  offers: `SELECT o.id, o.title, b.name business, o.discount_label, o.status FROM offers o JOIN businesses b ON b.id=o.business_id`,
  workers: `SELECT w.id, w.name, c.name category, a.name area, w.rate, w.available FROM workers w LEFT JOIN categories c ON c.id=w.category_id LEFT JOIN areas a ON a.id=w.area_id`,
  drivers: `SELECT d.id, d.name, d.service_type, d.vehicle_model, a.name area, d.available FROM drivers d LEFT JOIN areas a ON a.id=d.area_id`,
  local_info: `SELECT l.id, l.name, l.category, l.phone, a.name area, l.emergency FROM local_info l LEFT JOIN areas a ON a.id=l.area_id`,
  subscription_plans: `SELECT id, name, price, period, tagline, popular FROM subscription_plans`,
};
app.get('/api/admin/table/:name', adminOnly, (req, res) => {
  const base = ADMIN_TABLES[req.params.name];
  if (!base) return res.status(404).json({ error: 'Unknown table' });
  res.json(db.prepare(base + ' ORDER BY 1 DESC').all());
});
app.get('/api/admin/businesses/:id/full', adminOnly, (req, res) => {
  const id = req.params.id;
  const b = db.prepare(`SELECT b.*, c.name category_name, a.name area_name, u.name owner_name, sp.name plan_name
    FROM businesses b LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN areas a ON a.id=b.area_id
    LEFT JOIN users u ON u.id=b.owner_id LEFT JOIN subscription_plans sp ON sp.id=b.plan_id WHERE b.id=?`).get(id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json({
    business: b,
    products: db.prepare('SELECT * FROM products WHERE business_id=? ORDER BY sort').all(id),
    services: db.prepare('SELECT * FROM services WHERE business_id=?').all(id),
    offers: db.prepare('SELECT * FROM offers WHERE business_id=? ORDER BY id DESC').all(id),
    reviews: db.prepare('SELECT * FROM reviews WHERE business_id=? ORDER BY created_at DESC').all(id),
    orders: db.prepare('SELECT * FROM orders WHERE business_id=? ORDER BY created_at DESC').all(id),
  });
});
app.post('/api/admin/businesses/:id/status', adminOnly, (req, res) => {
  const { status } = req.body || {};
  if (!['approved','pending','rejected','suspended'].includes(status)) return res.status(400).json({ error: 'Bad status' });
  db.prepare('UPDATE businesses SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});
app.post('/api/admin/reviews/:id/status', adminOnly, (req, res) => {
  const { status } = req.body || {};
  db.prepare('UPDATE reviews SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});
app.post('/api/admin/categories/:id/toggle', adminOnly, (req, res) => {
  db.prepare('UPDATE categories SET active = 1-active WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- admin: full CRUD ---------------- */
const WRITABLE = {
  businesses:['owner_id','name','slug','category_id','subcategory','area_id','description','phone','whatsapp','address','rating','review_count','price_level','emoji','color1','color2','cover_url','open_min','close_min','verification_status','status','plan_id','featured'],
  news:['title','summary','body','category','emoji','color1','color2','area_id','status','published_at'],
  events:['title','description','venue','area_id','emoji','color1','color2','start_date','time_label','organizer','contact'],
  offers:['business_id','title','description','discount_label','color1','color2','start_date','end_date','status'],
  products:['business_id','name','description','price','mrp','emoji','image_url','unit','stock_status'],
  services:['business_id','category_id','name','description','starting_price','pricing_type','emoji','rating','available'],
  categories:['slug','name','name_ml','icon','color1','color2','kind','sort','active'],
  local_info:['category','name','description','phone','address','area_id','emergency','hours','emoji'],
  workers:['name','category_id','area_id','skills','experience_years','rate','phone','whatsapp','rating','review_count','available','emoji','color1','color2'],
  drivers:['name','service_type','vehicle_model','vehicle_number','area_id','fare_note','phone','whatsapp','rating','available','emoji'],
  subscription_plans:['name','price','period','tagline','features','sort','popular'],
  users:['name','email','phone','role','avatar_color','area_id'],
};
const ENTITIES = Object.keys(WRITABLE);
function slugify(s){ return String(s||'item').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,50) + '-' + Math.random().toString(36).slice(2,6); }
function pick(obj, cols){ const o={}; for(const c of cols) if(obj[c]!==undefined) o[c]=obj[c]; return o; }
function applyDefaults(entity, data, isCreate){
  const cat = data.category_id ? db.prepare('SELECT color1,color2,icon FROM categories WHERE id=?').get(data.category_id) : null;
  if(entity==='businesses'){
    if(isCreate){ if(!data.slug) data.slug=slugify(data.name); }
    if(data.color1===undefined && cat) data.color1=cat.color1;
    if(data.color2===undefined && cat) data.color2=cat.color2;
    if(data.emoji===undefined && cat) data.emoji=cat.icon;
    if(isCreate){ data.verification_status??='verified'; data.status??='approved'; data.plan_id??=1; data.rating??=0; data.review_count??=0; data.price_level??=2; data.open_min??=540; data.close_min??=1290; data.featured??=0; }
  }
  if(entity==='news' && isCreate){ data.status??='published'; data.published_at??=new Date().toISOString().slice(0,19).replace('T',' '); data.color1??='#8B5CF6'; data.color2??='#6D28D9'; data.emoji??='📰'; }
  if(entity==='events' && isCreate){ data.color1??='#F43F5E'; data.color2??='#BE123C'; data.emoji??='🎉'; }
  if(entity==='offers' && isCreate){ data.status??='active'; data.color1??='#0EA5A4'; data.color2??='#0B5A55'; data.start_date??=new Date().toISOString().slice(0,10); }
  if(entity==='categories' && isCreate){ if(!data.slug) data.slug=slugify(data.name); data.sort??=(db.prepare('SELECT MAX(sort) m FROM categories').get().m||0)+1; data.active??=1; data.kind??='business'; data.icon??='🏷️'; }
  if(entity==='local_info' && isCreate){ data.emergency??=0; }
  if((entity==='workers'||entity==='drivers') && isCreate){ data.available??=1; data.rating??=4.5; }
  if(entity==='subscription_plans' && Array.isArray(data.features)) data.features=JSON.stringify(data.features);
  if(entity==='users' && isCreate){ data.role??='customer'; data.avatar_color??='#0D9488'; }
  return data;
}
function requireEntity(req,res,next){ if(!ENTITIES.includes(req.params.entity)) return next('route'); next(); }

app.get('/api/admin/:entity/:id', adminOnly, requireEntity, (req,res)=>{
  const row = db.prepare(`SELECT * FROM ${req.params.entity} WHERE id=?`).get(req.params.id);
  row ? res.json(row) : res.status(404).json({error:'Not found'});
});
app.post('/api/admin/:entity', adminOnly, requireEntity, (req,res)=>{
  const entity=req.params.entity;
  const data = applyDefaults(entity, pick(req.body||{}, WRITABLE[entity]), true);
  const cols = Object.keys(data); if(!cols.length) return res.status(400).json({error:'No fields'});
  const info = db.prepare(`INSERT INTO ${entity} (${cols.join(',')}) VALUES (${cols.map(c=>'@'+c).join(',')})`).run(data);
  res.json({ ok:true, id: info.lastInsertRowid });
});
app.patch('/api/admin/:entity/:id', adminOnly, requireEntity, (req,res)=>{
  const entity=req.params.entity;
  const data = applyDefaults(entity, pick(req.body||{}, WRITABLE[entity]), false);
  const cols = Object.keys(data); if(!cols.length) return res.status(400).json({error:'No fields'});
  db.prepare(`UPDATE ${entity} SET ${cols.map(c=>c+'=@'+c).join(',')} WHERE id=@__id`).run({...data, __id:Number(req.params.id)});
  res.json({ ok:true });
});
app.delete('/api/admin/:entity/:id', adminOnly, requireEntity, (req,res)=>{
  const entity=req.params.entity, id=Number(req.params.id);
  if(entity==='businesses'){ for(const t of ['products','services','offers','reviews']) db.prepare(`DELETE FROM ${t} WHERE business_id=?`).run(id); }
  db.prepare(`DELETE FROM ${entity} WHERE id=?`).run(id);
  res.json({ ok:true });
});
// options for form selects (businesses list for offers/products)
app.get('/api/admin/options', adminOnly, (_req,res)=>{
  res.json({
    businesses: db.prepare('SELECT id,name FROM businesses ORDER BY name').all(),
    categories: db.prepare('SELECT id,name,kind FROM categories ORDER BY sort').all(),
    areas: db.prepare('SELECT a.id, a.name, p.name panchayath FROM areas a LEFT JOIN panchayaths p ON p.id=a.panchayath_id ORDER BY a.name').all(),
    plans: db.prepare('SELECT id,name FROM subscription_plans ORDER BY sort').all(),
  });
});

/* ---------------- admin: locations + live Google import ---------------- */
app.get('/api/admin/areas', adminOnly, (_req, res) => {
  const rows = db.prepare(`SELECT a.id, a.name, a.lat, a.lng, p.name AS panchayath,
      (SELECT COUNT(*) FROM businesses b WHERE b.area_id=a.id) AS business_count
      FROM areas a LEFT JOIN panchayaths p ON p.id=a.panchayath_id ORDER BY p.name, a.name`).all();
  res.json({ areas: rows, googleEnabled: !!process.env.GOOGLE_PLACES_API_KEY });
});

const IMPORT_QUERIES = [
  { q: 'restaurants',        cat: 1, sub: 'Restaurant',       emoji: '🍽️', c1: '#0EA5A4', c2: '#0B5A55' },
  { q: 'bakery',            cat: 1, sub: 'Bakery',           emoji: '🧁', c1: '#EC4899', c2: '#BE185D' },
  { q: 'supermarket grocery',cat: 1, sub: 'Grocery',         emoji: '🛒', c1: '#0369A1', c2: '#0EA5A4' },
  { q: 'pharmacy',          cat: 6, sub: 'Pharmacy',         emoji: '💊', c1: '#EC4899', c2: '#BE185D' },
  { q: 'clothing store',    cat: 2, sub: 'Clothing',         emoji: '👗', c1: '#F97362', c2: '#E14B36' },
  { q: 'electronics store', cat: 2, sub: 'Electronics',      emoji: '📱', c1: '#6366F1', c2: '#4338CA' },
  { q: 'beauty salon',      cat: 3, sub: 'Salon',            emoji: '💇', c1: '#EC4899', c2: '#9D174D' },
  { q: 'hardware store',    cat: 2, sub: 'Hardware',         emoji: '🔩', c1: '#64748B', c2: '#334155' },
];
app.post('/api/admin/import-google', adminOnly, async (req, res) => {
  const areaId = Number(req.body?.area_id);
  const area = db.prepare('SELECT * FROM areas WHERE id=?').get(areaId);
  if (!area) return res.status(400).json({ error: 'Unknown area' });
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return res.json({ ok: false, needsKey: true, message: 'Add a GOOGLE_PLACES_API_KEY environment variable to import live shops from Google.' });

  const insert = db.prepare(`INSERT INTO businesses
    (owner_id,name,slug,category_id,subcategory,area_id,description,phone,whatsapp,address,rating,review_count,price_level,emoji,color1,color2,open_min,close_min,verification_status,status,plan_id,featured)
    VALUES (NULL,@name,@slug,@cat,@sub,@area,@desc,@phone,@wa,@addr,@rating,@rc,2,@emoji,@c1,@c2,540,1290,'verified','approved',1,0)`);
  const exists = db.prepare('SELECT 1 FROM businesses WHERE lower(name)=lower(?) AND area_id=?');
  let imported = 0, skipped = 0, errors = 0;

  for (const spec of IMPORT_QUERIES) {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.primaryTypeDisplayName',
        },
        body: JSON.stringify({ textQuery: `${spec.q} in ${area.name}, Kozhikode, Kerala`, maxResultCount: 6, regionCode: 'IN' }),
      });
      if (!r.ok) { errors++; continue; }
      const data = await r.json();
      for (const pl of (data.places || [])) {
        const name = pl.displayName?.text;
        if (!name) continue;
        if (exists.get(name, areaId)) { skipped++; continue; }
        const phone = (pl.internationalPhoneNumber || '').replace(/\s/g, '') || '';
        insert.run({
          name, slug: slugify(name), cat: spec.cat, sub: pl.primaryTypeDisplayName?.text || spec.sub, area: areaId,
          desc: `${pl.primaryTypeDisplayName?.text || spec.sub} in ${area.name}. Imported from Google.`,
          phone, wa: phone, addr: pl.formattedAddress || area.name,
          rating: pl.rating || 4.2, rc: pl.userRatingCount || 0, emoji: spec.emoji, c1: spec.c1, c2: spec.c2,
        });
        imported++;
      }
    } catch (e) { errors++; }
  }
  res.json({ ok: true, imported, skipped, errors, area: area.name });
});

/* ---------------- static SPA ---------------- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌿 Local Link running on http://localhost:${PORT}`));
