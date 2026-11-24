import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InputError,
  formatRepdte,
  formatThousandsUsd,
  getBankFinancials,
  normalizeState,
  searchBankBranches,
  searchBanks,
  searchFailedBanks,
} from '../dist/core.js';

function mockFetch(routes) {
  return async (url) => {
    for (const [needle, body] of Object.entries(routes)) {
      if (url.includes(needle)) return JSON.stringify(body);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test('formatThousandsUsd and formatRepdte format FDIC values accurately', () => {
  assert.equal(formatThousandsUsd(4174631000), '$4.17T');
  assert.equal(formatThousandsUsd(68773), '$68.77M');
  assert.equal(formatThousandsUsd(500), '$500.0K');
  assert.equal(formatRepdte('20260930'), '2026-09-30');
  assert.equal(normalizeState('New York'), 'NY');
  assert.equal(normalizeState('ca'), 'CA');
  assert.throws(() => normalizeState('Narnia'), InputError);
});

test('searchBanks parses FDIC institutions response', async () => {
  const fetchText = mockFetch({
    '/banks/institutions': {
      meta: { total: 1, index: { createTimestamp: '2026-11-24T18:30:22Z' } },
      data: [{
        data: {
          CERT: 628, NAME: 'JPMorgan Chase Bank, National Association', CITY: 'Columbus', STALP: 'OH',
          ZIP: '43240', ACTIVE: 1, ASSET: 4174631000, DEP: 2901316000, EQ: 331583000, NETINC: 44485000,
          ROA: 1.48, ROE: 17.64, ESTYMD: '01/01/1824', REPDTE: '20260930', BKCLASS: 'N', OFFICES: 4950,
        },
      }],
    },
  });
  const res = await searchBanks(fetchText, { name: 'JPMorgan' });
  assert.equal(res.total_matches, 1);
  assert.equal(res.banks[0].cert, 628);
  assert.equal(res.banks[0].active, true);
  assert.equal(res.banks[0].total_assets_usd, '$4.17T');
  assert.match(res.summary, /JPMorgan Chase Bank/);
});

test('getBankFinancials calculates uninsured deposit share and formats metrics', async () => {
  const fetchText = mockFetch({
    '/banks/financials': {
      meta: { total: 1, index: { createTimestamp: '2026-11-19T16:41:28Z' } },
      data: [{
        data: {
          CERT: 628, NAME: 'JPMORGAN CHASE BANK NA', REPDTE: '20260930',
          ASSET: 4174631000, DEP: 2901316000, DEPDOM: 2285468000, DEPINS: 905857000, DEPUNINS: 1436864000,
          EQ: 331583000, RBCT1J: 296414000, IDT1CER: 14.185, IDT1RWAJR: 14.186,
          NETINC: 44485000, ROA: 1.479, ROE: 17.64, NIMY: 2.898, EEFFR: 54.625, NCLNLSR: 0.759,
        },
      }],
    },
  });
  const res = await getBankFinancials(fetchText, { cert: 628, quarters: 1 });
  assert.equal(res.cert, 628);
  assert.equal(res.latest.report_date, '2026-09-30');
  assert.equal(res.latest.cet1_ratio_pct, 14.19);
  assert.equal(res.latest.uninsured_deposit_share_pct, 62.87);
  assert.match(res.summary, /CET1 14\.19%/);
});

test('searchFailedBanks and searchBankBranches parse responses cleanly', async () => {
  const fetchText = mockFetch({
    '/banks/failures': {
      meta: { total: 1, index: { createTimestamp: '2026-11-24T15:16:13Z' } },
      data: [{
        data: {
          CERT: 25744, NAME: 'SMALL BUSINESS BANK', CITYST: 'LENEXA, KS', PSTALP: 'KS',
          FAILDATE: '7/17/2026', FAILYR: '2026', SAVR: 'DIF', RESTYPE: 'FAILURE',
          QBFASSET: 72947, QBFDEP: 68773, COST: 5671, FIN: '10553', CHCLASS: 'SM',
        },
      }],
    },
    '/banks/locations': {
      meta: { total: 1, index: { createTimestamp: '2026-11-24T18:18:10Z' } },
      data: [{
        data: {
          CERT: '628', NAME: 'JPMorgan Chase Bank, National Association',
          OFFNAME: 'GRAND CENTRAL TERMINAL BRANCH', ADDRESS: '89 E 42nd St',
          CITY: 'New York City', STALP: 'NY', ZIP: '10017', COUNTY: 'New York',
          MAINOFF: 0, SERVTYPE: 28, LATITUDE: 40.7524, LONGITUDE: -73.9774,
        },
      }],
    },
  });
  const failRes = await searchFailedBanks(fetchText, { year: 2026 });
  assert.equal(failRes.failures[0].name, 'SMALL BUSINESS BANK');
  assert.equal(failRes.failures[0].assets_at_failure_usd, '$72.95M');

  const branchRes = await searchBankBranches(fetchText, { cert: 628, zip: '10017' });
  assert.equal(branchRes.branches[0].branch_name, 'GRAND CENTRAL TERMINAL BRANCH');
  assert.equal(branchRes.branches[0].zip, '10017');
});
