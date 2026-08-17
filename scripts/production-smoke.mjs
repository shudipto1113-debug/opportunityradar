const base = process.env.BASE_URL || 'https://opportunityradar.shudipto1113.workers.dev';
const checks = [];
const ok = (name, passed, detail='') => { checks.push({name, passed, detail}); if(!passed) console.error(`FAIL ${name}: ${detail}`); else console.log(`PASS ${name}: ${detail}`); };

async function fetchText(path){
  const r = await fetch(base + path, {cache:'no-store'});
  const t = await r.text();
  return {r,t};
}

try {
  const {r,t} = await fetchText('/');
  ok('homepage', r.ok && t.includes('Find my matches'), `${r.status} ${t.length} bytes`);
} catch(e){ ok('homepage', false, String(e)); }

try {
  const {r,t} = await fetchText('/api/health');
  const j = JSON.parse(t);
  ok('health', r.ok && j.status === 'online', t.slice(0,300));
  ok('version', Boolean(j.version), j.version || 'missing');
} catch(e){ ok('health', false, String(e)); }

try {
  const {r,t} = await fetchText('/api/opportunities');
  const j = JSON.parse(t);
  ok('opportunity-api', r.ok && Array.isArray(j.opportunities), `count=${j.count}`);
  const first = j.opportunities?.[0];
  ok('published-record-checkpoint', Boolean(first && first.status === 'open' && first.official_url && first.verified_at), first?.title || 'none');
} catch(e){ ok('opportunity-api', false, String(e)); }

for (const path of ['/robots.txt','/sitemap.xml','/terms.html','/privacy.html','/contact.html']) {
  try { const {r} = await fetchText(path); ok(path, r.ok, `${r.status}`); }
  catch(e){ ok(path, false, String(e)); }
}

const failed = checks.filter(x=>!x.passed).length;
console.log(`\n${checks.length-failed}/${checks.length} checks passed`);
if(failed) process.exit(1);
