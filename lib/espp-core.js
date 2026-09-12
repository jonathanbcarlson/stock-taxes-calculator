// ── 2026 Tax Brackets (One Big Beautiful Bill Act / IRS Rev. Proc.) ──
// Source: Tax Foundation, IRS Rev. Proc. 2025-xx; taxfoundation.org/data/all/federal/2026-tax-brackets/
const BRACKETS_2026 = {
  single: [[12400,0.10],[50400,0.12],[105700,0.22],[201775,0.24],[256225,0.32],[640600,0.35],[Infinity,0.37]],
  mfj:    [[24800,0.10],[100800,0.12],[211400,0.22],[403550,0.24],[512450,0.32],[768700,0.35],[Infinity,0.37]],
};
const STD_DEDUCTION_2026 = { single: 16100, mfj: 32200 };
// LTCG thresholds are on TAXABLE income (after deductions)
// 0% up to threshold[0], 15% up to threshold[1], 20% above
const LTCG_2026 = {
  single: [49450, 545500],
  mfj:    [98900, 613700],
};

function getTaxableIncome(gross, status) {
  return Math.max(0, gross - STD_DEDUCTION_2026[status]);
}

function getMarginalRate(taxable, status) {
  for (const [cap, rate] of BRACKETS_2026[status]) {
    if (taxable <= cap) return rate;
  }
  return 0.37;
}

function getLTCGRate(taxable, status) {
  const [t0, t15] = LTCG_2026[status];
  return taxable <= t0 ? 0.00 : taxable <= t15 ? 0.15 : 0.20;
}

// The plan's purchase discount. IRC §423(c)(1) caps qualifying ordinary income at
// this rate applied to the GRANT date FMV, so the rate matters even though the app
// takes the purchase price directly. 15% is the statutory maximum and by far the
// most common plan design; override per-call for a plan with a smaller discount.
const ESPP_DISCOUNT_RATE = 0.15;

// Compute one scenario's numbers given tax rates for the capital gain.
// IRS Pub 525 / IRC §423(c) governs qualifying disposition ordinary income.
function calcScenario(params) {
  const { offeringFMV, purchaseFMV, pricePaid, numShares, salePricePS,
          ordRate, cgRate, isQualifying, discountRate = ESPP_DISCOUNT_RATE } = params;

  const grossProceeds  = salePricePS * numShares;
  const totalCostBasis = pricePaid * numShares;

  let ordinaryIncome, capitalGain;

  if (isQualifying) {
    // IRS Pub 525 / IRC §423(c): lesser of
    //   (1) discountRate × offeringFMV  (the discount measured at the GRANT date —
    //       i.e. grant FMV minus the price you would have paid had you exercised then)
    //   (2) salePrice − pricePaid       (actual total gain)
    // (1) is NOT offeringFMV − pricePaid. The two coincide only when the stock rose
    // from grant to purchase, since pricePaid is then struck off the grant FMV. When
    // the stock FELL, pricePaid is struck off the lower purchase FMV, and the
    // grant-date cap is the smaller — and more favorable — of the two.
    const grantDiscountPS = discountRate * offeringFMV;
    const actualGainPS    = salePricePS - pricePaid;
    const ordIncPS        = Math.max(0, Math.min(grantDiscountPS, actualGainPS));
    ordinaryIncome        = ordIncPS * numShares;
    const adjBasisPS      = pricePaid + ordIncPS;  // ordinary income is never taxed twice
    capitalGain           = (salePricePS - adjBasisPS) * numShares;
  } else {
    ordinaryIncome = (purchaseFMV - pricePaid) * numShares;
    capitalGain    = (salePricePS  - purchaseFMV) * numShares;
  }

  const ordTax     = ordinaryIncome * ordRate;
  const cgTax      = capitalGain > 0 ? capitalGain * cgRate : 0;
  const totalTax   = ordTax + cgTax;
  const netProceeds = grossProceeds - totalTax;
  const effRate    = grossProceeds > 0 ? totalTax / grossProceeds * 100 : 0;

  return { grossProceeds, totalCostBasis, ordinaryIncome, ordTax, capitalGain, cgTax, totalTax, netProceeds, effRate };
}

// Node.js export — when loaded as a <script> in the browser these become globals.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BRACKETS_2026, STD_DEDUCTION_2026, LTCG_2026, ESPP_DISCOUNT_RATE,
    getTaxableIncome, getMarginalRate, getLTCGRate, calcScenario,
  };
}
