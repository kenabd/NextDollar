const form = document.getElementById('calc-form');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const modeInput = document.getElementById('mode');
const deductibleInput = document.getElementById('deductible');
const taxInputsWrap = document.getElementById('tax-inputs');
const monthsWrap = document.getElementById('months-wrap');
const estimateWrap = document.getElementById('estimate-wrap');
const monthsLeftInput = document.getElementById('months-left');
const startDateInput = document.getElementById('start-date');
const startMonthOptions = document.getElementById('start-month-options');
const termYearsInput = document.getElementById('term-years');
const estimatedMonthsText = document.getElementById('estimated-months');
const deductibleShareInput = document.getElementById('deductible-share');
const deductibleShareSlider = document.getElementById('deductible-share-slider');
const cashoutGoalInput = document.getElementById('cashout-goal');

const mortgageSummary = document.getElementById('mortgage-summary');
const taxNote = document.getElementById('tax-note');
const mortgageDetail = document.getElementById('mortgage-detail');
const scenarioResults = document.getElementById('scenario-results');
const scenarioTabs = Array.from(document.querySelectorAll('.scenario-tab'));
const detailsNote = document.getElementById('details-note');
const breakdownTableBody = document.querySelector('#breakdown-table tbody');
const assetTableBody = document.querySelector('#asset-table tbody');
const priorityList = document.getElementById('priority-list');
const dataAsOf = document.getElementById('data-asof');
const sourceNote = document.getElementById('source-note');
const shareLinkButton = document.getElementById('share-link');
const exportPdfButton = document.getElementById('export-pdf');
const shareStatus = document.getElementById('share-status');
const quickResult = document.getElementById('quick-result');
const quickMetrics = document.getElementById('quick-metrics');

const STORAGE_KEY = 'bestinvestment.form.v2';
const THEME_KEY = 'bestinvestment.theme.v1';
const EPS = 1e-8;
const DEFAULT_MARKET_CONDITION_MULTIPLIERS = {
  conservative: 0.71,
  moderate: 1.0,
  aggressive: 1.21,
};
const MODEL_SOURCE_LINKS = [
  'https://www.irs.gov/taxtopics/tc409',
  'https://www.irs.gov/publications/p550',
  'https://www.irs.gov/publications/p936',
];

const FALLBACK_ASSETS = {
  source_as_of: '2026-01-05',
  methodology: '50-year annualized historical averages (1976-2025) using total returns (dividends included), with market-condition profile scaling.',
  market_condition_multipliers: {
    conservative: 0.71,
    moderate: 1.0,
    aggressive: 1.21,
  },
  sources: [
    'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
    'https://www.schwabmoneywise.com/investment-planning/what-is-asset-allocation',
    'https://www.irs.gov/taxtopics/tc409',
    'https://www.irs.gov/publications/p936'
  ],
  assets: [
    { ticker: 'VTI', name: 'US Total Market ETF', baseline_50y_avg: 0.1192, dividend_yield: 0.014 },
    { ticker: 'VOO', name: 'S&P 500 ETF', baseline_50y_avg: 0.1192, dividend_yield: 0.013 },
    { ticker: 'QQQ', name: 'Nasdaq-100 ETF', baseline_50y_avg: 0.1212, dividend_yield: 0.006 },
    { ticker: 'VXUS', name: 'International Stocks ETF', baseline_50y_avg: 0.1192, dividend_yield: 0.029 },
    { ticker: 'BND', name: 'US Aggregate Bond ETF', baseline_50y_avg: 0.0614, dividend_yield: 0.037 },
    { ticker: 'SCHD', name: 'Dividend Equity ETF', baseline_50y_avg: 0.1192, dividend_yield: 0.034 },
    { ticker: 'VNQ', name: 'US REIT ETF', baseline_50y_avg: 0.0854, dividend_yield: 0.038 },
    { ticker: 'GLD', name: 'Gold ETF', baseline_50y_avg: 0.0517, dividend_yield: 0.0 },
    { ticker: 'SLV', name: 'Silver ETF', baseline_50y_avg: 0.0517, dividend_yield: 0.0 }
  ]
};

let assetsData = [];
let sourceAsOf = 'N/A';
let methodology = '';
let sourceLinks = [];
let latestRows = [];
let activeScenario = 'moderate';
let latestReport = null;
let latestMortgageNominal = null;
let latestMortgageHurdleAnnual = null;
let marketConditionMultipliers = { ...DEFAULT_MARKET_CONDITION_MULTIPLIERS };
let compactScenarioView = window.matchMedia('(max-width: 700px)').matches;

function formatPct(x) {
  return `${(x * 100).toFixed(2)}%`;
}

function formatMoney(x) {
  return `$${x.toFixed(2)}`;
}

function formatSignedMoney(x) {
  return `${x >= 0 ? '+' : '-'}${formatMoney(Math.abs(x))}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function clampPercent(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return clamp(n, 0, 100);
}

function estimateMonthsLeft(startMonth, termYears) {
  const value = String(startMonth || '').trim();
  const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || !month || !termYears) return null;

  const now = new Date();
  const elapsed = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  return Math.max(termYears * 12 - elapsed, 1);
}

function getMonthsLeft() {
  if (modeInput.value === 'months') return Number(monthsLeftInput.value);
  const estimated = estimateMonthsLeft(startDateInput.value, Number(termYearsInput.value));
  return estimated || Number(monthsLeftInput.value);
}

function monthlyPayment(balance, monthlyRate, months) {
  if (months <= 0) return 0;
  if (monthlyRate <= EPS) return balance / months;
  const f = Math.pow(1 + monthlyRate, months);
  return balance * (monthlyRate * f) / (f - 1);
}

function simulateMortgageCashflows({
  balance,
  annualRate,
  months,
  extraPrincipal,
  taxShieldRate,
  monthlyPMI,
}) {
  const rm = annualRate / 12;
  const payment = monthlyPayment(balance, rm, months);
  let bal = Math.max(balance - extraPrincipal, 0);

  const records = [];
  let m = 0;
  while (bal > EPS && m < 1200) {
    m += 1;
    const interest = bal * rm;
    let principal = payment - interest;
    if (principal < 0) {
      return null;
    }
    principal = Math.min(principal, bal);

    const pmi = monthlyPMI > 0 ? monthlyPMI : 0;

    const paymentActual = interest + principal;
    const taxShield = interest * taxShieldRate;
    const afterTaxOutflow = paymentActual + pmi - taxShield;

    records.push({
      month: m,
      balanceStart: bal,
      interest,
      principal,
      pmi,
      paymentActual,
      taxShield,
      afterTaxOutflow,
    });

    bal -= principal;
  }

  return {
    records,
    monthsToPayoff: records.length,
    totalInterest: records.reduce((a, r) => a + r.interest, 0),
    totalPMI: records.reduce((a, r) => a + r.pmi, 0),
    totalAfterTaxOutflow: records.reduce((a, r) => a + r.afterTaxOutflow, 0),
  };
}

function monthlyIrr(cashflows) {
  // Bisection over monthly rates.
  let lo = -0.999;
  let hi = 2.0;

  const npv = (rate) => cashflows.reduce((acc, cf, i) => acc + (cf / Math.pow(1 + rate, i)), 0);

  let fLo = npv(lo);
  let fHi = npv(hi);
  if (Number.isNaN(fLo) || Number.isNaN(fHi) || fLo * fHi > 0) return null;

  for (let i = 0; i < 120; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-10) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

function mortgageEquivalent({
  balance,
  annualRate,
  months,
  amount,
  taxShieldRate,
  monthlyPMI,
}) {
  const baseline = simulateMortgageCashflows({
    balance,
    annualRate,
    months,
    extraPrincipal: 0,
    taxShieldRate,
    monthlyPMI,
  });
  const withPrepay = simulateMortgageCashflows({
    balance,
    annualRate,
    months,
    extraPrincipal: amount,
    taxShieldRate,
    monthlyPMI,
  });

  if (!baseline || !withPrepay) return null;

  const cashflows = [-amount];
  for (let i = 0; i < Math.max(baseline.records.length, withPrepay.records.length); i += 1) {
    const base = baseline.records[i]?.afterTaxOutflow || 0;
    const pre = withPrepay.records[i]?.afterTaxOutflow || 0;
    cashflows.push(base - pre);
  }

  const irrMonthly = monthlyIrr(cashflows);
  const annualEquivalent = irrMonthly == null ? (annualRate * (1 - taxShieldRate)) : (Math.pow(1 + irrMonthly, 12) - 1);
  const monthlyEquivalent = irrMonthly == null ? (annualEquivalent / 12) : irrMonthly;
  const futureValue = amount * Math.pow(1 + monthlyEquivalent, months);

  return {
    annualEquivalent,
    monthlyEquivalent,
    futureValue,
    baseline,
    withPrepay,
    cashflows,
    interestSaved: baseline.totalInterest - withPrepay.totalInterest,
    pmiSaved: baseline.totalPMI - withPrepay.totalPMI,
    monthsSaved: baseline.monthsToPayoff - withPrepay.monthsToPayoff,
    lifetimeAfterTaxSavings: cashflows.slice(1).reduce((a, c) => a + c, 0),
  };
}

function normalizeMultipliers(raw) {
  const c = Number(raw?.conservative);
  const m = Number(raw?.moderate);
  const a = Number(raw?.aggressive);
  const valid = [c, m, a].every((v) => Number.isFinite(v) && v > 0 && v <= 3);
  if (!valid) return { ...DEFAULT_MARKET_CONDITION_MULTIPLIERS };
  return { conservative: c, moderate: m, aggressive: a };
}

function scenarioRates(asset) {
  const base = typeof asset.baseline_50y_avg === 'number'
    ? asset.baseline_50y_avg
    : (typeof asset.moderate === 'number' ? asset.moderate : 0.06);
  return {
    conservative: Math.max(base * marketConditionMultipliers.conservative, 0),
    moderate: Math.max(base * marketConditionMultipliers.moderate, 0),
    aggressive: Math.max(base * marketConditionMultipliers.aggressive, 0),
  };
}

function projectInvestmentAfterTax({
  principal,
  years,
  annualTotalReturn,
  dividendYield,
  includeDividends,
  qdivTaxRate,
  ltcgTaxRate,
  liquidateAtHorizon,
  inflationRate,
}) {
  const months = Math.max(1, Math.round(years * 12));
  const divYield = Math.max(dividendYield, 0);
  const priceReturnAnnual = annualTotalReturn - divYield;
  const monthlyPriceRate = Math.pow(1 + priceReturnAnnual, 1 / 12) - 1;
  const monthlyDivRate = divYield / 12;

  let value = principal;
  let basis = principal;
  let dividendCash = 0;

  for (let m = 0; m < months; m += 1) {
    value *= (1 + monthlyPriceRate);

    const grossDiv = value * monthlyDivRate;
    const divTax = grossDiv * qdivTaxRate;
    const netDiv = grossDiv - divTax;

    if (includeDividends) {
      value += netDiv;
      basis += netDiv;
    } else {
      dividendCash += netDiv;
    }
  }

  let postLiquidation = value;
  let liquidationTax = 0;
  if (liquidateAtHorizon) {
    const gain = value - basis;
    if (gain > 0) {
      liquidationTax = gain * ltcgTaxRate;
      postLiquidation = value - liquidationTax;
    }
  }

  const nominalAfterTax = postLiquidation + dividendCash;
  const realAfterTax = nominalAfterTax / Math.pow(1 + inflationRate, years);
  const effectiveAfterTaxAnnual = Math.pow(nominalAfterTax / principal, 1 / years) - 1;

  return {
    nominalAfterTax,
    realAfterTax,
    effectiveAfterTaxAnnual,
    liquidationTax,
    dividendCash,
  };
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '\u2600' : '\u263D';
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function handleThemeToggle() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (err) {
    // ignore
  }
}

function readFormState() {
  return {
    balance: document.getElementById('balance').value,
    rate: document.getElementById('rate').value,
    deductible: document.getElementById('deductible').checked,
    taxRate: document.getElementById('tax-rate').value,
    deductibleShare: document.getElementById('deductible-share').value,
    mode: modeInput.value,
    monthsLeft: monthsLeftInput.value,
    startDate: startDateInput.value,
    termYears: termYearsInput.value,
    amount: document.getElementById('amount').value,
    includeDividends: document.getElementById('include-dividends').checked,
    ltcgRate: document.getElementById('ltcg-rate').value,
    qdivRate: document.getElementById('qdiv-rate').value,
    stateTaxRate: document.getElementById('state-tax-rate').value,
    liquidateHorizon: document.getElementById('liquidate-horizon').checked,
    inflationRate: document.getElementById('inflation-rate').value,
    pmiMonthly: document.getElementById('pmi-monthly').value,
    cashoutGoal: document.getElementById('cashout-goal').value,
    emergency: document.getElementById('emergency').checked,
    highDebt: document.getElementById('high-debt').checked,
    match: document.getElementById('match').checked,
    viewScenario: activeScenario,
  };
}

function buildQueryFromState(state) {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([k, v]) => {
    if (v == null || v === '') return;
    params.set(k, String(v));
  });
  return params.toString();
}

function applyStateObject(state) {
  if (!state || typeof state !== 'object') return;

  const setVal = (id, key) => {
    if (state[key] != null) document.getElementById(id).value = state[key];
  };
  const setCheck = (id, key) => {
    if (state[key] != null) document.getElementById(id).checked = String(state[key]) === 'true' || state[key] === true;
  };

  setVal('balance', 'balance');
  setVal('rate', 'rate');
  setCheck('deductible', 'deductible');
  setVal('tax-rate', 'taxRate');
  setVal('deductible-share', 'deductibleShare');
  if (state.mode === 'months' || state.mode === 'estimate') modeInput.value = state.mode;
  setVal('months-left', 'monthsLeft');
  setVal('start-date', 'startDate');
  setVal('term-years', 'termYears');
  setVal('amount', 'amount');
  setCheck('include-dividends', 'includeDividends');
  setVal('ltcg-rate', 'ltcgRate');
  setVal('qdiv-rate', 'qdivRate');
  setVal('state-tax-rate', 'stateTaxRate');
  setCheck('liquidate-horizon', 'liquidateHorizon');
  setVal('inflation-rate', 'inflationRate');
  setVal('pmi-monthly', 'pmiMonthly');
  setVal('cashout-goal', 'cashoutGoal');
  setCheck('emergency', 'emergency');
  setCheck('high-debt', 'highDebt');
  setCheck('match', 'match');

  if (state.viewScenario === 'conservative' || state.viewScenario === 'moderate' || state.viewScenario === 'aggressive') {
    activeScenario = state.viewScenario;
  }
}

function readStateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) return null;
  const state = {};
  params.forEach((value, key) => {
    state[key] = value;
  });
  return state;
}

function saveFormState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readFormState()));
  } catch (err) {
    // ignore
  }
}

function restoreFormState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    applyStateObject(JSON.parse(raw));
  } catch (err) {
    // ignore
  }
}

function renderAssetTable() {
  assetTableBody.innerHTML = '';
  assetsData.forEach((asset) => {
    const rates = scenarioRates(asset);
    const divYield = Number(asset.dividend_yield || 0);
    const note = asset.proxy_note ? ` title="${asset.proxy_note}"` : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${asset.ticker}</td>
      <td${note}>${asset.name}</td>
      <td>${formatPct(divYield)}</td>
      <td>${formatPct(rates.conservative)}</td>
      <td>${formatPct(rates.moderate)}</td>
      <td>${formatPct(rates.aggressive)}</td>
    `;
    assetTableBody.appendChild(tr);
  });

  dataAsOf.textContent = `Return data source date: ${sourceAsOf}. Using 50-year average annualized returns.`;
  const multiplierText = `Market-condition multipliers applied to all assets: Conservative x${marketConditionMultipliers.conservative.toFixed(2)}, Moderate x${marketConditionMultipliers.moderate.toFixed(2)}, Aggressive x${marketConditionMultipliers.aggressive.toFixed(2)}.`;
  if (sourceLinks.length > 0) {
    const merged = [...sourceLinks, ...MODEL_SOURCE_LINKS];
    const unique = [...new Set(merged)];
    const linksHtml = unique
      .map((url, idx) => `<a href="${url}" target="_blank" rel="noopener noreferrer">Source ${idx + 1}</a>`)
      .join(' | ');
    sourceNote.innerHTML = `${methodology} ${multiplierText} Sources: ${linksHtml}`;
  } else {
    sourceNote.textContent = `${methodology} ${multiplierText}`.trim();
  }
}

function renderPriorities(flags) {
  const items = [];
  if (!flags.emergency) items.push('Build an emergency fund (3-6 months) before risk assets.');
  if (flags.highDebt) items.push('Pay high-interest debt (>8%) before extra investing.');
  if (!flags.match) items.push('Capture full employer retirement match before taxable investing.');
  items.push('Diversify across multiple assets instead of concentrating in one option.');

  priorityList.innerHTML = '';
  items.forEach((txt) => {
    const li = document.createElement('li');
    li.textContent = txt;
    priorityList.appendChild(li);
  });
}

function sortedRowsForScenario(rows, scenario) {
  return rows
    .filter((r) => r.scenario === scenario)
    .sort((a, b) => b.deltaAfterTax - a.deltaAfterTax);
}

function renderDetailedBreakdown(rows, scenario) {
  breakdownTableBody.innerHTML = '';
  sortedRowsForScenario(rows, scenario).forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.ticker}</td>
      <td>${formatPct(row.annualReturnUsed)}</td>
      <td>${formatPct(row.effectiveAfterTaxAnnual)}</td>
      <td>${formatMoney(row.projectedAfterTax)}</td>
      <td>${formatSignedMoney(row.deltaAfterTax)}</td>
      <td>${row.goalGapAfterTax >= 0 ? 'Hit ' : 'Miss '}${formatSignedMoney(row.goalGapAfterTax)}</td>
      <td>${formatMoney(row.projectedRealAfterTax)}</td>
      <td>${formatSignedMoney(row.deltaRealAfterTax)}</td>
    `;
    breakdownTableBody.appendChild(tr);
  });
}

function renderScenarioSummary(rows, scenario) {
  const sorted = sortedRowsForScenario(rows, scenario);
  const top = sorted.slice(0, compactScenarioView ? 3 : 5);
  if (!top.length) {
    scenarioResults.innerHTML = '';
    return;
  }

  const title = titleCase(scenario);
  const items = top
    .map((row, idx) => `
      <div class="scenario-row">
        <div class="scenario-row-title">
          <span class="scenario-rank">${idx + 1}.</span>
          <span class="scenario-ticker">${row.ticker}</span>
          <span class="scenario-name">${row.name}</span>
        </div>
        <div class="scenario-row-metrics">
          <span class="scenario-chip">After-tax ${formatMoney(row.projectedAfterTax).replace('$', '')}</span>
          <span class="scenario-chip ${row.deltaAfterTax >= 0 ? 'is-positive' : 'is-negative'}">Vs mortgage ${formatSignedMoney(row.deltaAfterTax)}</span>
          <span class="scenario-chip ${row.goalGapAfterTax >= 0 ? 'is-positive' : 'is-negative'}">${row.goalGapAfterTax >= 0 ? 'Goal +' : 'Goal -'}${formatMoney(Math.abs(row.goalGapAfterTax)).replace('$', '')}</span>
        </div>
      </div>
    `)
    .join('');

  scenarioResults.innerHTML = `
    <div class="scenario-box">
      <div class="scenario-box-head">
        <h4>${title}</h4>
        <p class="meta">Top ${top.length}/${sorted.length} by after-tax edge vs mortgage.</p>
      </div>
      <div class="scenario-list">${items}</div>
    </div>
  `;
}

function renderQuickResult(rows, scenario) {
  if (!rows.length || latestMortgageNominal == null) {
    quickResult.textContent = '';
    quickMetrics.textContent = '';
    return;
  }
  const best = sortedRowsForScenario(rows, scenario)[0];
  if (!best) {
    quickResult.textContent = '';
    quickMetrics.textContent = '';
    return;
  }

  const scenarioLabel = titleCase(scenario);
  if (best.deltaAfterTax > 0) {
    quickResult.textContent = `${scenarioLabel}: ${best.ticker} is currently best after tax.`;
  } else {
    quickResult.textContent = `${scenarioLabel}: Mortgage prepayment is currently best after tax.`;
  }

  const vsMortgageText = best.deltaAfterTax >= 0
    ? `${best.ticker} is ${formatSignedMoney(best.deltaAfterTax)} vs mortgage.`
    : `${best.ticker} trails mortgage by ${formatMoney(Math.abs(best.deltaAfterTax))}.`;
  const goalText = `${best.goalGapAfterTax >= 0 ? 'Goal hit' : 'Goal miss'} for ${best.ticker}: ${formatSignedMoney(best.goalGapAfterTax)}.`;
  const hurdleText = latestMortgageHurdleAnnual == null
    ? ''
    : `Break-even after-tax annual return to match mortgage: ${formatPct(latestMortgageHurdleAnnual)}.`;
  quickMetrics.textContent = `${vsMortgageText} ${goalText} ${hurdleText}`.trim();
}

function setActiveScenario(scenario) {
  activeScenario = scenario;
  scenarioTabs.forEach((tab) => {
    const active = tab.dataset.scenario === scenario;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  if (latestRows.length > 0) {
    renderQuickResult(latestRows, activeScenario);
    renderScenarioSummary(latestRows, activeScenario);
    renderDetailedBreakdown(latestRows, activeScenario);
  }
}

function initScenarioTabs() {
  scenarioTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveScenario(tab.dataset.scenario);
      saveFormState();
    });
  });
  setActiveScenario(activeScenario);
}

function handleViewportResize() {
  const nextCompact = window.matchMedia('(max-width: 700px)').matches;
  if (nextCompact === compactScenarioView) return;
  compactScenarioView = nextCompact;
  if (latestRows.length > 0) {
    renderScenarioSummary(latestRows, activeScenario);
  }
}

function syncDeductibleShareFromNumber() {
  const clamped = clampPercent(deductibleShareInput.value);
  deductibleShareInput.value = String(clamped);
  deductibleShareSlider.value = String(clamped);
}

function syncDeductibleShareFromSlider() {
  const clamped = clampPercent(deductibleShareSlider.value);
  deductibleShareInput.value = String(clamped);
  deductibleShareSlider.value = String(clamped);
}

function updateModeVisibility() {
  if (modeInput.value === 'months') {
    monthsWrap.classList.remove('hidden');
    estimateWrap.classList.add('hidden');
    return;
  }

  monthsWrap.classList.add('hidden');
  estimateWrap.classList.remove('hidden');
  const est = estimateMonthsLeft(startDateInput.value, Number(termYearsInput.value));
  estimatedMonthsText.textContent = est ? `Estimated months left: ${est}` : 'Use YYYY-MM format (example: 2023-01).';
}

function updateTaxVisibility() {
  if (deductibleInput.checked) {
    taxInputsWrap.classList.remove('hidden');
    syncDeductibleShareFromNumber();
    return;
  }
  taxInputsWrap.classList.add('hidden');
}

function buildMonthSuggestions() {
  startMonthOptions.innerHTML = '';
  const now = new Date();
  const maxYear = now.getFullYear();
  const minYear = maxYear - 50;
  for (let y = maxYear; y >= minYear; y -= 1) {
    for (let m = 12; m >= 1; m -= 1) {
      const opt = document.createElement('option');
      opt.value = `${y}-${String(m).padStart(2, '0')}`;
      startMonthOptions.appendChild(opt);
    }
  }
}

async function loadAssetData() {
  if (window.location.protocol === 'file:') {
    assetsData = FALLBACK_ASSETS.assets;
    sourceAsOf = `${FALLBACK_ASSETS.source_as_of} (embedded local dataset)`;
    methodology = FALLBACK_ASSETS.methodology;
    sourceLinks = FALLBACK_ASSETS.sources;
    marketConditionMultipliers = normalizeMultipliers(FALLBACK_ASSETS.market_condition_multipliers);
    return;
  }

  try {
    const response = await fetch('data/assets.json');
    if (!response.ok) throw new Error('Unable to load asset data');
    const payload = await response.json();
    assetsData = payload.assets;
    sourceAsOf = payload.source_as_of;
    methodology = payload.methodology || '';
    sourceLinks = Array.isArray(payload.sources) ? payload.sources : [];
    marketConditionMultipliers = normalizeMultipliers(payload.market_condition_multipliers);
  } catch (err) {
    assetsData = FALLBACK_ASSETS.assets;
    sourceAsOf = `${FALLBACK_ASSETS.source_as_of} (embedded local dataset)`;
    methodology = FALLBACK_ASSETS.methodology;
    sourceLinks = FALLBACK_ASSETS.sources;
    marketConditionMultipliers = normalizeMultipliers(FALLBACK_ASSETS.market_condition_multipliers);
  }
}

async function handleShareLink() {
  const query = buildQueryFromState(readFormState());
  const base = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
  const link = `${base}?${query}`;
  try {
    await navigator.clipboard.writeText(link);
    shareStatus.textContent = 'Share link copied to clipboard.';
  } catch (err) {
    shareStatus.textContent = `Copy failed. Use this link: ${link}`;
  }
}

function handleExportPdf() {
  if (!latestReport) {
    shareStatus.textContent = 'Run a calculation first, then export PDF.';
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    shareStatus.textContent = 'PDF library failed to load. Please refresh.';
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 42;

  const line = (text, size = 10) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * (size + 2);
  };

  const section = (title) => {
    y += 8;
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text(title, margin, y);
    doc.setFont(undefined, 'normal');
    y += 10;
  };

  const fmtPct = (v) => `${(v * 100).toFixed(2)}%`;
  const fmtMoney = (v) => `$${Number(v).toFixed(2)}`;
  const fmtSignedMoney = (v) => `${v >= 0 ? '+' : '-'}${fmtMoney(Math.abs(v))}`;

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('BestInvestment Detailed Report', margin, y);
  doc.setFont(undefined, 'normal');
  y += 18;
  line(`Generated: ${new Date().toLocaleString()}`, 10);
  line(`Active Scenario Tab: ${titleCase(latestReport.activeScenario)}`, 10);

  section('Inputs');
  line(`Mortgage balance: ${fmtMoney(latestReport.inputs.balance)}`);
  line(`Mortgage APR: ${fmtPct(latestReport.inputs.apr)}`);
  line(`Months analyzed: ${latestReport.inputs.monthsLeft}`);
  line(`Amount allocated now: ${fmtMoney(latestReport.inputs.amount)}`);
  line(`Cash-out goal used: ${fmtMoney(latestReport.inputs.cashoutGoal)} (${latestReport.inputs.cashoutGoalDefaulted ? 'Defaulted to mortgage equivalent at horizon' : 'User entered'})`);
  line(`Include tax breaks from mortgage interest: ${latestReport.inputs.deductible ? 'Yes' : 'No'}`);
  line(`Include dividends (reinvested): ${latestReport.assumptions.includeDividends ? 'Yes' : 'No'}`);
  line(`LTCG tax assumed: ${fmtPct(latestReport.assumptions.combinedLtcgRate)} | Qualified dividend tax assumed: ${fmtPct(latestReport.assumptions.combinedQdivRate)}`);
  line(`Inflation assumed: ${fmtPct(latestReport.assumptions.inflationRate)} | Liquidation at horizon: ${latestReport.assumptions.liquidateAtHorizon ? 'Yes' : 'No'}`);
  line(`Market-condition multipliers: Conservative x${latestReport.assumptions.marketConditionMultipliers.conservative.toFixed(2)}, Moderate x${latestReport.assumptions.marketConditionMultipliers.moderate.toFixed(2)}, Aggressive x${latestReport.assumptions.marketConditionMultipliers.aggressive.toFixed(2)}`);

  section('Mortgage Analysis');
  line(`Mortgage equivalent future value (nominal): ${fmtMoney(latestReport.mortgage.futureValue)}`);
  line(`Mortgage equivalent future value (real): ${fmtMoney(latestReport.mortgage.realFutureValue)}`);
  line(`Annualized mortgage equivalent return: ${fmtPct(latestReport.mortgage.annualEquivalent)}`);
  line(`Break-even after-tax annual return to match mortgage: ${fmtPct(latestReport.mortgage.hurdleAfterTaxAnnual)}`);
  line(`Interest saved from prepayment: ${fmtMoney(latestReport.mortgage.interestSaved)}`);
  line(`PMI saved from prepayment: ${fmtMoney(latestReport.mortgage.pmiSaved)}`);
  line(`Estimated payoff acceleration: ${latestReport.mortgage.monthsSaved} months`);

  const scenarioWinners = ['conservative', 'moderate', 'aggressive'].map((scenario) => {
    const best = sortedRowsForScenario(latestReport.rows, scenario)[0];
    if (!best) return null;
    return {
      scenario,
      action: best.deltaAfterTax > 0 ? `Invest (${best.ticker})` : 'Mortgage prepay',
      ticker: best.ticker,
      deltaAfterTax: best.deltaAfterTax,
      goalGapAfterTax: best.goalGapAfterTax,
      goalStatus: best.goalGapAfterTax >= 0 ? 'Hit' : 'Miss',
    };
  }).filter(Boolean);

  section('Scenario Winners');
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Scenario', 'Best Action', 'Ticker', 'Vs Mortgage', 'Goal Status', 'Goal Gap']],
    body: scenarioWinners.map((r) => [
      titleCase(r.scenario),
      r.action,
      r.ticker,
      fmtSignedMoney(r.deltaAfterTax),
      r.goalStatus,
      fmtSignedMoney(r.goalGapAfterTax),
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [0, 109, 119] },
  });
  y = doc.lastAutoTable.finalY + 10;

  const scenarioTop = ['conservative', 'moderate', 'aggressive'].map((scenario) => {
    const rows = sortedRowsForScenario(latestReport.rows, scenario);
    return rows.slice(0, 3).map((r) => ({
      scenario,
      ticker: r.ticker,
      projectedAfterTax: r.projectedAfterTax,
      projectedRealAfterTax: r.projectedRealAfterTax,
      deltaAfterTax: r.deltaAfterTax,
      goalGapAfterTax: r.goalGapAfterTax,
      effectiveAfterTaxAnnual: r.effectiveAfterTaxAnnual,
    }));
  }).flat();

  section('Top Ranked Options (After Tax)');
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Scenario', 'Ticker', 'After-Tax Annualized', 'Projected Nominal', 'Projected Real', 'Vs Mortgage', 'Goal Gap']],
    body: scenarioTop.map((r) => [
      titleCase(r.scenario),
      r.ticker,
      fmtPct(r.effectiveAfterTaxAnnual),
      fmtMoney(r.projectedAfterTax),
      fmtMoney(r.projectedRealAfterTax),
      fmtSignedMoney(r.deltaAfterTax),
      fmtSignedMoney(r.goalGapAfterTax),
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [10, 147, 150] },
  });
  y = doc.lastAutoTable.finalY + 10;

  const activeRows = sortedRowsForScenario(latestReport.rows, latestReport.activeScenario);

  section(`Detailed Breakdown (${titleCase(latestReport.activeScenario)})`);
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Ticker', 'Annual Used', 'After-Tax Annualized', 'Nominal After Tax', 'Real After Tax', 'Vs Mortgage', 'Goal Gap']],
    body: activeRows.map((r) => [
      r.ticker,
      fmtPct(r.annualReturnUsed),
      fmtPct(r.effectiveAfterTaxAnnual),
      fmtMoney(r.projectedAfterTax),
      fmtMoney(r.projectedRealAfterTax),
      fmtSignedMoney(r.deltaAfterTax),
      fmtSignedMoney(r.goalGapAfterTax),
    ]),
    styles: { fontSize: 8.5, cellPadding: 3.5 },
    headStyles: { fillColor: [0, 109, 119] },
  });
  y = doc.lastAutoTable.finalY + 12;

  line('Assumptions & limits: This estimate is not financial advice. It assumes dividend reinvestment when enabled, qualified-dividend taxation on distributions, long-term capital-gains taxation on liquidation when enabled, and static annualized market-condition multipliers. It does not model tax-loss harvesting, transaction costs, expense-ratio drift, or sequence-of-returns simulations.', 9);

  doc.save('bestinvestment-report.pdf');
  shareStatus.textContent = 'Detailed PDF report downloaded.';
}

function runCalculation(evt) {
  evt.preventDefault();
  shareStatus.textContent = '';

  const balance = Number(document.getElementById('balance').value);
  const apr = Number(document.getElementById('rate').value) / 100;
  const deductible = document.getElementById('deductible').checked;
  const taxRate = Number(document.getElementById('tax-rate').value) / 100;
  const deductibleShare = clampPercent(deductibleShareInput.value) / 100;
  const monthsLeft = getMonthsLeft();
  const amount = Number(document.getElementById('amount').value);

  const includeDividends = document.getElementById('include-dividends').checked;
  const ltcgRateRaw = Number(document.getElementById('ltcg-rate').value) / 100;
  const qdivRateRaw = Number(document.getElementById('qdiv-rate').value) / 100;
  const stateTaxRateRaw = Number(document.getElementById('state-tax-rate').value) / 100;
  const liquidateAtHorizon = document.getElementById('liquidate-horizon').checked;
  const inflationRate = Number(document.getElementById('inflation-rate').value) / 100;

  const monthlyPMI = Number(document.getElementById('pmi-monthly').value);
  const cashoutGoalRaw = Number(cashoutGoalInput.value);
  const cashoutGoalText = String(cashoutGoalInput.value).trim();

  const flags = {
    emergency: document.getElementById('emergency').checked,
    highDebt: document.getElementById('high-debt').checked,
    match: document.getElementById('match').checked,
  };

  const invalidTax = deductible && (Number.isNaN(taxRate) || Number.isNaN(deductibleShare) || taxRate < 0 || taxRate > 0.6 || deductibleShare < 0 || deductibleShare > 1);
  const invalidCore = Number.isNaN(balance) || Number.isNaN(apr) || Number.isNaN(monthsLeft) || Number.isNaN(amount) || balance < 0 || apr < 0 || monthsLeft < 1 || amount <= 0;
  const invalidRates = [ltcgRateRaw, qdivRateRaw, stateTaxRateRaw].some((r) => Number.isNaN(r) || r < 0 || r > 0.5);
  const invalidInflation = Number.isNaN(inflationRate) || inflationRate <= -0.99 || inflationRate > 0.2;
  const invalidPmi = Number.isNaN(monthlyPMI) || monthlyPMI < 0;
  const hasGoalInput = cashoutGoalText !== '' && Number(cashoutGoalText) > 0;
  const invalidGoal = cashoutGoalText !== '' && (Number.isNaN(cashoutGoalRaw) || cashoutGoalRaw < 0);

  if (invalidTax || invalidCore || invalidRates || invalidInflation || invalidPmi || invalidGoal) {
    mortgageSummary.textContent = 'Check your inputs and try again.';
    quickResult.textContent = '';
    quickMetrics.textContent = '';
    taxNote.textContent = '';
    mortgageDetail.textContent = '';
    detailsNote.textContent = '';
    return;
  }

  const combinedLtcgRate = clamp(ltcgRateRaw + stateTaxRateRaw, 0, 0.6);
  const combinedQdivRate = clamp(qdivRateRaw + stateTaxRateRaw, 0, 0.6);
  const taxShieldRate = deductible ? clamp(taxRate * deductibleShare, 0, 0.6) : 0;
  const years = monthsLeft / 12;

  const mortgage = mortgageEquivalent({
    balance,
    annualRate: apr,
    months: monthsLeft,
    amount,
    taxShieldRate,
    monthlyPMI,
  });

  if (!mortgage) {
    mortgageSummary.textContent = 'Unable to build mortgage schedule. Check rate/term values.';
    quickResult.textContent = '';
    quickMetrics.textContent = '';
    taxNote.textContent = '';
    mortgageDetail.textContent = '';
    detailsNote.textContent = '';
    return;
  }

  const mortgageReal = mortgage.futureValue / Math.pow(1 + inflationRate, years);
  latestMortgageNominal = mortgage.futureValue;
  latestMortgageHurdleAnnual = Math.pow(mortgage.futureValue / amount, 1 / years) - 1;
  const cashoutGoal = hasGoalInput ? cashoutGoalRaw : mortgage.futureValue;
  mortgageSummary.textContent = `Mortgage option (cash-flow modeled): ${formatMoney(mortgage.futureValue)} nominal equivalent for ${formatMoney(amount)} over ${monthsLeft} months (${formatPct(mortgage.annualEquivalent)} annualized after tax/PMI effects).`;
  taxNote.textContent = deductible
    ? `Mortgage tax assumption: ${formatPct(taxRate)} marginal rate with ${(deductibleShare * 100).toFixed(0)}% deductible share of interest (effective shield ${formatPct(taxShieldRate)}).`
    : 'Mortgage tax assumption: no mortgage-interest deduction applied.';
  mortgageDetail.textContent = `Modeled mortgage effects: interest saved ${formatMoney(mortgage.interestSaved)}, PMI saved ${formatMoney(mortgage.pmiSaved)}, payoff accelerated by ${Math.max(mortgage.monthsSaved, 0)} months. Real (inflation-adjusted) mortgage equivalent: ${formatMoney(mortgageReal)}.`;

  latestRows = [];
  assetsData.forEach((asset) => {
    const rates = scenarioRates(asset);
    const divYield = Number(asset.dividend_yield || 0);

    ['conservative', 'moderate', 'aggressive'].forEach((scenario) => {
      const annualReturnUsed = includeDividends ? rates[scenario] : rates[scenario] - divYield;
      const proj = projectInvestmentAfterTax({
        principal: amount,
        years,
        annualTotalReturn: annualReturnUsed,
        dividendYield: includeDividends ? divYield : 0,
        includeDividends,
        qdivTaxRate: combinedQdivRate,
        ltcgTaxRate: combinedLtcgRate,
        liquidateAtHorizon,
        inflationRate,
      });

      latestRows.push({
        ticker: asset.ticker,
        name: asset.name,
        scenario,
        annualReturnUsed,
        projectedAfterTax: proj.nominalAfterTax,
        projectedRealAfterTax: proj.realAfterTax,
        deltaAfterTax: proj.nominalAfterTax - mortgage.futureValue,
        deltaRealAfterTax: proj.realAfterTax - mortgageReal,
        goalGapAfterTax: proj.nominalAfterTax - cashoutGoal,
        effectiveAfterTaxAnnual: proj.effectiveAfterTaxAnnual,
        liquidationTax: proj.liquidationTax,
      });
    });
  });

  setActiveScenario(activeScenario);
  detailsNote.textContent = `Detailed breakdown assumptions: ${includeDividends ? 'dividends reinvested' : 'dividends not reinvested'}, qualified dividend tax ${formatPct(combinedQdivRate)}, LTCG tax ${formatPct(combinedLtcgRate)}${liquidateAtHorizon ? ' with end-of-horizon sale tax' : ' with no end-of-horizon sale tax'}, inflation ${formatPct(inflationRate)}. Stock cash-out target used: ${formatMoney(cashoutGoal)} (${hasGoalInput ? 'user-entered target' : 'defaulted from mortgage-equivalent target because goal was blank/0'}). Break-even after-tax annual return to match mortgage: ${formatPct(latestMortgageHurdleAnnual)}. Tax treatment assumption follows long-term capital gains/qualified-dividend framework (IRS Topic 409 and IRS Publication 550) and mortgage-interest deduction framework (IRS Publication 936).`;

  renderPriorities(flags);
  latestReport = {
    inputs: {
      balance,
      apr,
      monthsLeft,
      amount,
      deductible,
      cashoutGoal,
      cashoutGoalDefaulted: !hasGoalInput,
    },
    assumptions: {
      includeDividends,
      liquidateAtHorizon,
      combinedLtcgRate,
      combinedQdivRate,
      inflationRate,
      marketConditionMultipliers: { ...marketConditionMultipliers },
    },
    mortgage: {
      futureValue: mortgage.futureValue,
      realFutureValue: mortgageReal,
      annualEquivalent: mortgage.annualEquivalent,
      hurdleAfterTaxAnnual: latestMortgageHurdleAnnual,
      interestSaved: mortgage.interestSaved,
      pmiSaved: mortgage.pmiSaved,
      monthsSaved: Math.max(mortgage.monthsSaved, 0),
    },
    rows: latestRows.map((r) => ({ ...r })),
    activeScenario,
  };
  saveFormState();
}

async function init() {
  setTheme(getPreferredTheme());
  themeToggle.addEventListener('click', handleThemeToggle);
  shareLinkButton.addEventListener('click', handleShareLink);
  exportPdfButton.addEventListener('click', handleExportPdf);
  modeInput.addEventListener('change', updateModeVisibility);
  deductibleInput.addEventListener('change', updateTaxVisibility);
  startDateInput.addEventListener('input', updateModeVisibility);
  startDateInput.addEventListener('blur', updateModeVisibility);
  termYearsInput.addEventListener('input', updateModeVisibility);
  deductibleShareInput.addEventListener('input', syncDeductibleShareFromNumber);
  deductibleShareInput.addEventListener('blur', syncDeductibleShareFromNumber);
  deductibleShareSlider.addEventListener('input', syncDeductibleShareFromSlider);
  form.addEventListener('submit', runCalculation);
  form.addEventListener('input', saveFormState);
  form.addEventListener('change', saveFormState);
  window.addEventListener('resize', handleViewportResize);

  restoreFormState();
  const queryState = readStateFromQuery();
  if (queryState) applyStateObject(queryState);

  initScenarioTabs();
  await loadAssetData();
  buildMonthSuggestions();
  renderAssetTable();
  updateModeVisibility();
  updateTaxVisibility();
  syncDeductibleShareFromNumber();
  form.requestSubmit();
}

init();

