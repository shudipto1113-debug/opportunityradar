import fs from "node:fs";
import vm from "node:vm";

const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!worker.includes("PUBLISHED_INDEX_KEY")) throw new Error("published index missing");
if (!worker.includes("missing_eligibility")) throw new Error("fail-closed eligibility check missing");
if (!worker.includes("async scheduled")) throw new Error("scheduled agent missing");
if (!worker.includes("/api/opportunities")) throw new Error("opportunity API missing");

const site = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
for (const marker of ["CHECKED BEFORE RECOMMENDATION", "CHECKPOINT PASSED", "/api/opportunities", "Open official source"]) {
  if (!site.includes(marker)) throw new Error(`site marker missing: ${marker}`);
}

const opportunities = JSON.parse(fs.readFileSync(new URL("./public/opportunities.json", import.meta.url), "utf8"));
if (!Array.isArray(opportunities) || opportunities.length < 5) throw new Error("bootstrap dataset too small");
for (const o of opportunities) {
  if (!o.official_url || !o.verified_at || !o.status || !o.eligibility) throw new Error(`provenance missing for ${o.id}`);
}

console.log(`SELF-TEST PASS — ${opportunities.length} bootstrap opportunities, worker/site markers verified.`);
