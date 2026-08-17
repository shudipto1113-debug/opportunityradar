import { runCheckpoint } from './checkpoint.js';
const now=new Date('2026-08-17T12:00:00Z');
const base={official_url:'https://devpost.com/hackathons/test',verified_at:'2026-08-17',status:'open',deadline:'2026-08-20T12:00:00Z',eligibility:'Adults worldwide',prize_cash_usd:1000};
const cases=[['PASS',{...base}],['REJECT_BAD_SOURCE',{...base,official_url:'https://random-blog.example/test'}],['REJECT_CLOSED',{...base,status:'closed'}],['REJECT_PASSED_DEADLINE',{...base,deadline:'2026-08-01T12:00:00Z'}],['NEEDS_REVIEW_STALE',{...base,verified_at:'2026-07-01'}]];
let failed=0;for(const [name,record] of cases){const got=runCheckpoint(record,{now,maxAgeDays:7}).decision;const expected=name==='PASS'?'PASS':name==='NEEDS_REVIEW_STALE'?'NEEDS_REVIEW':'REJECT';if(got!==expected){console.error(name,{expected,got});failed++;}}
if(failed)process.exit(1);console.log('Checkpoint tests PASS:',cases.length);
