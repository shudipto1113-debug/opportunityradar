// OpportunityRadar Worker
// - Serves static assets through Cloudflare Workers Static Assets.
// - Exposes JSON APIs for opportunities, health, stats and refresh audit.
// - Runs a fail-closed refresh agent every 6 hours.
// - Uses KV for persistent verified records and a compact published index.
// - AI is optional enrichment only; source facts remain authoritative.

const APPROVED_HOSTS = new Set([
  "grants.gov", "www.grants.gov",
  "devpost.com", "www.devpost.com",
  "kaggle.com", "www.kaggle.com"
]);
const KEYWORDS = [
  "artificial intelligence", "machine learning", "research",
  "technology", "scholarship", "fellowship", "startup"
];
const FRESH_DAYS = 7;
const PUBLISHED_INDEX_KEY = "published:index:v1";
const BUILD_VERSION = "2026-08-18.0119";

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-opportunityradar-version": BUILD_VERSION,
    ...extraHeaders
  }
});

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}
function sourceAllowed(url) {
  const host = hostOf(url);
  return [...APPROVED_HOSTS].some(h => host === h || host.endsWith(`.${h}`));
}
function parseDate(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
function parseVerificationAge(value, now) {
  const t = Date.parse(value || "");
  if (Number.isNaN(t)) return Infinity;
  return now.getTime() - t;
}

function runCheckpoint(record, now = new Date()) {
  const errors = [], warnings = [];
  if (!record?.official_url || !sourceAllowed(record.official_url)) errors.push("unapproved_or_missing_source");
  if (!record?.verified_at) errors.push("missing_verification");
  if (record?.status !== "open") errors.push("not_open");
  if (!record?.eligibility || (Array.isArray(record.eligibility) && record.eligibility.length === 0)) errors.push("missing_eligibility");
  if (record?.deadline) {
    const d = Date.parse(record.deadline);
    if (Number.isNaN(d)) errors.push("invalid_deadline");
    else if (d < now.getTime()) errors.push("deadline_passed");
  }
  if (!record?.prize_label && record?.award_ceiling_usd == null) warnings.push("prize_unknown");
  if (parseVerificationAge(record?.verified_at, now) > FRESH_DAYS * 86400000) warnings.push("stale_verification");
  if (errors.length) return { decision: "REJECT", errors, warnings };
  if (warnings.includes("stale_verification")) return { decision: "NEEDS_REVIEW", errors, warnings };
  return { decision: "PASS", errors, warnings };
}

async function grantsSearch(keyword, rows = 20) {
  const r = await fetch("https://api.grants.gov/v1/api/search2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows, keyword, oppStatuses: "posted" })
  });
  if (!r.ok) throw new Error(`Grants.gov search2 failed: ${r.status}`);
  return r.json();
}

async function grantsFetch(opportunityId) {
  const r = await fetch("https://api.grants.gov/v1/api/fetchOpportunity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunityId })
  });
  if (!r.ok) throw new Error(`Grants.gov fetchOpportunity failed: ${r.status}`);
  return r.json();
}

function normalizeGrant(hit, detail, verifiedAt) {
  const s = detail?.data?.synopsis || {};
  const deadline = parseDate(s.responseDate || hit.closeDate);
  const ceiling = Number(s.awardCeiling || 0) || null;
  const floor = Number(s.awardFloor || 0) || null;
  const eligibility = (s.applicantTypes || []).map(x => x.description).filter(Boolean);
  return {
    id: `grants-${hit.id}`,
    source_id: "grants-gov",
    title: detail?.data?.opportunityTitle || hit.title,
    kind: "Grant",
    status: hit.oppStatus === "posted" ? "open" : String(hit.oppStatus || "").toLowerCase(),
    official_url: `https://www.grants.gov/search-results-detail/${hit.id}`,
    verified_at: verifiedAt,
    updated_at_source: s.lastUpdatedDate || null,
    summary: s.synopsisDesc || `${hit.agencyName || ""} opportunity`,
    countries: ["United States applicant ecosystem"],
    geographic_scope: "country_or_applicant_specific",
    skills: [],
    deadline,
    award_ceiling_usd: ceiling,
    award_floor_usd: floor,
    prize_label: ceiling ? `Award ceiling: $${ceiling.toLocaleString("en-US")}` : "Award published on official source",
    eligibility,
    agency: hit.agencyName || s.agencyName || null,
    participants: null,
    source_facts_hash: `${hit.id}|${s.lastUpdatedDate || ""}|${deadline || ""}|${ceiling || ""}|${floor || ""}|${hit.oppStatus || ""}|${eligibility.join("|")}`
  };
}

async function getAiClassification(env, record) {
  if (!env.AI) return { categories: record.skills || [] };
  try {
    const prompt = `Classify this verified opportunity into up to 6 short skill/category tags. Do not invent facts. Return JSON only. Title: ${record.title}. Summary: ${record.summary}`;
    const out = await env.AI.run("@cf/meta/llama-3.2-1b-instruct", { prompt });
    let categories = record.skills || [];
    try {
      const parsed = typeof out?.response === "string" ? JSON.parse(out.response) : out?.response;
      if (Array.isArray(parsed)) categories = parsed.slice(0, 6).map(String);
      else if (Array.isArray(parsed?.categories)) categories = parsed.categories.slice(0, 6).map(String);
    } catch {}
    return { categories, ai_raw: out?.response || null };
  } catch {
    return { categories: record.skills || [] };
  }
}

async function getBootstrap(env) {
  if (env.ASSETS) {
    const res = await env.ASSETS.fetch(new Request(new URL("/opportunities.json", "https://assets.local")));
    if (res.ok) return res.json();
  }
  return [];
}

async function getPublishedOpportunities(env) {
  if (!env.OPPORTUNITIES) return getBootstrap(env);
  const index = await env.OPPORTUNITIES.get(PUBLISHED_INDEX_KEY, "json");
  if (Array.isArray(index) && index.length) return index;
  return getBootstrap(env);
}

async function getExisting(env, id) {
  if (!env.OPPORTUNITIES) return null;
  const envelope = await env.OPPORTUNITIES.get(`opportunity:${id}`, "json");
  return envelope?.record || envelope || null;
}

async function rebuildPublishedIndex(env) {
  if (!env.OPPORTUNITIES) return;
  const listed = await env.OPPORTUNITIES.list({ prefix: "opportunity:" });
  const values = await Promise.all(listed.keys.map(k => env.OPPORTUNITIES.get(k.name, "json")));
  const rows = values
    .filter(Boolean)
    .map(x => x.record || x)
    .filter(x => runCheckpoint(x).decision === "PASS");
  await env.OPPORTUNITIES.put(PUBLISHED_INDEX_KEY, JSON.stringify(rows));
}

async function saveIfSafe(env, record, stats) {
  const gate = runCheckpoint(record);
  const previous = await getExisting(env, record.id);
  const unchanged = Boolean(previous?.source_facts_hash && previous.source_facts_hash === record.source_facts_hash);
  const envelope = {
    record,
    checkpoint: gate,
    saved_at: new Date().toISOString(),
    revision: unchanged ? (previous.revision || 1) : ((previous?.revision || 0) + 1)
  };
  if (gate.decision === "PASS" && env.OPPORTUNITIES) {
    if (!unchanged) {
      await env.OPPORTUNITIES.put(`opportunity:${record.id}`, JSON.stringify(envelope));
      if (previous) {
        stats.updated++;
        if (env.OPPORTUNITY_LOG) await env.OPPORTUNITY_LOG.put(`change:${record.id}:${Date.now()}`, JSON.stringify({
          id: record.id,
          previous_facts_hash: previous.source_facts_hash || null,
          current_facts_hash: record.source_facts_hash,
          previous_deadline: previous.deadline || null,
          current_deadline: record.deadline || null,
          previous_status: previous.status || null,
          current_status: record.status || null,
          checked_at: new Date().toISOString()
        }), { expirationTtl: 7776000 });
      } else stats.new++;
    } else stats.unchanged++;
  }
  if (gate.decision !== "PASS" && previous && env.OPPORTUNITIES) {
    await env.OPPORTUNITIES.delete(`opportunity:${record.id}`);
    stats.removed++;
  }
  if (env.OPPORTUNITY_LOG) await env.OPPORTUNITY_LOG.put(`check:${record.id}:${Date.now()}`, JSON.stringify(envelope), { expirationTtl: 2592000 });
  return gate;
}

async function refreshAgent(env) {
  const verifiedAt = new Date().toISOString();
  const stats = { searched: 0, normalized: 0, passed: 0, review: 0, rejected: 0, new: 0, updated: 0, unchanged: 0, removed: 0 };
  for (const keyword of KEYWORDS) {
    let result;
    try { result = await grantsSearch(keyword, 20); } catch { continue; }
    const hits = result?.data?.oppHits || [];
    stats.searched += hits.length;
    for (const hit of hits.slice(0, 5)) {
      try {
        const detail = await grantsFetch(hit.id);
        let record = normalizeGrant(hit, detail, verifiedAt);
        stats.normalized++;
        const ai = await getAiClassification(env, record);
        record.skills = ai.categories;
        const gate = await saveIfSafe(env, record, stats);
        if (gate.decision === "PASS") stats.passed++;
        else if (gate.decision === "NEEDS_REVIEW") stats.review++;
        else stats.rejected++;
      } catch (error) { console.log("record_refresh_error", hit.id, String(error)); }
    }
  }
  await rebuildPublishedIndex(env);
  if (env.META) await env.META.put("last-refresh", JSON.stringify({ ...stats, at: verifiedAt }));
  console.log("OpportunityRadar refresh", stats);
  return stats;
}

async function serveAsset(request, env) {
  if (!env.ASSETS) return new Response("OpportunityRadar", { status: 404 });
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  headers.set("x-opportunityradar-version", BUILD_VERSION);
  if (url.pathname === "/" || url.pathname.endsWith(".html")) headers.set("cache-control", "no-store, max-age=0");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      const meta = env.META ? await env.META.get("last-refresh", "json") : null;
      return json({ service: "OpportunityRadar", status: "online", version: BUILD_VERSION, last_refresh: meta, storage: Boolean(env.OPPORTUNITIES) });
    }
    if (url.pathname === "/api/opportunities") {
      try {
        const rows = await getPublishedOpportunities(env);
        return json({ generated_at: new Date().toISOString(), version: BUILD_VERSION, count: rows.length, opportunities: rows });
      } catch (error) {
        return json({ error: "opportunity_read_failed", message: String(error), version: BUILD_VERSION }, 500);
      }
    }
    if (url.pathname === "/api/stats") {
      const meta = env.META ? await env.META.get("last-refresh", "json") : null;
      return json({ refresh: meta, storage_configured: Boolean(env.OPPORTUNITIES), log_configured: Boolean(env.OPPORTUNITY_LOG), version: BUILD_VERSION });
    }
    return serveAsset(request, env);
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(refreshAgent(env)); }
};
