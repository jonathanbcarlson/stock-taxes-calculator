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

// Compute one scenario's numbers given tax rates for the capital gain.
// IRS Pub 525 / IRC §423(c) governs qualifying disposition ordinary income.
function calcScenario(params) {
  const { offeringFMV, purchaseFMV, pricePaid, numShares, salePricePS,
          ordRate, cgRate, isQualifying } = params;

  const grossProceeds  = salePricePS * numShares;
  const totalCostBasis = pricePaid * numShares;

  let ordinaryIncome, capitalGain;

  if (isQualifying) {
    // IRS Pub 525 / IRC §423(c): lesser of
    //   (1) offeringFMV − pricePaid  (spread from grant date FMV to what you paid)
    //   (2) salePrice − pricePaid    (actual total gain)
    const discountPS   = offeringFMV - pricePaid;
    const actualGainPS = salePricePS - pricePaid;
    const ordIncPS     = Math.max(0, Math.min(discountPS, actualGainPS));
    ordinaryIncome     = ordIncPS * numShares;
    const adjBasisPS   = pricePaid + ordIncPS;  // equals offeringFMV when salePrice ≥ offeringFMV
    capitalGain        = (salePricePS - adjBasisPS) * numShares;
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
    BRACKETS_2026, STD_DEDUCTION_2026, LTCG_2026,
    getTaxableIncome, getMarginalRate, getLTCGRate, calcScenario,
  };
}
