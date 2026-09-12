'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  STD_DEDUCTION_2026, ESPP_DISCOUNT_RATE,
  getTaxableIncome, getMarginalRate, getLTCGRate, calcScenario,
} = require('../lib/espp-core.js');

// Dollar-level tolerance for floating-point comparisons
const approx = (actual, expected, msg, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: expected ${expected}, got ${actual}`);


// ── getTaxableIncome ──────────────────────────────────────────────────────────

describe('getTaxableIncome', () => {
  it('single — subtracts $16,100 standard deduction', () => {
    assert.strictEqual(getTaxableIncome(100_000, 'single'), 83_900);
  });
  it('single — floors at zero when gross is below standard deduction', () => {
    assert.strictEqual(getTaxableIncome(10_000, 'single'), 0);
  });
  it('single — returns zero when gross equals standard deduction exactly', () => {
    assert.strictEqual(getTaxableIncome(STD_DEDUCTION_2026.single, 'single'), 0);
  });
  it('mfj — subtracts $32,200 standard deduction', () => {
    assert.strictEqual(getTaxableIncome(200_000, 'mfj'), 167_800);
  });
  it('mfj — floors at zero when gross is below standard deduction', () => {
    assert.strictEqual(getTaxableIncome(30_000, 'mfj'), 0);
  });
});


// ── getMarginalRate ───────────────────────────────────────────────────────────
// 2026 single brackets: ≤12400→10% ≤50400→12% ≤105700→22% ≤201775→24%
//                       ≤256225→32% ≤640600→35% else→37%

describe('getMarginalRate — single filer 2026', () => {
  const cases = [
    [0,       0.10, '10% bracket floor'],
    [12_400,  0.10, '10% bracket cap'],
    [12_401,  0.12, '12% bracket start'],
    [50_400,  0.12, '12% bracket cap'],
    [80_000,  0.22, '22% bracket mid'],
    [105_700, 0.22, '22% bracket cap'],
    [150_000, 0.24, '24% bracket mid'],
    [201_775, 0.24, '24% bracket cap'],
    [220_000, 0.32, '32% bracket mid'],
    [256_225, 0.32, '32% bracket cap'],
    [300_000, 0.35, '35% bracket mid'],
    [640_600, 0.35, '35% bracket cap'],
    [700_000, 0.37, '37% bracket (top)'],
  ];
  for (const [taxable, rate, label] of cases) {
    it(`$${taxable.toLocaleString()} — ${label}`, () => {
      assert.strictEqual(getMarginalRate(taxable, 'single'), rate);
    });
  }
});

// 2026 mfj brackets: ≤24800→10% ≤100800→12% ≤211400→22% ≤403550→24%
//                    ≤512450→32% ≤768700→35% else→37%

describe('getMarginalRate — married filing jointly 2026', () => {
  const cases = [
    [24_800,  0.10, '10% bracket cap'],
    [80_000,  0.12, '12% bracket mid'],
    [100_800, 0.12, '12% bracket cap'],
    [150_000, 0.22, '22% bracket mid'],
    [300_000, 0.24, '24% bracket mid'],
    [500_000, 0.32, '32% bracket mid'],
    [800_000, 0.37, '37% bracket (top)'],
  ];
  for (const [taxable, rate, label] of cases) {
    it(`$${taxable.toLocaleString()} — ${label}`, () => {
      assert.strictEqual(getMarginalRate(taxable, 'mfj'), rate);
    });
  }
});


// ── getLTCGRate ───────────────────────────────────────────────────────────────
// Single 2026: ≤$49,450 → 0%  ≤$545,500 → 15%  else → 20%
// MFJ 2026:   ≤$98,900 → 0%  ≤$613,700 → 15%  else → 20%

describe('getLTCGRate — single filer 2026', () => {
  it('below 0% threshold → 0%',           () => assert.strictEqual(getLTCGRate(40_000,  'single'), 0.00));
  it('at 0% threshold ($49,450) → 0%',    () => assert.strictEqual(getLTCGRate(49_450,  'single'), 0.00));
  it('just above 0% threshold → 15%',     () => assert.strictEqual(getLTCGRate(49_451,  'single'), 0.15));
  it('mid-range → 15%',                   () => assert.strictEqual(getLTCGRate(200_000, 'single'), 0.15));
  it('at 15% threshold ($545,500) → 15%', () => assert.strictEqual(getLTCGRate(545_500, 'single'), 0.15));
  it('above 15% threshold → 20%',         () => assert.strictEqual(getLTCGRate(545_501, 'single'), 0.20));
  it('well above threshold → 20%',        () => assert.strictEqual(getLTCGRate(700_000, 'single'), 0.20));
});

describe('getLTCGRate — married filing jointly 2026', () => {
  it('below 0% threshold → 0%',           () => assert.strictEqual(getLTCGRate(90_000,  'mfj'), 0.00));
  it('at 0% threshold ($98,900) → 0%',    () => assert.strictEqual(getLTCGRate(98_900,  'mfj'), 0.00));
  it('just above 0% threshold → 15%',     () => assert.strictEqual(getLTCGRate(98_901,  'mfj'), 0.15));
  it('at 15% threshold ($613,700) → 15%', () => assert.strictEqual(getLTCGRate(613_700, 'mfj'), 0.15));
  it('above 15% threshold → 20%',         () => assert.strictEqual(getLTCGRate(613_701, 'mfj'), 0.20));
});


// ── calcScenario — Qualifying Dispositions ───────────────────────────────────
//
// IRC §423(c): ordinary income = min(salePrice − pricePaid, discountRate × offeringFMV)
// The cap is the discount measured at the GRANT date — discountRate defaults to the
// standard 15%. Adjusted basis per share = pricePaid + ordIncPS
// Capital gain = (salePrice − adjBasis) × shares  [always LTCG]

describe('calcScenario — qualifying: stock rose from offering to purchase date (TurboTax / The Finance Buff)', () => {
  // Source: thefinancebuff.com/adjust-cost-basis-for-espp-sale-in-turbotax.html
  //   offeringFMV=$100  purchaseFMV=$110  pricePaid=$85  100 shares  sale=$150
  //   discountPS = $100−$85 = $15  actualGainPS = $150−$85 = $65
  //   ordIncPS   = min($15, $65) = $15  →  adjBasis = $100
  //   capitalGain = ($150−$100) × 100 = $5,000
  const r = calcScenario({
    offeringFMV: 100, purchaseFMV: 110, pricePaid: 85,
    numShares: 100,   salePricePS: 150,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  });

  it('grossProceeds',                                 () => assert.strictEqual(r.grossProceeds,  15_000));
  it('totalCostBasis',                                () => assert.strictEqual(r.totalCostBasis,  8_500));
  it('ordinaryIncome — capped at offering discount',  () => assert.strictEqual(r.ordinaryIncome,  1_500));
  it('ordTax — 22% of $1,500',                        () => assert.strictEqual(r.ordTax,            330));
  it('capitalGain — sale minus adjusted basis',       () => assert.strictEqual(r.capitalGain,     5_000));
  it('cgTax — 15% of $5,000',                         () => assert.strictEqual(r.cgTax,             750));
  it('totalTax',                                      () => assert.strictEqual(r.totalTax,         1_080));
  it('netProceeds',                                   () => assert.strictEqual(r.netProceeds,     13_920));
  it('effRate — 7.2%',                                () => approx(r.effRate, 7.2, 'effRate'));
});

describe('calcScenario — qualifying: stock flat from offering to purchase (Morgan Stanley)', () => {
  // Source: morganstanley.com/atwork qualifying-disposition-espp
  //   offeringFMV=$20  purchaseFMV=$20  pricePaid=$17  100 shares  sale=$30
  //   ordIncPS = min($3, $13) = $3  →  adjBasis = $20 = offeringFMV
  //   capitalGain = ($30−$20) × 100 = $1,000
  const r = calcScenario({
    offeringFMV: 20, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 30,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  });

  it('ordinaryIncome — $3 × 100',                    () => assert.strictEqual(r.ordinaryIncome,   300));
  it('ordTax — 22% of $300',                         () => assert.strictEqual(r.ordTax,            66));
  it('capitalGain — $10 × 100',                      () => assert.strictEqual(r.capitalGain,    1_000));
  it('cgTax — 15% of $1,000',                        () => assert.strictEqual(r.cgTax,            150));
  it('totalTax',                                     () => assert.strictEqual(r.totalTax,          216));
  it('netProceeds',                                  () => assert.strictEqual(r.netProceeds,     2_784));
  it('effRate — 7.2%',                               () => approx(r.effRate, 7.2, 'effRate'));
});

describe('calcScenario — qualifying: 10%-discount plan, stock rose (NASPP)', () => {
  // Source: naspp.com/blog/disqualifying-vs-qualifying-espps
  // This plan discounts 10%, not 15% ($36 paid = 90% of the $40 grant FMV), so the
  // §423(c) cap is 10% × $40. Exercises the discountRate override.
  //   offeringFMV=$40  purchaseFMV=$45  pricePaid=$36  100 shares  sale=$60
  //   grantDiscountPS = 10% × $40 = $4   actualGainPS = $24
  //   ordIncPS = min($4, $24) = $4  →  adjBasis = $36+$4 = $40 = offeringFMV
  //   capitalGain = ($60−$40) × 100 = $2,000
  const r = calcScenario({
    offeringFMV: 40, purchaseFMV: 45, pricePaid: 36,
    numShares: 100,  salePricePS: 60,
    ordRate: 0.30, cgRate: 0.15, isQualifying: true, discountRate: 0.10,
  });

  it('ordinaryIncome — offering discount $4 × 100', () => assert.strictEqual(r.ordinaryIncome,    400));
  it('ordTax — 30% of $400',                        () => assert.strictEqual(r.ordTax,             120));
  it('capitalGain — sale minus offeringFMV',        () => assert.strictEqual(r.capitalGain,      2_000));
  it('cgTax — 15% of $2,000',                       () => assert.strictEqual(r.cgTax,              300));
  it('totalTax',                                    () => assert.strictEqual(r.totalTax,            420));
  it('netProceeds',                                 () => assert.strictEqual(r.netProceeds,       5_580));
  it('effRate — 7%',                                () => approx(r.effRate, 7, 'effRate'));
});

describe('calcScenario — qualifying: OI capped at actual gain when the gain is the smaller leg', () => {
  // §423(c): OI = min(actualGain, grantDiscount); here the $15 grant-date discount
  // is capped down to the $5 actual gain.
  //   offeringFMV=$100  purchaseFMV=$90  pricePaid=$85  10 shares  sale=$90
  //   grantDiscountPS = 15% × $100 = $15   actualGainPS = $5  →  ordIncPS = $5 (capped)
  //   adjBasis = $85+$5 = $90  capitalGain = $0
  const r = calcScenario({
    offeringFMV: 100, purchaseFMV: 90, pricePaid: 85,
    numShares: 10,    salePricePS: 90,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  });

  it('ordinaryIncome — capped at $5 × 10, not the full $15 × 10', () => assert.strictEqual(r.ordinaryIncome, 50));
  it('capitalGain — zero (adjBasis = salePrice)',                  () => assert.strictEqual(r.capitalGain,     0));
  it('cgTax — zero',                                               () => assert.strictEqual(r.cgTax,           0));
  it('ordTax — 22% of $50',                                        () => assert.strictEqual(r.ordTax,         11));
  it('totalTax',                                                   () => assert.strictEqual(r.totalTax,       11));
  it('netProceeds',                                                () => assert.strictEqual(r.netProceeds,   889));
  it('effRate ≈ 1.22%',                                            () => approx(r.effRate, 1100 / 900, 'effRate'));
});

describe('calcScenario — qualifying: sale below cost basis → zero OI and capital loss (CAM Investor)', () => {
  // Source: caminvestor.com/can-i-lose-money-in-my-espp-company-stock
  //   offeringFMV=$20  purchaseFMV=$10  pricePaid=$8.50  100 shares  sale=$5
  //   grantDiscountPS = 15% × $20 = $3
  //   actualGainPS = $5−$8.50 = −$3.50  →  ordIncPS = max(0, −$3.50) = $0
  //   capitalGain = ($5−$8.50) × 100 = −$350
  const r = calcScenario({
    offeringFMV: 20, purchaseFMV: 10, pricePaid: 8.50,
    numShares: 100,  salePricePS: 5,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  });

  it('ordinaryIncome — zero when salePrice < pricePaid', () => assert.strictEqual(r.ordinaryIncome,    0));
  it('capitalGain — loss of $3.50 × 100',                () => assert.strictEqual(r.capitalGain,    -350));
  it('ordTax — zero',                                    () => assert.strictEqual(r.ordTax,             0));
  it('cgTax — zero (losses are not taxed)',              () => assert.strictEqual(r.cgTax,              0));
  it('totalTax — zero',                                  () => assert.strictEqual(r.totalTax,           0));
  it('netProceeds — equals grossProceeds',               () => assert.strictEqual(r.netProceeds,      500));
  it('effRate — 0%',                                     () => assert.strictEqual(r.effRate,             0));
});


// ── calcScenario — the grant-date cap when the stock FELL before purchase ─────
//
// A 15% lookback plan: grant FMV $30, stock fell to $20 by the purchase date, so the
// price paid is 85% of the LOWER purchase FMV = $17. The §423(c) cap is measured off
// the GRANT FMV (15% × $30 = $4.50), NOT offeringFMV − pricePaid ($30 − $17 = $13).
//
// The cap exists to let you recoup part of the drop while the stock stays down. Once
// the stock recovers past the purchase FMV it stops helping: the $4.50 grant-date cap
// then exceeds the $3.00 discount actually received at purchase, so a qualifying sale
// reports MORE ordinary income than a disqualifying one. The gap is bounded at
// 15% × (grantFMV − purchaseFMV) = $1.50/share, which is why the penalty stays small.

describe('calcScenario — qualifying: stock fell then recovered (qualifying costs slightly more)', () => {
  //   offeringFMV=$30  purchaseFMV=$20  pricePaid=$17  100 shares  sale=$25
  //   grantDiscountPS = 15% × $30 = $4.50   actualGainPS = $25−$17 = $8
  //   ordIncPS = min($8, $4.50) = $4.50  →  adjBasis = $21.50
  //   capitalGain = ($25−$21.50) × 100 = $350
  const r = calcScenario({
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 25,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  });

  it('ordinaryIncome — grant-date cap $4.50 × 100',   () => assert.strictEqual(r.ordinaryIncome,   450));
  it('ordinaryIncome — NOT the old $13 spread × 100', () => assert.notStrictEqual(r.ordinaryIncome, 1_300));
  it('capitalGain — sale minus adjusted basis',       () => assert.strictEqual(r.capitalGain,      350));
  it('ordTax — 22% of $450',                          () => approx(r.ordTax,                        99, 'ordTax'));
  it('cgTax — 15% of $350',                           () => approx(r.cgTax,                       52.5, 'cgTax'));
  it('totalTax',                                      () => approx(r.totalTax,                   151.5, 'totalTax'));
  it('netProceeds',                                   () => approx(r.netProceeds,               2_348.5, 'netProceeds'));

  // The same shares sold as a long-term disqualifying disposition (fixture below):
  // ordinary income is only the $3 purchase-date bargain, for $141 of total tax.
  const ltd = calcScenario({
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 25,
    ordRate: 0.22, cgRate: 0.15, isQualifying: false,
  });

  it('reports more ordinary income than long-term disqualifying', () => {
    assert.ok(r.ordinaryIncome > ltd.ordinaryIncome,
      `qualifying OI ${r.ordinaryIncome} should exceed disqualifying OI ${ltd.ordinaryIncome}`);
  });
  it('costs more tax than long-term disqualifying — by $10.50', () => {
    approx(r.totalTax - ltd.totalTax, 10.5, 'qualifying penalty');
  });
});

describe('calcScenario — qualifying: grant-date cap holds no matter how far the stock runs', () => {
  // Same $30 → $20 drop, but sold at $40 — well above the grant FMV. The old
  // offeringFMV − pricePaid formula would have reported $13 × 100 = $1,300 of
  // ordinary income; the cap keeps it at $4.50 × 100 and sends the rest to LTCG.
  const r = calcScenario({
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 40,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  });

  it('ordinaryIncome — still capped at $4.50 × 100', () => assert.strictEqual(r.ordinaryIncome,   450));
  it('capitalGain — the rest of the gain',           () => assert.strictEqual(r.capitalGain,    1_850));
  it('totalTax',                                     () => approx(r.totalTax,                   376.5, 'totalTax'));
});

describe('calcScenario — qualifying: stock fell and stayed down (qualifying still wins)', () => {
  // Same $30 → $20 drop, sold at $19 — below the purchase FMV, so the cap is doing the
  // job it was written for. Ordinary income is the $2 actual gain, versus the $3
  // purchase-date bargain a disqualifying sale would owe on a stock that lost money.
  const r = calcScenario({
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 19,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  });
  const ltd = calcScenario({
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 19,
    ordRate: 0.22, cgRate: 0.15, isQualifying: false,
  });

  it('ordinaryIncome — actual gain $2 × 100, under the $4.50 cap', () => assert.strictEqual(r.ordinaryIncome, 200));
  it('capitalGain — zero (basis stepped up to sale price)',        () => assert.strictEqual(r.capitalGain,      0));
  it('totalTax — $44',                                             () => assert.strictEqual(r.totalTax,        44));
  it('beats long-term disqualifying ($66)', () => {
    assert.ok(r.totalTax < ltd.totalTax,
      `qualifying ${r.totalTax} should beat disqualifying ${ltd.totalTax}`);
  });
});


// ── calcScenario — the configurable plan discount ────────────────────────────
//
// The discount only reaches the §423(c) cap, so it moves qualifying dispositions and
// leaves disqualifying ones alone. It defaults to 15%, the §423(b)(6) maximum.

describe('ESPP_DISCOUNT_RATE', () => {
  it('is 15% — the statutory maximum under §423(b)(6)', () => {
    assert.strictEqual(ESPP_DISCOUNT_RATE, 0.15);
  });
});

describe('calcScenario — discountRate defaults to 15% when omitted', () => {
  const lot = {
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 25,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  };

  it('omitted matches an explicit 0.15', () => {
    assert.deepStrictEqual(calcScenario(lot), calcScenario({ ...lot, discountRate: 0.15 }));
  });
  it('omitted matches an explicit ESPP_DISCOUNT_RATE', () => {
    assert.deepStrictEqual(calcScenario(lot), calcScenario({ ...lot, discountRate: ESPP_DISCOUNT_RATE }));
  });
});

describe('calcScenario — a smaller plan discount lowers the qualifying cap', () => {
  // A 10% lookback plan on the same $30 → $20 drop: pricePaid = 90% × $20 = $18,
  // and the cap is 10% × $30 = $3.00 rather than 15% × $30 = $4.50.
  const lot = {
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 18,
    numShares: 100,  salePricePS: 25,
    ordRate: 0.22, cgRate: 0.15, isQualifying: true,
  };
  const ten = calcScenario({ ...lot, discountRate: 0.10 });

  it('ordinaryIncome — capped at 10% × $30 × 100', () => assert.strictEqual(ten.ordinaryIncome, 300));
  it('capitalGain — the remainder of the gain',    () => assert.strictEqual(ten.capitalGain,    400));

  it('reports less ordinary income than the same lot at 15%', () => {
    const fifteen = calcScenario({ ...lot, discountRate: 0.15 });
    assert.strictEqual(fifteen.ordinaryIncome, 450);
    assert.ok(ten.ordinaryIncome < fifteen.ordinaryIncome);
  });

  it('a 0% discount leaves no ordinary income at all', () => {
    const zero = calcScenario({ ...lot, discountRate: 0 });
    assert.strictEqual(zero.ordinaryIncome, 0);
    assert.strictEqual(zero.capitalGain, 700);  // the whole $7/share gain is LTCG
  });
});

describe('calcScenario — discountRate does not touch disqualifying dispositions', () => {
  // Disqualifying ordinary income is purchaseFMV − pricePaid, measured entirely from
  // the prices; the plan discount never enters it.
  const lot = {
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 18,
    numShares: 100,  salePricePS: 25,
    ordRate: 0.22, cgRate: 0.15, isQualifying: false,
  };

  it('identical results at 15%, 10% and 5%', () => {
    const at15 = calcScenario({ ...lot, discountRate: 0.15 });
    assert.deepStrictEqual(calcScenario({ ...lot, discountRate: 0.10 }), at15);
    assert.deepStrictEqual(calcScenario({ ...lot, discountRate: 0.05 }), at15);
    assert.strictEqual(at15.ordinaryIncome, 200);
  });
});


// ── calcScenario — invariants across the whole input space ───────────────────
//
// The fixtures above pin specific numbers; these sweep a grid of price/discount
// combinations and assert the properties that must hold for every one of them.
// A deterministic grid (not random input) so a failure is always reproducible.

describe('calcScenario — invariants over a price/discount grid', () => {
  const lots = [];
  for (const offeringFMV of [10, 30, 100])
    for (const purchaseFMV of [5, 10, 29.5, 30, 30.5, 100, 150])
      for (const discountRate of [0, 0.05, 0.10, 0.125, 0.15])
        for (const salePricePS of [0.5, 1, 5, 10, 25, 29.5, 30, 30.5, 100, 200]) {
          // price paid under a lookback plan: discount off the lower of the two FMVs
          const pricePaid = (1 - discountRate) * Math.min(offeringFMV, purchaseFMV);
          lots.push({ offeringFMV, purchaseFMV, pricePaid, discountRate, salePricePS,
                      numShares: 100, ordRate: 0.24, cgRate: 0.15 });
        }

  const near = (a, b) => Math.abs(a - b) < 1e-6;

  it('covers 1,050 price/discount combinations', () => assert.strictEqual(lots.length, 1_050));

  it('qualifying: ordinary income is never negative', () => {
    for (const lot of lots) {
      const r = calcScenario({ ...lot, isQualifying: true });
      assert.ok(r.ordinaryIncome >= 0, `negative OI for ${JSON.stringify(lot)}`);
    }
  });

  it('qualifying: ordinary income never exceeds the §423(c) cap', () => {
    for (const lot of lots) {
      const r = calcScenario({ ...lot, isQualifying: true });
      const cap = lot.discountRate * lot.offeringFMV * lot.numShares;
      assert.ok(r.ordinaryIncome <= cap + 1e-9,
        `OI ${r.ordinaryIncome} exceeds cap ${cap} for ${JSON.stringify(lot)}`);
    }
  });

  it('qualifying: ordinary income never exceeds the actual gain', () => {
    for (const lot of lots) {
      const r = calcScenario({ ...lot, isQualifying: true });
      const gain = (lot.salePricePS - lot.pricePaid) * lot.numShares;
      assert.ok(r.ordinaryIncome <= Math.max(0, gain) + 1e-9,
        `OI ${r.ordinaryIncome} exceeds gain ${gain} for ${JSON.stringify(lot)}`);
    }
  });

  it('ordinary income + capital gain always equals the total economic gain', () => {
    // No dollar is lost or double-counted between the two buckets, in either scenario.
    for (const lot of lots) {
      for (const isQualifying of [true, false]) {
        const r = calcScenario({ ...lot, isQualifying });
        const total = (lot.salePricePS - lot.pricePaid) * lot.numShares;
        assert.ok(near(r.ordinaryIncome + r.capitalGain, total),
          `${r.ordinaryIncome} + ${r.capitalGain} != ${total} for ${JSON.stringify(lot)}`);
      }
    }
  });

  it('a capital loss is never taxed', () => {
    for (const lot of lots) {
      for (const isQualifying of [true, false]) {
        const r = calcScenario({ ...lot, isQualifying });
        if (r.capitalGain < 0) assert.strictEqual(r.cgTax, 0);
      }
    }
  });

  it('net proceeds always equal gross proceeds minus total tax', () => {
    for (const lot of lots) {
      for (const isQualifying of [true, false]) {
        const r = calcScenario({ ...lot, isQualifying });
        assert.ok(near(r.netProceeds, r.grossProceeds - r.totalTax),
          `netProceeds mismatch for ${JSON.stringify(lot)}`);
      }
    }
  });

  it('no NaN or Infinity ever reaches the UI', () => {
    for (const lot of lots) {
      for (const isQualifying of [true, false]) {
        const r = calcScenario({ ...lot, isQualifying });
        for (const [k, v] of Object.entries(r)) {
          assert.ok(Number.isFinite(v), `${k} = ${v} for ${JSON.stringify(lot)}`);
        }
      }
    }
  });

  it('qualifying beats disqualifying whenever the sale is at or below the purchase FMV', () => {
    // The §423(c) cap doing the job it was written for. Above the purchase FMV the
    // comparison can flip — that is the disadvantage the calculator warns about.
    for (const lot of lots) {
      if (lot.salePricePS > lot.purchaseFMV) continue;
      const q   = calcScenario({ ...lot, isQualifying: true });
      const ltd = calcScenario({ ...lot, isQualifying: false });
      assert.ok(q.totalTax <= ltd.totalTax + 1e-9,
        `qualifying ${q.totalTax} > disqualifying ${ltd.totalTax} for ${JSON.stringify(lot)}`);
    }
  });

  it('the qualifying penalty never exceeds discount × (offeringFMV − purchaseFMV)', () => {
    // The bound that makes the disadvantage "small" — the claim the UI copy makes.
    for (const lot of lots) {
      const q   = calcScenario({ ...lot, isQualifying: true });
      const ltd = calcScenario({ ...lot, isQualifying: false });
      const extraOrdInc = q.ordinaryIncome - ltd.ordinaryIncome;
      if (extraOrdInc <= 0) continue;
      const bound = lot.discountRate
        * Math.max(0, lot.offeringFMV - lot.purchaseFMV) * lot.numShares;
      assert.ok(extraOrdInc <= bound + 1e-9,
        `penalty ${extraOrdInc} exceeds bound ${bound} for ${JSON.stringify(lot)}`);
    }
  });

  it('qualifying never reports more ordinary income when the stock rose to purchase', () => {
    for (const lot of lots) {
      if (lot.purchaseFMV < lot.offeringFMV) continue;
      const q   = calcScenario({ ...lot, isQualifying: true });
      const ltd = calcScenario({ ...lot, isQualifying: false });
      assert.ok(q.ordinaryIncome <= ltd.ordinaryIncome + 1e-9,
        `qualifying OI ${q.ordinaryIncome} > disqualifying ${ltd.ordinaryIncome} for ${JSON.stringify(lot)}`);
    }
  });
});


// ── calcScenario — Disqualifying Dispositions ─────────────────────────────────
//
// Ordinary income = (purchaseFMV − pricePaid) × shares   [always due, per W-2]
// Capital gain    = (salePrice  − purchaseFMV) × shares  [ST or LT depending on hold]

describe('calcScenario — disqualifying short-term: stock rose after purchase (Schwab ESPP guide)', () => {
  // Source: schwab.com/learn/story/espp-taxes
  //   offeringFMV=$20  purchaseFMV=$25  pricePaid=$17  100 shares  sale=$30
  //   OI (bargain) = ($25−$17) × 100 = $800
  //   STCG         = ($30−$25) × 100 = $500  (taxed at ordinary rate)
  const r = calcScenario({
    offeringFMV: 20, purchaseFMV: 25, pricePaid: 17,
    numShares: 100,  salePricePS: 30,
    ordRate: 0.24, cgRate: 0.24, isQualifying: false,
  });

  it('grossProceeds',                                   () => assert.strictEqual(r.grossProceeds,  3_000));
  it('totalCostBasis',                                  () => assert.strictEqual(r.totalCostBasis,  1_700));
  it('ordinaryIncome — bargain element $8 × 100',       () => assert.strictEqual(r.ordinaryIncome,    800));
  it('ordTax — 24% of $800',                            () => assert.strictEqual(r.ordTax,             192));
  it('capitalGain — short-term gain $5 × 100',          () => assert.strictEqual(r.capitalGain,        500));
  it('cgTax — 24% of $500 (ordinary rate for ST)',      () => assert.strictEqual(r.cgTax,              120));
  it('totalTax',                                        () => assert.strictEqual(r.totalTax,            312));
  it('netProceeds',                                     () => assert.strictEqual(r.netProceeds,       2_688));
  it('effRate — 10.4%',                                 () => assert.strictEqual(r.effRate,            10.4));
});

describe('calcScenario — disqualifying long-term: LTCG rate applied to gain (Fidelity ESPP guide)', () => {
  // Source: fidelity.com ESPP tax guide
  //   Same prices as Schwab example; held > 1 year so LTCG rate on capital gain
  //   OI (bargain) unchanged; only cgTax changes (15% vs 24%)
  const r = calcScenario({
    offeringFMV: 20, purchaseFMV: 25, pricePaid: 17,
    numShares: 100,  salePricePS: 30,
    ordRate: 0.24, cgRate: 0.15, isQualifying: false,
  });

  it('ordinaryIncome — same bargain element as ST ($800)', () => assert.strictEqual(r.ordinaryIncome,   800));
  it('ordTax — unchanged vs ST',                           () => assert.strictEqual(r.ordTax,            192));
  it('capitalGain — unchanged vs ST',                      () => assert.strictEqual(r.capitalGain,       500));
  it('cgTax — 15% instead of 24%',                        () => assert.strictEqual(r.cgTax,              75));
  it('totalTax — lower than short-term',                   () => assert.strictEqual(r.totalTax,          267));
  it('netProceeds — higher than short-term',               () => assert.strictEqual(r.netProceeds,     2_733));
  it('effRate — 8.9%',                                     () => assert.strictEqual(r.effRate,           8.9));
});

describe('calcScenario — disqualifying: phantom income when stock falls after purchase (Fairmark)', () => {
  // Source: fairmark.com/compensation-stock-options/employee-stock-purchase-plans
  //   offeringFMV=$20  purchaseFMV=$25  pricePaid=$17  100 shares  sale=$20
  //   W-2 ordinary income (bargain element) is still owed even though the stock
  //   fell post-purchase — the "phantom income" trap.
  //   OI = $800  capitalGain = ($20−$25) × 100 = −$500 (loss, no cgTax)
  const r = calcScenario({
    offeringFMV: 20, purchaseFMV: 25, pricePaid: 17,
    numShares: 100,  salePricePS: 20,
    ordRate: 0.22, cgRate: 0.22, isQualifying: false,
  });

  it('ordinaryIncome — bargain element owed regardless of sale price', () => assert.strictEqual(r.ordinaryIncome, 800));
  it('capitalGain — capital loss $5 × 100',                            () => assert.strictEqual(r.capitalGain,   -500));
  it('cgTax — zero (losses are not taxed)',                            () => assert.strictEqual(r.cgTax,             0));
  it('ordTax — 22% of $800',                                           () => assert.strictEqual(r.ordTax,          176));
  it('totalTax — ordinary income tax only',                            () => assert.strictEqual(r.totalTax,        176));
  it('netProceeds',                                                    () => assert.strictEqual(r.netProceeds,   1_824));
  it('effRate — 8.8%',                                                 () => approx(r.effRate, 8.8, 'effRate'));
});

describe('calcScenario — disqualifying: stock fell from offering to purchase (qualifying would be worse)', () => {
  // When purchaseFMV < offeringFMV, a qualifying disposition would report MORE
  // ordinary income (uses the higher offeringFMV). The app warns users of this.
  //   offeringFMV=$30  purchaseFMV=$20  pricePaid=$17  100 shares  sale=$25
  //   OI = ($20−$17) × 100 = $300  (small bargain)
  //   LTCG = ($25−$20) × 100 = $500
  const r = calcScenario({
    offeringFMV: 30, purchaseFMV: 20, pricePaid: 17,
    numShares: 100,  salePricePS: 25,
    ordRate: 0.22, cgRate: 0.15, isQualifying: false,
  });

  it('ordinaryIncome — only purchase bargain $3 × 100', () => assert.strictEqual(r.ordinaryIncome,   300));
  it('capitalGain — from purchaseFMV to sale $5 × 100', () => assert.strictEqual(r.capitalGain,      500));
  it('ordTax — 22% of $300',                            () => assert.strictEqual(r.ordTax,             66));
  it('cgTax — 15% of $500',                             () => assert.strictEqual(r.cgTax,              75));
  it('totalTax',                                        () => assert.strictEqual(r.totalTax,           141));
  it('netProceeds',                                     () => assert.strictEqual(r.netProceeds,      2_359));
  it('effRate — 5.64%',                                 () => assert.strictEqual(r.effRate,           5.64));
});
