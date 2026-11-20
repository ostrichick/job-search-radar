import assert from 'node:assert/strict';
import { feedHealth, maximumFeedAgeMs } from '../public/munseong/feed-health.js';
import { sourceHealthWarnings, summaryText, validatePublishedFeed, workflowCommandText } from '../scripts/check-feed-health.mjs';
const now=Date.parse('2026-10-19T12:00:00Z');
const recent=new Date(now-maximumFeedAgeMs).toISOString();
assert.equal(feedHealth(recent,now).ok,true);
assert.equal(feedHealth(new Date(now-maximumFeedAgeMs-1).toISOString(),now).ok,false);
assert.equal(feedHealth('',now).ok,false);
assert.equal(feedHealth(new Date(now+600001).toISOString(),now).ok,false);
assert.throws(()=>validatePublishedFeed({updatedAt:'2026-10-01',jobs:[],sourceStatus:[]},now));
assert.throws(()=>validatePublishedFeed({updatedAt:recent,jobs:{}},now));
assert.equal(validatePublishedFeed({updatedAt:recent,jobs:[],sourceStatus:[]},now).jobs,0);
const recommendationFixture=(source,index)=>({
  id:`${source}-${index}`, source, recommendationEligible:true, roleFitEvidence:true,
  roleFitBasis:'keyword_match', score:80, eligibilityCode:'korea',
  requirementsStatus:'clear', listingStatus:'current_feed'
});
const warningFeed={
  recommendationPolicyVersion:4,
  recommendationSummary:{count:10},
  jobs:[
    ...Array.from({length:5},(_,index)=>recommendationFixture('Himalayas',index)),
    ...Array.from({length:5},(_,index)=>recommendationFixture('RWS TrainAI',index))
  ],
  sourceMetrics:{
    Incruit:{kind:'job_board',consecutiveFailures:2,reliabilityState:'degraded',qualityTier:'weak',lastSuccessAt:'2026-10-01T00:00:00Z'},
    Himalayas:{kind:'job_board',consecutiveFailures:0,reliabilityState:'observed',qualityTier:'mixed',recommendedCount:5},
    Manual:{kind:'manual',consecutiveFailures:0,reliabilityState:'observed',qualityTier:'mixed'}
  },
  collectionGaps:[{source:'고용24',status:'not_configured',label:'공식 API 미연결'}]
};
const warnings=sourceHealthWarnings(warningFeed,now);
assert.equal(warnings.length,3);
assert.ok(warnings.some((warning)=>/Incruit: 2회 연속 수집 실패/.test(warning)&&/품질 weak/.test(warning)));
assert.ok(warnings.some((warning)=>/Himalayas:/.test(warning)&&/성공 기록 없음/.test(warning)&&/추천 5\/10 \(50%\) 집중/.test(warning)));
assert.ok(warnings.some((warning)=>/고용24: 공식 API 미연결/.test(warning)));
assert.equal(workflowCommandText('a%b\r\nc'),'a%25b%0D%0Ac');
assert.equal(summaryText('a`b|c'),'a\\`b\\|c');
assert.deepEqual(sourceHealthWarnings({sourceMetrics:{Manual:{kind:'manual'}}},now),[]);
console.log('published feed age, structure, and source health checks passed');
