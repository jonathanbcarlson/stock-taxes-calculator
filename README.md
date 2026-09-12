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
- "When to sell" guidance that accounts for the unusual case where a qualifying disposition is *worse* (stock fell between the offering and purchase dates, then recovered)

## Tax rules applied

- **Qualifying ordinary income (IRC §423(c)):** `min(salePrice − pricePaid, 15% × offeringFMV)` — the cap is the plan discount measured at the **offering/grant date**, not `offeringFMV − pricePaid`
- **Disqualifying ordinary income:** `purchaseFMV − pricePaid` (bargain element at purchase)
- **Capital gain basis:** adjusted basis = `pricePaid + ordinaryIncome/share`
- Assumes the standard **15% plan discount** (the statutory maximum). `calcScenario` takes a `discountRate` override for plans that discount less
- 2026 federal brackets only; does not include state taxes, AMT, or NIIT

### Why a qualifying disposition can be *worse*

The §423(c) cap is measured against the grant-date FMV, which is what makes it generous
when the stock **falls** between the offering and purchase dates — it lets you recoup part
of the drop. It stops helping once the stock recovers.

If the stock fell from grant to purchase, the price you paid was struck off the lower
purchase FMV, so the discount you were actually taxed on at purchase is smaller than the
grant-date cap. Sell above the purchase-date FMV and a qualifying disposition reports the
*larger* grant-date figure as ordinary income instead. The gap is bounded at
`15% × (offeringFMV − purchaseFMV)` per share, so the penalty is real but small — and in
that case long-term disqualifying is the better outcome, which the calculator says outright.

## Deployment

Hosted on GitHub Pages from the `main` branch root. No build step — `index.html` is the entire app.

## Disclaimer

For educational purposes only. Not tax advice. Consult a qualified CPA or tax advisor for your specific situation.
