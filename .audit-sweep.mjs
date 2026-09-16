import { chromium } from 'playwright';
const B='http://localhost:3111';
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await br.newContext();
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: '+e.message.slice(0,140)));
p.on('console', m => { if (m.type()==='error') { const t=m.text(); if(!/favicon|404 \(Not Found\)/.test(t)) errs.push('CONSOLE: '+t.slice(0,140)); } });

await p.goto(B+'/login');
await p.fill('input[type=email]','admin@440.media');
await p.fill('input[type=password]','localdev1234');
await p.click('button[type=submit]');
await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:25000});

const ROUTES = ['/','/talent','/projects','/organizations','/formats','/people','/opportunities','/youtube',
  '/explore','/collections','/favorites','/recent','/activity','/archive','/search?q=a','/attention',
  '/ingest','/admin','/settings','/dev-slate','/bulk-upload'];

const a11y = async () => p.evaluate(() => {
  const out = { namelessButtons: [], namelessLinks: [], imgNoAlt: 0, inputNoLabel: [], dupIds: [] };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || '').trim();
  document.querySelectorAll('button').forEach(b => { if (!name(b)) out.namelessButtons.push(b.className.slice(0,50)); });
  document.querySelectorAll('a').forEach(a => { if (!name(a) && !a.querySelector('img,svg')) out.namelessLinks.push((a.getAttribute('href')||'').slice(0,40)); });
  document.querySelectorAll('img').forEach(i => { if (!i.hasAttribute('alt')) out.imgNoAlt++; });
  document.querySelectorAll('input,select,textarea').forEach(i => {
    if (i.type === 'hidden') return;
    const has = i.getAttribute('aria-label') || i.getAttribute('placeholder') || i.closest('label') ||
      (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`));
    if (!has) out.inputNoLabel.push((i.tagName+':'+(i.getAttribute('name')||i.className)).slice(0,50));
  });
  const seen = new Set();
  document.querySelectorAll('[id]').forEach(e => { if (seen.has(e.id)) out.dupIds.push(e.id); else seen.add(e.id); });
  return out;
});

for (const route of ROUTES) {
  errs.length = 0;
  let status = 'ERR';
  try { const r = await p.goto(B+route, {waitUntil:'networkidle', timeout:45000}); status = r ? r.status() : '?'; }
  catch (e) { console.log(`${route}  NAVFAIL ${e.message.slice(0,60)}`); continue; }
  const a = await a11y();
  const bits = [];
  if (a.namelessButtons.length) bits.push(`buttons-no-name=${a.namelessButtons.length} [${a.namelessButtons.slice(0,2).join(', ')}]`);
  if (a.namelessLinks.length) bits.push(`links-no-name=${a.namelessLinks.length} [${a.namelessLinks.slice(0,2).join(', ')}]`);
  if (a.imgNoAlt) bits.push(`img-no-alt=${a.imgNoAlt}`);
  if (a.inputNoLabel.length) bits.push(`inputs-no-label=${a.inputNoLabel.length} [${a.inputNoLabel.slice(0,2).join(', ')}]`);
  if (a.dupIds.length) bits.push(`dup-ids=${[...new Set(a.dupIds)].slice(0,3).join(',')}`);
  if (errs.length) bits.push(`ERRORS: ${errs.slice(0,2).join(' | ')}`);
  console.log(`${status} ${route}  ${bits.length ? bits.join('  ') : 'clean'}`);
}
await br.close();
