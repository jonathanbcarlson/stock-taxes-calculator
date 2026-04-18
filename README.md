# ESPP Tax Calculator

A mobile-friendly, single-page calculator for estimating taxes on Employee Stock Purchase Plan (ESPP) shares.

**Live:** https://www.jonathanbcarlson.com/stock-taxes-calculator/

## Features

- Shows all three disposition scenarios simultaneously:
  - **Disqualifying — Short-Term** (held < 1 year from purchase)
  - **Disqualifying — Long-Term** (held ≥ 1 year but before qualifying date)
  - **Qualifying Disposition** (held ≥ 1 year from purchase AND ≥ 2 years from offering/grant date)
- Highlights your current scenario based on entered dates
- **Direct purchase price input** — enter the price per share from your ESPP confirmation; no need to know your plan's discount % or lookback details
- Auto-detects your marginal ordinary income and LTCG rates from 2026 IRS brackets (One Big Beautiful Bill Act) based on filing status and gross salary
- Expandable "How is this calculated?" formula breakdowns per IRS Publication 525
- "When to sell" guidance that accounts for the unusual case where qualifying disposition is *worse* (when the stock fell from offering to purchase date)

## Tax rules applied

- **Qualifying ordinary income (IRC §423(c)):** `min(offeringFMV − pricePaid, salePrice − pricePaid)` — uses offering/grant date FMV, not the lower of the two
- **Disqualifying ordinary income:** `purchaseFMV − pricePaid` (bargain element at purchase)
- **Capital gain basis:** adjusted basis = `pricePaid + ordinaryIncome/share`
- 2026 federal brackets only; does not include state taxes, AMT, or NIIT

## Deployment

Hosted on GitHub Pages from the `main` branch root. No build step — `index.html` is the entire app.

## Disclaimer

For educational purposes only. Not tax advice. Consult a qualified CPA or tax advisor for your specific situation.
