// OpportunityRadar refresh worker skeleton.
// Source data first; AI is secondary for classification/normalization.

const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: {"content-type":"application/json"}
});

async function grantsSearch(keyword, rows = 25) {
  const r = await fetch("https://api.grants.gov/v1/api/search2", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({ rows, keyword, oppStatuses: "posted" })
  });
  if (!r.ok) throw new Error(`Grants.gov search2 failed: ${r.status}`);
  return r.json();
}

async function grantsFetch(opportunityId) {
  const r = await fetch("https://api.grants.gov/v1/api/fetchOpportunity", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({ opportunityId })
  });
  if (!r.ok) throw new Error(`Grants.gov fetchOpportunity failed: ${r.status}`);
  return r.json();
}

function normalizeGrant(hit, detail) {
  const s = detail?.data?.synopsis || {};
  return {
    id: `grants-${hit.id}`,
    source_id: "grants-gov",
    title: detail?.data?.opportunityTitle || hit.title,
    kind: "Grant",
    status: hit.oppStatus === "posted" ? "open" : String(hit.oppStatus || "").toLowerCase(),
    official_url: `https://www.grants.gov/search-results-detail/${hit.id}`,
    verified_at: new Date().toISOString().slice(0,10),
    summary: s.synopsisDesc || `${hit.agencyName || ""} opportunity`,
    countries: ["United States applicant ecosystem"],
    skills: [],
    deadline: s.responseDate || hit.closeDate || null,
    award_ceiling_usd: Number(s.awardCeiling || 0) || null,
    award_floor_usd: Number(s.awardFloor || 0) || null,
    eligibility: (s.applicantTypes || []).map(x => x.description).filter(Boolean),
    agency: hit.agencyName || s.agencyName || null,
    participants: null
  };
}

function validateRecord(record) {
  return Boolean(record.id && record.title && record.official_url && record.verified_at);
}

export default {
  async scheduled(controller, env, ctx) {
    const keywords = ["artificial intelligence", "machine learning", "research", "technology"];
    for (const keyword of keywords) {
      try {
        const result = await grantsSearch(keyword, 25);
        const hits = result?.data?.oppHits || [];
        for (const hit of hits.slice(0, 10)) {
          try {
            const detail = await grantsFetch(hit.id);
            const record = normalizeGrant(hit, detail);
            if (!validateRecord(record)) continue;
            // Next step: persist in KV/D1/R2 and publish a compact manifest.
            console.log("validated", record.id, record.title);
          } catch (e) {
            console.log("detail error", hit.id, String(e));
          }
        }
      } catch (e) {
        console.log("search error", keyword, String(e));
      }
    }
  },

  async fetch(request) {
    return json({
      service: "OpportunityRadar",
      status: "online",
      design: "source-first; AI-assisted; provenance-required",
      now: new Date().toISOString()
    });
  }
};
