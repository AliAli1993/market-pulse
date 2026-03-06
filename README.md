# 📈 MarketPulse

A clean, dark-themed stock signal analyzer using real technical indicators.

## What It Does

Search any stock ticker and get an instant signal analysis based on:

| Indicator | What it measures |
|-----------|-----------------|
| **RSI (14)** | Momentum — overbought/oversold conditions |
| **MACD (12/26/9)** | Trend direction and momentum shifts |
| **SMA 50** | Short-term trend (50-day moving average) |
| **SMA 200** | Long-term trend (200-day moving average) |
| **52-Week Position** | Where price sits relative to yearly range |

All five signals are weighted and combined into a **Signal Score (0–100)**:
- **60–100** → Bullish
- **40–59** → Neutral
- **0–39** → Bearish

## Tech

- Pure HTML/CSS/JavaScript — zero dependencies
- Data: Yahoo Finance public API (no API key required)
- All calculations run client-side

## Disclaimer

⚠️ **This is not financial advice.** Technical indicators improve decision-making but do not guarantee outcomes. Always do your own research.

## Run Locally

```bash
open index.html
# or serve it:
python3 -m http.server 8080
```

## Deploy

Works on GitHub Pages, Netlify, Vercel, or any static host.
