# BestInvestment

Static web app for deciding where to put your next dollar: mortgage prepayment vs ETFs/metals with conservative, moderate, and aggressive projections.

## What it includes

- Mortgage input flow:
  - Current balance
  - APR
  - Tax-adjusted mortgage comparison inputs:
    - Whether mortgage interest is deductible
    - Marginal tax rate
    - Estimated deductible share of interest
  - Optional PMI modeling:
    - Monthly PMI (default 0, user-updated if applicable)
  - Months left, or estimate from start date + original term
- Investment options:
  - Common ETFs: `VTI`, `VOO`, `QQQ`, `VXUS`, `BND`, `SCHD`, `VNQ`
  - Metals: `GLD` (gold), `SLV` (silver)
- Scenario engine:
  - Conservative / Moderate / Aggressive projection rates
  - Baseline uses 50-year annualized averages (highlighted in UI)
  - Optional dividend handling toggle (included/reinvested by default)
  - Baseline series are total return (dividends included); turning dividends off applies an approximate yield subtraction
  - After-tax investment comparison using assumed long-term capital gains tax rate
  - Qualified dividend tax, state tax, optional liquidation-at-horizon tax, and inflation-adjusted outputs
- Relevance checks:
  - Emergency fund
  - High-interest debt
  - Employer match status
- Reporting/sharing:
  - Detailed scenario breakdown table
  - Scenario tabs (Conservative / Moderate / Aggressive) to reduce result clutter
  - `Export PDF` (generated detailed report PDF with tables/assumptions)
  - Shareable deep link with current inputs

## Estimation methodology (precision upgrades)

- Mortgage side:
  - Uses a monthly amortization simulation, not simple APR compounding.
  - Compares baseline mortgage cash flows vs \"extra principal now\" cash flows.
  - Includes optional mortgage-interest tax shield and PMI timing effects.
  - Converts resulting cash-flow savings into an annualized mortgage-equivalent return via IRR.
- Investment side:
  - Uses scenario annual returns + dividend yield split.
  - Applies qualified-dividend tax during the holding period.
  - Applies long-term capital gains tax at horizon when liquidation is enabled.
  - Shows both nominal after-tax and inflation-adjusted (real) after-tax projections.
- SEO + monetization files:
  - `robots.txt`, `sitemap.xml`, canonical + OpenGraph metadata
  - `ads.txt`
  - Google Analytics + AdSense script placeholders

## Run locally

Open `index.html` in a local server (recommended):

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

1. Push to `main`.
2. In GitHub repo settings:
   - `Pages` -> `Build and deployment` -> `Source: GitHub Actions`.
3. Workflow `.github/workflows/deploy-pages.yml` deploys the site automatically.

## Configure for indexing + ads

Update these files with your real values:

1. `index.html`
   - Replace `YOUR_USERNAME` in canonical/OG URLs.
   - Replace GA ID `G-XXXXXXXXXX`.
   - Replace AdSense publisher ID `ca-pub-XXXXXXXXXXXXXXXX`.
2. `robots.txt`
   - Replace sitemap URL with your real site URL.
3. `sitemap.xml`
   - Replace `loc` URL and keep `lastmod` current.
4. `ads.txt`
   - Replace publisher ID `pub-XXXXXXXXXXXXXXXX`.

After deployment:

1. Add site to Google Search Console.
2. Submit `https://<your-site>/sitemap.xml`.
3. In Search Console, request indexing for the home page.
4. In AdSense, add the site and verify ownership.

## Online return data refresh

- `scripts/fetch_returns.py` pulls Damodaran historical annual returns, computes a rolling 50-year annualized baseline, then scales conservative/moderate/aggressive using Schwab allocation profiles.
- Workflow `.github/workflows/refresh-data.yml` runs weekly (Monday) and commits refreshed data.

Primary sources:

- Damodaran annual returns table: `https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html`
- Schwab allocation profile reference: `https://www.schwabmoneywise.com/investment-planning/what-is-asset-allocation`
- IRS Topic 409 (capital gains): `https://www.irs.gov/taxtopics/tc409`
- IRS Publication 550 (investment income/tax rules): `https://www.irs.gov/publications/p550`
- IRS Publication 936 (mortgage interest deduction): `https://www.irs.gov/publications/p936`

Note: many ETFs do not have full 50-year live histories, so the app maps each ETF to a long-history proxy series and labels that proxy in the dataset.

Manual refresh:

```bash
pip install -r requirements.txt
python scripts/fetch_returns.py
```
