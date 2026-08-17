// OpportunityRadar autonomous refresh agent.
// Source data first. AI is secondary for classification, normalization and translation.
// The agent fails closed: a record cannot become a recommendation unless it passes the gate.

const APPROVED_HOSTS = new Set(["grants.gov", "www.grants.gov", "devpost.com", "www.devpost.com", "kaggle.com", "www.kaggle.com"]);
const KEYWORDS = ["artificial intelligence", "machine learning", "research", "technology", "scholarship", "fellowship", "startup"];
const FRESH_DAYS = 7;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" }
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

function runCheckpoint(record, now = new Date()) {
  const errors = [], warnings = [];
  if (!record.official_url || !sourceAllowed(record.official_url)) errors.push("unapproved_or_missing_source");
  if (!record.verified_at) errors.push("missing_verification");
  if (record.status !== "open") errors.push("not_open");
  if (record.deadline) {
    const d = Date.parse(record.deadline);
    if (Number.isNaN(d)) errors.push("invalid_deadline");
    else if (d < now.getTime()) errors.push("deadline_passed");
  }
  if (!record.eligibility) warnings.push("eligibility_unknown");
  if (!record.prize_label && record.award_ceiling_usd == null) warnings.push("prize_unknown");
  if (record.verified_at) {
    const age = now.getTime() - Date.parse(record.verified_at);
    if (!Number.isNaN(age) && age > FRESH_DAYS * 86400000) warnings.push("stale_verification");
  }
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
    deadline: parseDate(s.responseDate || hit.closeDate),
    award_ceiling_usd: Number(s.awardCeiling || 0) || null,
    award_floor_usd: Number(s.awardFloor || 0) || null,
    prize_label: s.awardCeiling ? `Award ceiling: $${Number(s.awardCeiling).toLocaleString("en-US")}` : "Award published on official source",
    eligibility: (s.applicantTypes || []).map(x => x.description).filter(Boolean),
    agency: hit.agencyName || s.agencyName || null,
    participants: null,
    source_facts_hash: `${hit.id}|${s.lastUpdatedDate || ""}|${s.responseDate || hit.closeDate || ""}|${s.awardCeiling || ""}|${s.awardFloor || ""}`
  };
}

async function getAiClassification(env, record) {
  // Optional enrichment only. If Workers AI is unavailable or over quota,
  // preserve source fields and continue without AI. Never use AI to fill unknown facts.
  if (!env.AI) return { categories: record.skills || [], translated_summary: null };
  try {
    const prompt = `Classify this verified opportunity into up to 6 short skill/category tags. Do not invent facts. Return JSON only.\nTitle: ${record.title}\nSummary: ${record.summary}`;
    const out = await env.AI.run("@cf/meta/llama-3.2-1b-instruct", { prompt });
    return { categories: record.skills || [], translated_summary: out?.response || null };
  } catch {
    return { categories: record.skills || [], translated_summary: null };
  }
}

async function saveIfSafe(env, record) {
  const gate = runCheckpoint(record);
  const envelope = { record, checkpoint: gate, saved_at: new Date().toISOString() };
  if (gate.decision === "PASS" && env.OPPORTUNITIES) {
    await env.OPPORTUNITIES.put(`opportunity:${record.id}`, JSON.stringify(envelope));
  }
  if (env.OPPORTUNITY_LOG) {
    await env.OPPORTUNITY_LOG.put(`check:${record.id}:${Date.now()}`, JSON.stringify(envelope), { expirationTtl: 2592000 });
  }
  return gate;
}

export default {
  async scheduled(controller, env, ctx) {
    const verifiedAt = new Date().toISOString();
    const stats = { searched: 0, normalized: 0, passed: 0, review: 0, rejected: 0 };

    for (const keyword of KEYWORDS) {
      let result;
      try { result = await grantsSearch(keyword, 20); } catch { continue; }
      const hits = result?.data?.oppHits || [];
      stats.searched += hits.length;

      // Keep free-tier subrequest use bounded: fetch only a small sample per keyword.
      for (const hit of hits.slice(0, 5)) {
        try {
          const detail = await grantsFetch(hit.id);
          let record = normalizeGrant(hit, detail, verifiedAt);
          stats.normalized++;
          const ai = await getAiClassification(env, record);
          record.skills = ai.categories;
          const gate = await saveIfSafe(env, record);
          if (gate.decision === "PASS") stats.passed++;
          else if (gate.decision === "NEEDS_REVIEW") stats.review++;
          else stats.rejected++;
        } catch (error) {
          console.log("record_refresh_error", hit.id, String(error));
        }
      }
    }

    if (env.META) await env.META.put("last-refresh", JSON.stringify({ ...stats, at: verifiedAt }));
    console.log("OpportunityRadar refresh", stats);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const meta = env.META ? await env.META.get("last-refresh", "json") : null;
      return json({ service: "OpportunityRadar", status: "online", last_refresh: meta });
    }
    return json({ service: "OpportunityRadar", status: "online", gate: "fail-closed", timezone: "UTC" });
  }
};
