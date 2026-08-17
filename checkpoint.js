// Fail-closed pre-result gate.
// AI may propose or summarize, but it cannot bypass a failed critical check.

const APPROVED_HOSTS = new Set(["grants.gov","www.grants.gov","devpost.com","www.devpost.com","kaggle.com","www.kaggle.com"]);

function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
function officialSourceOk(url) { const host = hostOf(url); return [...APPROVED_HOSTS].some(h => host === h || host.endsWith("." + h)); }
function deadlineInfo(deadline, now = new Date()) { if (!deadline) return {known:false,passed:false}; const t=Date.parse(deadline); if(Number.isNaN(t)) return {known:true,invalid:true,passed:false}; return {known:true,invalid:false,passed:t<now.getTime()}; }

export function runCheckpoint(record, { now = new Date(), maxAgeDays = 7 } = {}) {
  const errors=[], warnings=[];
  if(!record?.official_url || !/^https?:\/\//i.test(record.official_url)) errors.push("missing_or_invalid_official_url");
  else if(!officialSourceOk(record.official_url)) errors.push("source_not_on_approved_official_domain");
  if(!record?.verified_at) errors.push("missing_verification_date");
  else { const ageMs=now.getTime()-Date.parse(record.verified_at); if(!Number.isNaN(ageMs)&&ageMs>maxAgeDays*86400000) warnings.push("verification_is_stale"); }
  if(record?.status!=="open") errors.push("opportunity_not_open");
  const dl=deadlineInfo(record?.deadline,now); if(dl.invalid) errors.push("invalid_deadline"); if(dl.passed) errors.push("deadline_passed");
  if(!record?.eligibility) warnings.push("eligibility_not_fully_known");
  if(record?.prize_cash_usd==null&&!record?.prize_label) warnings.push("prize_not_published");
  const criticalFailure=errors.length>0; const staleOnly=!criticalFailure&&warnings.includes("verification_is_stale");
  const decision=criticalFailure?"REJECT":staleOnly?"NEEDS_REVIEW":"PASS";
  return {decision,safe_to_recommend:decision==="PASS",errors,warnings,checked_at:now.toISOString()};
}

export function filterSafe(records, options) { return records.map(record=>({record,checkpoint:runCheckpoint(record,options)})).filter(x=>x.checkpoint.safe_to_recommend); }
