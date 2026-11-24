# fdic-bank-health-financials-mcp

FDIC bank health, Call Report financials, failed bank records, and branch lookup for AI assistants. Verify whether any US bank is actively FDIC-insured, inspect quarterly Call Report balance sheets and capital ratios (assets, deposits, insured vs. uninsured deposits, CET1, Tier 1 risk-based capital, ROA, ROE, net interest margin, efficiency ratio, noncurrent loans), search the official FDIC Failed Bank List from 1934 to today, and locate insured bank branches.

This Model Context Protocol (MCP) server reads the official [FDIC BankFind Suite API](https://banks.data.fdic.gov/docs/) (`https://api.fdic.gov/banks/`) live at call time. Free hosted endpoint, no API key required.

## Tools

| Tool | What it returns |
| --- | --- |
| `fdic_bank_search` | Search FDIC-insured US banks by name, state, city, ZIP, or CERT number. Returns active insurance status, CERT number, headquarters, charter class, assets, deposits, equity, net income, ROA, ROE, offices, and website. |
| `fdic_bank_financials` | Quarterly Call Report financial health for a bank by CERT or name: assets, total/domestic/insured/uninsured deposits and uninsured share %, equity, Tier 1 capital, CET1 and Tier 1 risk-based capital ratios, YTD net income, ROA, ROE, NIM, efficiency ratio, and noncurrent loans % over up to 12 quarters. |
| `fdic_failed_banks` | Search the official FDIC Failed Bank List (1934 to present) by bank name, state, or year range, or view the latest US bank failures with assets, deposits, and estimated Deposit Insurance Fund (DIF) cost. |
| `fdic_bank_branches` | Find physical FDIC-insured bank branches by CERT, bank name, ZIP, city, or state with street address, county, main-office flag, and coordinates. |

Every tool is read-only and returns structured JSON plus a concise plain-text summary.

## Install

### Free Hosted Endpoint (Claude, ChatGPT developer mode, any remote MCP client)

Paste this URL. No API key, no sign-up:

```
https://fdic-bank-health-financials-mcp.lipmichal.workers.dev/mcp
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "fdic-bank-health": {
      "url": "https://fdic-bank-health-financials-mcp.lipmichal.workers.dev/mcp"
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "fdic-bank-health": {
      "type": "http",
      "url": "https://fdic-bank-health-financials-mcp.lipmichal.workers.dev/mcp"
    }
  }
}
```

### Local stdio

```bash
git clone https://github.com/theluckystrike/fdic-bank-health-financials-mcp
cd fdic-bank-health-financials-mcp
npm install && npm run build
node dist/stdio.js
```

## Example prompts

- "Is JPMorgan Chase Bank actively FDIC-insured, and what are its latest CET1 ratio and uninsured deposit percentage?"
- "Which US banks have failed in 2026, and how much did each cost the FDIC Deposit Insurance Fund?"
- "Compare the last 4 quarters of Call Report financials for FDIC CERT 628."
- "Find FDIC-insured Chase branches in ZIP code 10017."

## Upgrade and Commercial Services

- **Zovo Pro MCP Bundle ($39 lifetime):** Unlock the full commercial MCP server collection at [mcp.zovo.one/bundle](https://mcp.zovo.one/bundle?src=sat.fdic-bank-health-financials-mcp).
- **Custom MCP Audit and Build Services:** Need a custom internal MCP server, fintech compliance integration, or security audit? See [mcpstamp.com/services](https://www.mcpstamp.com/services/?src=sat.fdic-bank-health-financials-mcp).
- **More Free MCP Servers:** Browse the full directory at [mcpstamp.com/free-servers](https://www.mcpstamp.com/free-servers/?utm_source=mcp&utm_medium=fdic-bank-health-financials-mcp).

## Data Sources

See [DATA_SOURCES.md](DATA_SOURCES.md). All data comes directly from the official public FDIC BankFind Suite API (`https://api.fdic.gov/banks/`).

## License

MIT
