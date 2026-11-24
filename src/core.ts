// Core business logic for fdic-bank-health-financials-mcp.
// Reads the official FDIC BankFind Suite API (https://api.fdic.gov/banks/) at call time. No API key required.
import type { FetchText } from './types.js';

export const REPO = 'fdic-bank-health-financials-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const BUNDLE_URL = `https://mcp.zovo.one/bundle?src=sat.${REPO}`;
export const SERVICES_URL = `https://www.mcpstamp.com/services/?src=sat.${REPO}`;
const API_BASE = 'https://api.fdic.gov/banks';

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

const STATE_NAMES: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL',
  INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA',
  MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK',
  OREGON: 'OR', PENNSYLVANIA: 'PA', 'PUERTO RICO': 'PR', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX',
  UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI', WYOMING: 'WY', GUAM: 'GU', 'VIRGIN ISLANDS': 'VI',
};

const CHARTER_LABELS: Record<string, string> = {
  N: 'National Bank (OCC)',
  SM: 'State Member Bank (Federal Reserve)',
  NM: 'State Nonmember Bank (FDIC)',
  SB: 'Federal Savings Bank (OCC)',
  SA: 'State Savings Association',
  OI: 'Insured US Branch of Foreign Bank',
  SL: 'State Savings & Loan',
};

export function normalizeState(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned) return undefined;
  if (/^[A-Z]{2}$/.test(cleaned)) return cleaned;
  const mapped = STATE_NAMES[cleaned];
  if (mapped) return mapped;
  throw new InputError(`Unrecognized US state or territory: "${raw}". Use a 2-letter code (e.g. NY, CA, TX) or full state name.`);
}

export function sanitizeTerm(raw: string): string {
  return raw.replace(/[":()\\[\]{}!^~*?\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatThousandsUsd(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  const dollars = n * 1000;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function round2(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function formatRepdte(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s || null;
}

interface FdicEnvelope {
  meta?: { total?: number; index?: { createTimestamp?: string } };
  data?: Array<{ data: Record<string, any> }>;
}

async function fdicGet(fetchText: FetchText, path: string, params: Record<string, string | number | undefined>, cacheTtl = 1800): Promise<FdicEnvelope> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const url = `${API_BASE}/${path}?${qs.toString()}`;
  const raw = await fetchText(url, { cacheTtl });
  let parsed: FdicEnvelope;
  try {
    parsed = JSON.parse(raw) as FdicEnvelope;
  } catch {
    throw new Error('FDIC API returned invalid JSON');
  }
  return parsed;
}

export async function searchBanks(fetchText: FetchText, args: {
  name?: string;
  state?: string;
  city?: string;
  zip?: string | number;
  cert?: string | number;
  active_only?: boolean;
  limit?: number;
}) {
  const st = normalizeState(args.state);
  const nameClean = args.name ? sanitizeTerm(args.name) : '';
  const cityClean = args.city ? sanitizeTerm(args.city) : '';
  const zipClean = args.zip !== undefined ? String(args.zip).trim().replace(/[^0-9]/g, '') : '';
  const certClean = args.cert !== undefined ? String(args.cert).trim().replace(/[^0-9]/g, '') : '';
  if (!nameClean && !st && !cityClean && !zipClean && !certClean) {
    throw new InputError('Provide at least one search criterion: name, state, city, zip, or cert.');
  }
  const filters: string[] = [];
  if (args.active_only !== false) filters.push('ACTIVE:1');
  if (st) filters.push(`STALP:${st}`);
  if (cityClean) filters.push(`CITY:"${cityClean}"`);
  if (zipClean) filters.push(`ZIP:${zipClean}`);
  if (certClean) filters.push(`CERT:${certClean}`);

  const limit = Math.min(25, Math.max(1, args.limit ?? 10));
  const env = await fdicGet(fetchText, 'institutions', {
    search: nameClean ? `NAME:${nameClean}` : undefined,
    filters: filters.join(' AND ') || undefined,
    fields: 'CERT,NAME,CITY,STALP,ZIP,ACTIVE,ASSET,DEP,EQ,ROA,ROE,NETINC,ESTYMD,REPDTE,BKCLASS,WEBADDR,OFFICES,SPECGRPN',
    sort_by: nameClean ? undefined : 'ASSET',
    sort_order: nameClean ? undefined : 'DESC',
    limit,
  }, 1800);

  const rows = (env.data ?? []).map((r) => r.data);
  const banks = rows.map((d) => ({
    cert: Number(d.CERT),
    name: d.NAME ?? null,
    active: Number(d.ACTIVE) === 1,
    city: d.CITY ?? null,
    state: d.STALP ?? null,
    zip: d.ZIP ?? null,
    charter_class: d.BKCLASS ?? null,
    charter_label: CHARTER_LABELS[String(d.BKCLASS ?? '')] ?? d.BKCLASS ?? null,
    specialty: d.SPECGRPN ?? null,
    total_assets_usd: formatThousandsUsd(d.ASSET),
    total_assets_thousands: d.ASSET ?? null,
    total_deposits_usd: formatThousandsUsd(d.DEP),
    total_deposits_thousands: d.DEP ?? null,
    equity_capital_usd: formatThousandsUsd(d.EQ),
    net_income_usd: formatThousandsUsd(d.NETINC),
    roa_pct: round2(d.ROA),
    roe_pct: round2(d.ROE),
    offices: d.OFFICES ?? null,
    established: d.ESTYMD ?? null,
    report_date: formatRepdte(d.REPDTE),
    website: d.WEBADDR || null,
  }));

  const total = env.meta?.total ?? banks.length;
  const top = banks[0];
  const summary = banks.length === 0
    ? 'No matching FDIC-insured banks found. Try a broader name, remove city/ZIP filters, or set active_only to false to include closed/merged banks.'
    : `Found ${total} matching FDIC-insured bank(s) (showing ${banks.length}). Top match: ${top.name} (CERT ${top.cert}, ${top.city}, ${top.state}) — ${top.active ? 'Active' : 'Inactive'}, assets ${top.total_assets_usd ?? 'N/A'}, deposits ${top.total_deposits_usd ?? 'N/A'}, ROA ${top.roa_pct ?? 'N/A'}%.`;

  return {
    summary,
    total_matches: total,
    returned: banks.length,
    banks,
    as_of: env.meta?.index?.createTimestamp ?? new Date().toISOString(),
    source: 'FDIC BankFind Suite API — Institutions (api.fdic.gov/banks/institutions)',
    more: `${SITE}/free-servers/?${UTM}`,
  };
}

export async function getBankFinancials(fetchText: FetchText, args: {
  cert?: string | number;
  name?: string;
  state?: string;
  quarters?: number;
}) {
  let certNum: number | undefined;
  let resolvedName: string | undefined;

  if (args.cert !== undefined && String(args.cert).trim() !== '') {
    const cleaned = String(args.cert).trim().replace(/[^0-9]/g, '');
    if (!cleaned) throw new InputError('Invalid FDIC CERT number.');
    certNum = Number(cleaned);
  } else if (args.name) {
    const search = await searchBanks(fetchText, { name: args.name, state: args.state, active_only: false, limit: 3 });
    if (search.banks.length === 0) {
      throw new InputError(`No FDIC bank found matching "${args.name}"${args.state ? ` in ${args.state}` : ''}.`);
    }
    certNum = search.banks[0].cert;
    resolvedName = search.banks[0].name ?? undefined;
  } else {
    throw new InputError('Provide either cert (FDIC certificate number) or name.');
  }

  const quarters = Math.min(12, Math.max(1, args.quarters ?? 4));
  const env = await fdicGet(fetchText, 'financials', {
    filters: `CERT:${certNum}`,
    fields: 'CERT,NAME,REPDTE,ASSET,DEP,DEPDOM,DEPINS,DEPUNINS,EQ,RBCT1J,IDT1CER,IDT1RWAJR,NETINC,ROA,ROE,NIMY,EEFFR,NCLNLSR',
    sort_by: 'REPDTE',
    sort_order: 'DESC',
    limit: quarters,
  }, 3600);

  const rows = (env.data ?? []).map((r) => r.data);
  if (rows.length === 0) {
    throw new InputError(`No Call Report financial filings found for FDIC CERT ${certNum}.`);
  }

  const periods = rows.map((d) => {
    const depdom = Number(d.DEPDOM);
    const depunins = Number(d.DEPUNINS);
    const uninsuredPct = Number.isFinite(depdom) && depdom > 0 && Number.isFinite(depunins)
      ? Math.round((depunins / depdom) * 10000) / 100
      : null;
    return {
      report_date: formatRepdte(d.REPDTE),
      total_assets_usd: formatThousandsUsd(d.ASSET),
      total_assets_thousands: d.ASSET ?? null,
      total_deposits_usd: formatThousandsUsd(d.DEP),
      domestic_deposits_usd: formatThousandsUsd(d.DEPDOM),
      insured_deposits_usd: formatThousandsUsd(d.DEPINS),
      uninsured_deposits_usd: formatThousandsUsd(d.DEPUNINS),
      uninsured_deposit_share_pct: uninsuredPct,
      equity_capital_usd: formatThousandsUsd(d.EQ),
      tier1_capital_usd: formatThousandsUsd(d.RBCT1J),
      cet1_ratio_pct: round2(d.IDT1CER),
      tier1_risk_based_capital_ratio_pct: round2(d.IDT1RWAJR),
      net_income_ytd_usd: formatThousandsUsd(d.NETINC),
      roa_pct: round2(d.ROA),
      roe_pct: round2(d.ROE),
      net_interest_margin_pct: round2(d.NIMY),
      efficiency_ratio_pct: round2(d.EEFFR),
      noncurrent_loans_pct: round2(d.NCLNLSR),
    };
  });

  const latest = periods[0];
  const bankName = rows[0].NAME ?? resolvedName ?? `CERT ${certNum}`;
  const summary = `${bankName} (FDIC CERT ${certNum}) as of ${latest.report_date}: Assets ${latest.total_assets_usd ?? 'N/A'}, Deposits ${latest.total_deposits_usd ?? 'N/A'} (${latest.uninsured_deposit_share_pct !== null ? `${latest.uninsured_deposit_share_pct}% uninsured` : 'uninsured % N/A'}), CET1 ${latest.cet1_ratio_pct ?? 'N/A'}%, Tier 1 RBC ${latest.tier1_risk_based_capital_ratio_pct ?? 'N/A'}%, ROA ${latest.roa_pct ?? 'N/A'}%, ROE ${latest.roe_pct ?? 'N/A'}%, Noncurrent loans ${latest.noncurrent_loans_pct ?? 'N/A'}%.`;

  return {
    summary,
    cert: certNum,
    bank_name: bankName,
    latest_report_date: latest.report_date,
    quarters_returned: periods.length,
    latest,
    history: periods,
    notes: 'All FDIC Call Report dollar figures are reported in thousands and formatted above to USD. Net income (NETINC) is year-to-date.',
    as_of: env.meta?.index?.createTimestamp ?? new Date().toISOString(),
    source: 'FDIC BankFind Suite API — Financials / Call Reports (api.fdic.gov/banks/financials)',
    more: `${SITE}/free-servers/?${UTM}`,
  };
}

export async function searchFailedBanks(fetchText: FetchText, args: {
  name?: string;
  state?: string;
  year?: number;
  start_year?: number;
  end_year?: number;
  limit?: number;
}) {
  const st = normalizeState(args.state);
  const nameClean = args.name ? sanitizeTerm(args.name) : '';
  const filters: string[] = [];
  if (st) filters.push(`PSTALP:${st}`);
  if (args.year) {
    filters.push(`FAILYR:${args.year}`);
  } else if (args.start_year || args.end_year) {
    const lo = args.start_year ?? 1934;
    const hi = args.end_year ?? new Date().getUTCFullYear();
    if (lo > hi) throw new InputError('start_year cannot be greater than end_year.');
    filters.push(`FAILYR:[${lo} TO ${hi}]`);
  }

  const limit = Math.min(50, Math.max(1, args.limit ?? 15));
  const env = await fdicGet(fetchText, 'failures', {
    search: nameClean ? `NAME:${nameClean}` : undefined,
    filters: filters.join(' AND ') || undefined,
    fields: 'CERT,NAME,CITYST,PSTALP,FAILDATE,FAILYR,SAVR,RESTYPE,QBFASSET,QBFDEP,COST,FIN,CHCLASS',
    sort_by: 'FAILDATE',
    sort_order: 'DESC',
    limit,
  }, 1800);

  const rows = (env.data ?? []).map((r) => r.data);
  const failures = rows.map((d) => ({
    cert: d.CERT ? Number(d.CERT) : null,
    name: d.NAME ?? null,
    city_state: d.CITYST ?? null,
    state: d.PSTALP ?? null,
    fail_date: d.FAILDATE ?? null,
    fail_year: d.FAILYR ? Number(d.FAILYR) : null,
    resolution_type: d.RESTYPE ?? null,
    insurance_fund: d.SAVR ?? null,
    charter_class: d.CHCLASS ?? null,
    assets_at_failure_usd: formatThousandsUsd(d.QBFASSET),
    deposits_at_failure_usd: formatThousandsUsd(d.QBFDEP),
    estimated_dif_cost_usd: formatThousandsUsd(d.COST),
    fund_id: d.FIN ?? null,
  }));

  const total = env.meta?.total ?? failures.length;
  const top = failures[0];
  const summary = failures.length === 0
    ? 'No FDIC bank failures matched those filters.'
    : `Found ${total} FDIC bank failure record(s) (showing ${failures.length}, newest first). Most recent match: ${top.name} (${top.city_state}), failed ${top.fail_date}, assets ${top.assets_at_failure_usd ?? 'N/A'}, deposits ${top.deposits_at_failure_usd ?? 'N/A'}, est. DIF cost ${top.estimated_dif_cost_usd ?? 'N/A'}.`;

  return {
    summary,
    total_matches: total,
    returned: failures.length,
    failures,
    as_of: env.meta?.index?.createTimestamp ?? new Date().toISOString(),
    source: 'FDIC BankFind Suite API — Failures (api.fdic.gov/banks/failures)',
    more: `${SITE}/free-servers/?${UTM}`,
  };
}

export async function searchBankBranches(fetchText: FetchText, args: {
  cert?: string | number;
  name?: string;
  zip?: string | number;
  city?: string;
  state?: string;
  limit?: number;
}) {
  const st = normalizeState(args.state);
  const nameClean = args.name ? sanitizeTerm(args.name) : '';
  const cityClean = args.city ? sanitizeTerm(args.city) : '';
  const zipClean = args.zip !== undefined ? String(args.zip).trim().replace(/[^0-9]/g, '') : '';
  const certClean = args.cert !== undefined ? String(args.cert).trim().replace(/[^0-9]/g, '') : '';

  if (!certClean && !nameClean && !zipClean && !cityClean && !st) {
    throw new InputError('Provide at least one filter: cert, name, zip, city, or state.');
  }

  const filters: string[] = [];
  if (certClean) filters.push(`CERT:${certClean}`);
  if (zipClean) filters.push(`ZIP:${zipClean}`);
  if (cityClean) filters.push(`CITY:"${cityClean}"`);
  if (st) filters.push(`STALP:${st}`);

  const limit = Math.min(50, Math.max(1, args.limit ?? 15));
  const env = await fdicGet(fetchText, 'locations', {
    search: nameClean ? `NAME:${nameClean}` : undefined,
    filters: filters.join(' AND ') || undefined,
    fields: 'CERT,NAME,OFFNAME,ADDRESS,CITY,STALP,ZIP,COUNTY,MAINOFF,SERVTYPE,LATITUDE,LONGITUDE',
    limit,
  }, 3600);

  const rows = (env.data ?? []).map((r) => r.data);
  const branches = rows.map((d) => ({
    cert: d.CERT ? Number(d.CERT) : null,
    bank_name: d.NAME ?? null,
    branch_name: d.OFFNAME ?? null,
    main_office: Number(d.MAINOFF) === 1,
    address: d.ADDRESS ?? null,
    city: d.CITY ?? null,
    state: d.STALP ?? null,
    zip: d.ZIP ?? null,
    county: d.COUNTY ?? null,
    service_type_code: d.SERVTYPE ?? null,
    latitude: d.LATITUDE ?? null,
    longitude: d.LONGITUDE ?? null,
  }));

  const total = env.meta?.total ?? branches.length;
  const top = branches[0];
  const summary = branches.length === 0
    ? 'No FDIC-insured bank branches matched those filters.'
    : `Found ${total} FDIC-insured bank branch(es) (showing ${branches.length}). First result: ${top.bank_name} — ${top.branch_name} (${top.address}, ${top.city}, ${top.state} ${top.zip}).`;

  return {
    summary,
    total_matches: total,
    returned: branches.length,
    branches,
    as_of: env.meta?.index?.createTimestamp ?? new Date().toISOString(),
    source: 'FDIC BankFind Suite API — Locations (api.fdic.gov/banks/locations)',
    more: `${SITE}/free-servers/?${UTM}`,
  };
}
