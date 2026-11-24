# Data Sources

All data served by `fdic-bank-health-financials-mcp` is read live at call time from the official public FDIC BankFind Suite API (no API key required):

- **Institutions** (`https://api.fdic.gov/banks/institutions`): Active and inactive FDIC-insured financial institutions, charter classes, headquarters, and latest headline balance sheet figures.
- **Financials / Call Reports** (`https://api.fdic.gov/banks/financials`): Quarterly FFIEC Call Report filings (RIS view), including assets, total/domestic/insured/uninsured deposits, equity capital, Tier 1 capital, CET1 and Tier 1 risk-based capital ratios, net income (YTD), ROA, ROE, net interest margin, efficiency ratio, and noncurrent loans percentage. Dollar amounts in the upstream API are reported in thousands.
- **Failures** (`https://api.fdic.gov/banks/failures`): Official FDIC Failed Bank List from 1934 to the present, including failure date, resolution type, assets and deposits at failure, and estimated Deposit Insurance Fund (DIF) cost.
- **Locations** (`https://api.fdic.gov/banks/locations`): Physical branch offices of FDIC-insured banks with street addresses, counties, main-office flags, service type codes, and latitude/longitude coordinates.
