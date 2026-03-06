// MarketPulse — Stock Signal Analyzer + Monthly ROI Tracker
// Uses Yahoo Finance public API (no key required)

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

// ── DOM refs ──
const tickerInput = document.getElementById('ticker-input');
const searchBtn   = document.getElementById('search-btn');
const idleEl      = document.getElementById('idle');
const loadingEl   = document.getElementById('loading');
const errorEl     = document.getElementById('error');
const resultsEl   = document.getElementById('results');

// ── Events ──
searchBtn.addEventListener('click', () => analyze(tickerInput.value.trim().toUpperCase()));
tickerInput.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(tickerInput.value.trim().toUpperCase()); });
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    tickerInput.value = btn.dataset.ticker;
    analyze(btn.dataset.ticker);
  });
});

// ── Fetch ──
async function fetchData(ticker) {
  const target = `${YAHOO_BASE}${encodeURIComponent(ticker)}?interval=1d&range=1y`;

  // Try multiple strategies — direct + CORS proxies
  const urls = [
    target,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
    `https://thingproxy.freeboard.io/fetch/${target}`,
  ];

  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (result) return result;
      throw new Error('No data returned. Check the ticker symbol.');
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Unable to fetch data. Yahoo Finance may be temporarily unavailable. Try again in a moment.');
}

// ── Math helpers ──
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function sma(prices, period) {
  if (prices.length < period) return null;
  return mean(prices.slice(prices.length - period));
}

function ema(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let e = mean(prices.slice(0, period));
  for (let i = period; i < prices.length; i++) {
    e = prices[i] * k + e * (1 - k);
  }
  return e;
}

function rsi(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macdCalc(prices) {
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  if (ema12 === null || ema26 === null) return null;
  return { line: ema12 - ema26, ema12, ema26 };
}

// ── Monthly ROI ──
function computeMonthlyROI(timestamps, closes) {
  // Group closes by YYYY-MM
  const byMonth = {};
  timestamps.forEach((ts, i) => {
    const d = new Date(ts * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(closes[i]);
  });

  const months = Object.keys(byMonth).sort();
  // Need at least 2 months
  if (months.length < 2) return null;

  const monthlyReturns = [];
  for (let i = 1; i < months.length; i++) {
    const prevMonth = byMonth[months[i - 1]];
    const currMonth = byMonth[months[i]];
    const open  = prevMonth[prevMonth.length - 1]; // last close of prev month
    const close = currMonth[currMonth.length - 1]; // last close of curr month
    const ret = ((close - open) / open) * 100;
    monthlyReturns.push({ month: months[i], ret });
  }

  const TARGET = 4.0;
  const avg = mean(monthlyReturns.map(m => m.ret));
  const hitCount = monthlyReturns.filter(m => m.ret >= TARGET).length;
  const hitRate  = (hitCount / monthlyReturns.length) * 100;
  const best     = Math.max(...monthlyReturns.map(m => m.ret));
  const worst    = Math.min(...monthlyReturns.map(m => m.ret));

  return { monthlyReturns, avg, hitCount, hitRate, best, worst, total: monthlyReturns.length };
}

// ── Signal scoring ──
function computeSignal({ price, sma50, sma200, rsiVal, macdData, high52, low52 }) {
  const signals = [];
  let bullishPoints = 0;
  let totalPoints = 0;

  if (rsiVal !== null) {
    totalPoints += 20;
    if (rsiVal < 30) {
      bullishPoints += 20;
      signals.push({ label: 'RSI (14)', value: rsiVal.toFixed(1), signal: 'bullish', desc: 'Oversold — historically a buy zone' });
    } else if (rsiVal > 70) {
      signals.push({ label: 'RSI (14)', value: rsiVal.toFixed(1), signal: 'bearish', desc: 'Overbought — caution territory' });
    } else if (rsiVal >= 45 && rsiVal <= 65) {
      bullishPoints += 14;
      signals.push({ label: 'RSI (14)', value: rsiVal.toFixed(1), signal: 'neutral', desc: 'Healthy momentum range' });
    } else {
      bullishPoints += 8;
      signals.push({ label: 'RSI (14)', value: rsiVal.toFixed(1), signal: 'neutral', desc: 'Neutral momentum' });
    }
  }

  if (macdData !== null) {
    totalPoints += 25;
    if (macdData.line > 0) {
      bullishPoints += 25;
      signals.push({ label: 'MACD', value: macdData.line.toFixed(3), signal: 'bullish', desc: 'MACD above zero — bullish momentum' });
    } else {
      signals.push({ label: 'MACD', value: macdData.line.toFixed(3), signal: 'bearish', desc: 'MACD below zero — bearish momentum' });
    }
  }

  if (sma50 !== null) {
    totalPoints += 20;
    if (price > sma50) {
      bullishPoints += 20;
      signals.push({ label: 'SMA 50', value: fmt(sma50), signal: 'bullish', desc: 'Price above 50-day average — uptrend' });
    } else {
      signals.push({ label: 'SMA 50', value: fmt(sma50), signal: 'bearish', desc: 'Price below 50-day average — downtrend' });
    }
  }

  if (sma200 !== null) {
    totalPoints += 25;
    if (price > sma200) {
      bullishPoints += 25;
      signals.push({ label: 'SMA 200', value: fmt(sma200), signal: 'bullish', desc: 'Above 200-day average — long-term uptrend' });
    } else {
      signals.push({ label: 'SMA 200', value: fmt(sma200), signal: 'bearish', desc: 'Below 200-day average — long-term downtrend' });
    }
  }

  if (high52 && low52) {
    totalPoints += 10;
    const range = high52 - low52;
    const pos = range > 0 ? (price - low52) / range : 0.5;
    if (pos > 0.7) {
      bullishPoints += 10;
      signals.push({ label: '52W Position', value: (pos * 100).toFixed(0) + '%', signal: 'bullish', desc: 'Near 52-week high — strong momentum' });
    } else if (pos < 0.3) {
      signals.push({ label: '52W Position', value: (pos * 100).toFixed(0) + '%', signal: 'bearish', desc: 'Near 52-week low — weak momentum' });
    } else {
      bullishPoints += 5;
      signals.push({ label: '52W Position', value: (pos * 100).toFixed(0) + '%', signal: 'neutral', desc: 'Mid-range — no strong directional bias' });
    }
  }

  const score = totalPoints > 0 ? Math.round((bullishPoints / totalPoints) * 100) : 50;
  const label = score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
  return { label, score, signals };
}

// ── Formatting ──
function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (Math.abs(n) >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toFixed(2);
}

function fmtPct(n, decimals = 1) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

function signalIcon(s) { return s === 'bullish' ? '🟢' : s === 'bearish' ? '🔴' : '🟡'; }
function signalLabel(s) { return s === 'bullish' ? '▲ BULLISH' : s === 'bearish' ? '▼ BEARISH' : '● NEUTRAL'; }

function monthName(key) {
  const [y, m] = key.split('-');
  return new Date(+y, +m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

// ── Show/hide ──
function setState(state) {
  [idleEl, loadingEl, errorEl, resultsEl].forEach(el => el.classList.add('hidden'));
  document.getElementById(state)?.classList.remove('hidden');
}

// ── Render ──
function render(ticker, meta, timestamps, closes) {
  const price     = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] ?? price;
  const change    = price - prevClose;
  const changePct = (change / prevClose) * 100;
  const dir       = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  const sma50Val  = sma(closes, 50);
  const sma200Val = sma(closes, 200);
  const rsiVal    = rsi(closes, 14);
  const macdData  = macdCalc(closes);

  const high52 = meta.fiftyTwoWeekHigh ?? Math.max(...closes);
  const low52  = meta.fiftyTwoWeekLow  ?? Math.min(...closes);
  const volume  = meta.regularMarketVolume;
  const mktCap  = meta.marketCap;

  const { label, score, signals } = computeSignal({
    price, sma50: sma50Val, sma200: sma200Val,
    rsiVal, macdData, high52, low52
  });

  const roi = computeMonthlyROI(timestamps, closes);
  const TARGET = 4.0;

  const summaries = {
    bullish: 'Most technical indicators are aligned positively. Momentum favors buyers.',
    bearish: 'Most technical indicators are pointing down. Momentum favors sellers.',
    neutral: 'Mixed signals — indicators are not clearly aligned in either direction.',
  };

  // Monthly bar chart
  const roiSection = roi ? (() => {
    const barMax = Math.max(Math.abs(roi.best), Math.abs(roi.worst), 8);
    const bars = roi.monthlyReturns.map(m => {
      const hit  = m.ret >= TARGET;
      const neg  = m.ret < 0;
      const pct  = Math.min(Math.abs(m.ret) / barMax * 100, 100);
      const cls  = hit ? 'bar-hit' : neg ? 'bar-neg' : 'bar-neutral';
      return `
        <div class="month-bar-wrap" title="${monthName(m.month)}: ${fmtPct(m.ret)}">
          <div class="month-bar-container">
            <div class="month-bar ${cls}" style="height:${pct}%"></div>
          </div>
          <div class="month-bar-label">${monthName(m.month)}</div>
        </div>`;
    }).join('');

    const roiClass = roi.avg >= TARGET ? 'up' : roi.avg >= 0 ? 'flat' : 'down';
    const targetClass = roi.hitRate >= 50 ? 'up' : 'down';

    return `
      <div class="roi-box">
        <div class="roi-header">
          <div>
            <div class="section-title" style="margin:0">Monthly ROI — 4% Target Tracker</div>
            <div class="roi-subtitle">Based on last ${roi.total} months of real price data</div>
          </div>
          <div class="roi-avg ${roiClass}">${fmtPct(roi.avg)} avg/mo</div>
        </div>

        <div class="roi-stats">
          <div class="roi-stat">
            <div class="roi-stat-label">Avg Monthly Return</div>
            <div class="roi-stat-value ${roiClass}">${fmtPct(roi.avg)}</div>
          </div>
          <div class="roi-stat">
            <div class="roi-stat-label">Hit 4%+ Target</div>
            <div class="roi-stat-value ${targetClass}">${roi.hitCount}/${roi.total} months</div>
          </div>
          <div class="roi-stat">
            <div class="roi-stat-label">Hit Rate</div>
            <div class="roi-stat-value ${targetClass}">${roi.hitRate.toFixed(0)}%</div>
          </div>
          <div class="roi-stat">
            <div class="roi-stat-label">Best Month</div>
            <div class="roi-stat-value up">${fmtPct(roi.best)}</div>
          </div>
          <div class="roi-stat">
            <div class="roi-stat-label">Worst Month</div>
            <div class="roi-stat-value down">${fmtPct(roi.worst)}</div>
          </div>
        </div>

        <div class="bar-chart">
          ${bars}
        </div>
        <div class="bar-legend">
          <span class="legend-dot hit"></span> ≥ 4% target &nbsp;
          <span class="legend-dot neutral-dot"></span> Positive &nbsp;
          <span class="legend-dot neg-dot"></span> Negative
        </div>
      </div>`;
  })() : '';

  resultsEl.innerHTML = `
    <div class="stock-header">
      <div class="stock-name">
        <h2>${ticker}</h2>
        <p>${meta.exchangeName ?? ''} · ${meta.instrumentType ?? 'Equity'}</p>
      </div>
      <div class="stock-price">
        <div class="price-main">${fmt(price)}</div>
        <div class="price-change ${dir}">
          ${change >= 0 ? '+' : ''}${Math.abs(change).toFixed(2)} (${fmtPct(changePct)}) today
        </div>
      </div>
    </div>

    ${roiSection}

    <div class="signal-box">
      <div class="signal-badge ${label}">${signalLabel(label)}</div>
      <div class="signal-score-wrap">
        <div class="signal-score-label">
          <span>Signal Strength</span>
          <strong>${score}/100</strong>
        </div>
        <div class="score-bar">
          <div class="score-fill ${label}" style="width:${score}%"></div>
        </div>
        <div class="signal-summary">${summaries[label]}</div>
      </div>
    </div>

    <div class="section-title">Technical Indicators</div>
    <div class="indicators-grid">
      ${signals.map(s => `
        <div class="indicator-card">
          <div class="ind-label">${s.label}</div>
          <div class="ind-value">${s.value}</div>
          <div class="ind-signal ${s.signal}">${signalIcon(s.signal)} ${s.signal.toUpperCase()}</div>
          <div class="ind-desc">${s.desc}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title">Market Stats</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">52W High</div><div class="stat-value">${fmt(high52)}</div></div>
      <div class="stat-card"><div class="stat-label">52W Low</div><div class="stat-value">${fmt(low52)}</div></div>
      ${volume ? `<div class="stat-card"><div class="stat-label">Volume</div><div class="stat-value">${(volume/1e6).toFixed(1)}M</div></div>` : ''}
      ${mktCap ? `<div class="stat-card"><div class="stat-label">Market Cap</div><div class="stat-value">${fmt(mktCap)}</div></div>` : ''}
      ${sma50Val ? `<div class="stat-card"><div class="stat-label">SMA 50</div><div class="stat-value">${fmt(sma50Val)}</div></div>` : ''}
      ${sma200Val ? `<div class="stat-card"><div class="stat-label">SMA 200</div><div class="stat-value">${fmt(sma200Val)}</div></div>` : ''}
    </div>
  `;

  setState('results');
}

// ── Main ──
async function analyze(ticker) {
  if (!ticker) return;
  tickerInput.value = ticker;
  setState('loading');
  try {
    const result  = await fetchData(ticker);
    const meta    = result.meta;
    const raw     = result.indicators.quote[0].close;
    const ts      = result.timestamp;

    // Filter out null closes with matching timestamps
    const paired = ts.map((t, i) => ({ t, c: raw[i] })).filter(p => p.c !== null);
    const timestamps = paired.map(p => p.t);
    const closes     = paired.map(p => p.c);

    if (closes.length < 30) throw new Error('Not enough historical data for this ticker.');
    render(ticker, meta, timestamps, closes);
  } catch (err) {
    errorEl.textContent = '⚠️ ' + err.message;
    setState('error');
  }
}
