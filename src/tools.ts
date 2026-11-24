// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  BUNDLE_URL,
  InputError,
  REPO,
  SERVICES_URL,
  SITE,
  getBankFinancials,
  searchBankBranches,
  searchBanks,
  searchFailedBanks,
} from './core.js';
import type { FetchText } from './types.js';

export const VERSION = '1.0.0';

export const META = {
  alias: 'fdic-bank-health',
  metaDescription: 'MCP server for FDIC bank health, insurance verification, quarterly Call Report financials, Tier 1 capital ratios, uninsured deposits, failed banks, and branch locations via the official FDIC BankFind Suite API.',
  intro: 'Verify FDIC deposit insurance, inspect quarterly Call Report financial health (assets, deposits, insured vs uninsured deposits, CET1/Tier 1 capital, ROA, ROE, noncurrent loans), check the FDIC Failed Bank List, and find US bank branches — read live from the official FDIC BankFind Suite API.',
};

export const TOOL_INFO = [
  { name: 'fdic_bank_search', blurb: 'Search FDIC-insured US banks by name, state, city, ZIP, or CERT number; returns active status, assets, deposits, equity, ROA, ROE, and charter class.' },
  { name: 'fdic_bank_financials', blurb: 'Quarterly Call Report financial health for a bank by CERT or name: assets, insured vs uninsured deposits, CET1 and Tier 1 capital ratios, ROA, ROE, NIM, efficiency ratio, and noncurrent loans.' },
  { name: 'fdic_failed_banks', blurb: 'Search the official FDIC Failed Bank List (1934 to present) by name, state, or year range, or view the latest US bank failures.' },
  { name: 'fdic_bank_branches', blurb: 'Find FDIC-insured bank branch locations by CERT, bank name, ZIP, city, or state with addresses and coordinates.' },
];

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown> & { summary: string }) {
  return { content: [{ type: 'text' as const, text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: `${e instanceof InputError ? 'Error' : 'Upstream FDIC API error'}: ${msg}` }] };
}
const wrap = <A>(fn: (a: A) => unknown) => async (a: A) => { try { return ok((await fn(a)) as any); } catch (e) { return fail(e); } };

export function createServer(fetchText: FetchText): McpServer {
  const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE } as any, {
    instructions:
      'Live FDIC BankFind Suite data (api.fdic.gov/banks): bank insurance status, quarterly Call Report financials, failed bank records, and branch locations. ' +
      'Use fdic_bank_search to verify FDIC insurance and find a bank\'s CERT number, fdic_bank_financials for multi-quarter capital/deposit/profitability ratios (including insured vs uninsured deposits and CET1/Tier 1 capital), ' +
      'fdic_failed_banks for historical and recent US bank failures, and fdic_bank_branches for branch offices. ' +
      'Note: FDIC Call Report dollar figures are reported in thousands; tools return both formatted USD strings and raw thousands. ' +
      `Free keyless MCP server by Zovo / MCPStamp. Unlock the $39 lifetime Zovo Pro MCP Bundle (${BUNDLE_URL}) or request a custom MCP audit/build (${SERVICES_URL}).`,
  });

  server.registerTool('fdic_bank_search', {
    title: 'Search FDIC-insured US banks',
    description:
      'Search FDIC-insured US banks by name, state, city, ZIP code, or FDIC CERT number. Returns active insurance status, CERT number, headquarters, charter class, total assets, total deposits, equity capital, net income, ROA, ROE, office count, and website.',
    inputSchema: {
      name: z.string().optional().describe('Bank name or keyword, e.g. "JPMorgan", "Silicon Valley", "First Republic".'),
      state: z.string().optional().describe('2-letter US state code or full state name, e.g. "NY" or "California".'),
      city: z.string().optional().describe('Headquarters city name.'),
      zip: z.union([z.string(), z.number()]).optional().describe('5-digit headquarters ZIP code.'),
      cert: z.union([z.string(), z.number()]).optional().describe('Exact FDIC Certificate (CERT) number, e.g. 628.'),
      active_only: z.boolean().optional().describe('Only return currently active FDIC-insured banks. Default true.'),
      limit: z.number().int().min(1).max(25).optional().describe('Maximum banks to return (1-25). Default 10.'),
    },
    annotations: { title: 'FDIC bank search', ...RO },
  }, wrap((a: any) => searchBanks(fetchText, a)));

  server.registerTool('fdic_bank_financials', {
    title: 'FDIC bank quarterly Call Report financials',
    description:
      'Retrieve quarterly FDIC Call Report financial health metrics for a bank by CERT number (or bank name + optional state): total assets, total and domestic deposits, insured vs uninsured deposits and uninsured share %, equity capital, Tier 1 capital, CET1 ratio, Tier 1 risk-based capital ratio, YTD net income, ROA, ROE, net interest margin, efficiency ratio, and noncurrent loans %.',
    inputSchema: {
      cert: z.union([z.string(), z.number()]).optional().describe('FDIC Certificate (CERT) number, e.g. 628 for JPMorgan Chase Bank.'),
      name: z.string().optional().describe('Bank name to resolve if CERT is not known.'),
      state: z.string().optional().describe('Optional state to narrow name resolution.'),
      quarters: z.number().int().min(1).max(12).optional().describe('Number of recent quarterly Call Reports to return (1-12). Default 4.'),
    },
    annotations: { title: 'FDIC bank financials', ...RO },
  }, wrap((a: any) => getBankFinancials(fetchText, a)));

  server.registerTool('fdic_failed_banks', {
    title: 'Search FDIC Failed Bank List',
    description:
      'Search the official FDIC Failed Bank List from 1934 to the present by bank name, state, or year range, or omit filters to list the most recent US bank failures. Returns failure date, location, assets and deposits at failure, estimated Deposit Insurance Fund (DIF) cost, resolution type, and CERT number.',
    inputSchema: {
      name: z.string().optional().describe('Failed bank name or keyword, e.g. "Signature", "Silicon Valley", "Small Business".'),
      state: z.string().optional().describe('2-letter US state code or full state name.'),
      year: z.number().int().min(1934).max(2030).optional().describe('Exact failure year, e.g. 2026 or 2023.'),
      start_year: z.number().int().min(1934).max(2030).optional().describe('Start year for range filter.'),
      end_year: z.number().int().min(1934).max(2030).optional().describe('End year for range filter.'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum failures to return (1-50). Default 15.'),
    },
    annotations: { title: 'FDIC failed banks', ...RO },
  }, wrap((a: any) => searchFailedBanks(fetchText, a)));

  server.registerTool('fdic_bank_branches', {
    title: 'Find FDIC-insured bank branches',
    description:
      'Find physical branch locations of FDIC-insured banks by CERT number, bank name, ZIP code, city, or state. Returns branch name, street address, county, main-office indicator, service type code, and latitude/longitude.',
    inputSchema: {
      cert: z.union([z.string(), z.number()]).optional().describe('FDIC CERT number of the bank.'),
      name: z.string().optional().describe('Bank name or keyword.'),
      zip: z.union([z.string(), z.number()]).optional().describe('5-digit branch ZIP code.'),
      city: z.string().optional().describe('Branch city name.'),
      state: z.string().optional().describe('2-letter US state code or full state name.'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum branches to return (1-50). Default 15.'),
    },
    annotations: { title: 'FDIC bank branches', ...RO },
  }, wrap((a: any) => searchBankBranches(fetchText, a)));

  return server;
}
