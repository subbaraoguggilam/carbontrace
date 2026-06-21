# 🌿 CarbonTrace — Carbon Footprint Awareness Platform

> **Hack2Skill Virtual Prompt Wars**

CarbonTrace helps individuals understand, track, and reduce their personal carbon footprint through science-backed calculations, personalised insights, and actionable recommendations.

[![Tests](https://img.shields.io/badge/tests-66%20passed-brightgreen)](#testing)
[![Coverage](https://img.shields.io/badge/coverage-94%25-brightgreen)](#testing)
[![Security](https://img.shields.io/badge/security-helmet%20%2B%20rate%20limiting-blue)](#security)
[![Accessibility](https://img.shields.io/badge/accessibility-WCAG%202.1%20AA-blue)](#accessibility)

---

## 🚀 Live Demo

**[REPLACE_WITH_YOUR_RENDER_URL]** _(add your deployed Render URL here after deploying)_

---

## ✨ Features

- **4-category calculator** — Transport, Home energy, Food & diet, Shopping
- **Reference emission factors** — based on publicly cited EPA, IPCC AR6, and IEA figures
- **Personalised recommendations** — sorted by CO₂ impact, not just generic tips
- **Real-world equivalencies** — trees, driving km, phone charges, beef burgers, streaming hours
- **Global benchmarks** — compares your footprint to the global average and the Paris Agreement target
- **Accessible** — WCAG 2.1 AA: skip link, ARIA roles, full keyboard navigation, reduced-motion support
- **Secured API** — Helmet CSP, CORS, rate limiting, input whitelisting, numeric clamping

---

## 🏗️ Architecture

```
carbontrace/
├── server.js                     # Express API server (security middleware + routes)
├── src/
│   ├── utils/
│   │   ├── carbonCalculator.js   # Core emission calculations
│   │   └── validator.js          # Input whitelisting, clamping, sanitisation
│   └── tests/
│       ├── calculator.test.js    # Unit tests for calculator + validator
│       └── server.test.js        # Integration tests for the Express API
└── public/
    └── index.html                # Accessible single-page frontend
```

---

## 🔬 How It Works

### Emission factors

All factors are expressed in **kg CO₂e per unit of activity** and are reasonable, widely-cited approximations suitable for an awareness/education tool (not a certified carbon audit):

| Category         | Example factor                             |
| ---------------- | ------------------------------------------ |
| Petrol car       | 0.192 kg CO₂e/km                           |
| Electric car     | 0.053 kg CO₂e/km                           |
| Grid electricity | 0.233 kg CO₂e/kWh                          |
| Omnivore diet    | 5.63 kg CO₂e/day                           |
| High-meat diet   | 7.19 kg CO₂e/day                           |
| Vegan diet       | 2.89 kg CO₂e/day                           |
| Domestic flight  | 0.255 kg CO₂e/km (incl. radiative forcing) |

Sources referenced when selecting factors: EPA (2023) Emission Factors for Greenhouse Gas Inventories, IPCC AR6 (2021) Ch.8, IEA (2023) CO₂ Emissions from Fuel Combustion, and Our World in Data per-capita comparisons.

### Calculation pipeline

```
User input → Validation & sanitisation → Emission calculation →
Recommendation generation → Equivalency calculation → JSON response → UI render
```

Transport, home, and shopping inputs are collected as **weekly** activity and annualised (× 52). Food is collected as a daily diet factor over a configurable number of days (default 7) and annualised separately.

---

## 🔒 Security

| Control                  | Implementation                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Security headers         | `helmet` (CSP, HSTS, X-Content-Type-Options, etc.)                                                                                |
| Rate limiting            | 100 req/15min globally on `/api/*`, 20 req/min on `/api/calculate`                                                                |
| Input whitelist          | Only known keys per category are accepted; everything else is dropped                                                             |
| Numeric clamping         | All numeric input clamped to `[0, 100000]`                                                                                        |
| JSON body limit          | 10KB max request body                                                                                                             |
| CORS                     | Configurable via `ALLOWED_ORIGIN` env var                                                                                         |
| Request tracing          | UUID (`X-Request-Id`) generated per request                                                                                       |
| No inline event handlers | All `onclick` attributes replaced with a delegated listener + function whitelist, so CSP's `script-src-attr 'none'` default holds |

**Note on CSP:** `script-src` includes `'unsafe-inline'` because the frontend is a single static `index.html` with its logic in one inline `<script>` block, and no per-request nonce is generated for static files. This is documented in `server.js`. If you split the script into an external `.js` file served from `/public`, you can remove `'unsafe-inline'` from `script-src` entirely.

---

## ♿ Accessibility

- Skip-navigation link
- All form inputs labelled with `<label>` and `aria-describedby`
- Results section uses `aria-live` for dynamic content
- Diet selector uses `<fieldset>` / `<legend>` with visible focus rings
- Full keyboard navigation and visible focus styles throughout
- `prefers-reduced-motion` respected
- Semantic HTML5 landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`)
- Colour contrast meets WCAG AA (4.5:1+ for body text)

---

## 🧪 Testing

**66 tests, ~94% statement coverage** (verified by running `npm test` — see output below)

```bash
npm test
```

```
Test Suites: 2 passed, 2 total
Tests:       66 passed, 66 total

File                   | % Stmts | % Branch | % Funcs | % Lines
-----------------------|---------|----------|---------|--------
All files              |   94.47 |    88.37 |   88.46 |   95.33
 server.js             |   83.63 |    64.28 |   66.66 |   83.63
 carbonCalculator.js   |   97.87 |    86.36 |     100 |     100
 validator.js          |     100 |    97.95 |     100 |     100
```

Test coverage areas:

- Transport, home, food, and shopping emission calculations
- Total footprint aggregation and benchmark comparisons
- Recommendation generation and impact-based sorting
- Equivalency calculations (trees, driving km, phone charges, burgers, streaming)
- Input validation & sanitisation (whitelisting, clamping, malformed input)
- Express API integration tests (routes, security headers, error handling)

---

## ⚡ Performance

- **Zero client-side dependencies** — pure HTML/CSS/JS frontend, no build step
- **Single API call per calculation** — no chained requests
- **Static assets** served via Express static middleware
- **10KB body size cap** — limits payload-based abuse

---

## 🛠️ Local Development

### Prerequisites

- Node.js 18+

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/carbontrace
cd carbontrace
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

### Run tests

```bash
npm test          # all tests with coverage
npm run test:unit # verbose output, no coverage report
```

### Environment variables

| Variable         | Default | Description         |
| ---------------- | ------- | ------------------- |
| `PORT`           | `3000`  | Server port         |
| `ALLOWED_ORIGIN` | `*`     | CORS allowed origin |

---

## 📊 API Reference

### `POST /api/calculate`

Calculate total carbon footprint. Transport/home/shopping values are **weekly**; food is daily × `days`.

**Request body:**

```json
{
  "transport": { "car_petrol": 100, "train": 50 },
  "home": { "electricity_kwh": 300, "natural_gas_m3": 20 },
  "food": { "diet": "omnivore", "days": 7 },
  "shopping": { "clothing_item": 2 }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "footprint": {
      "total_kg": 9779.55,
      "total_tonnes": 9.7795,
      "categories": { "transport": { "kg": 1105, "breakdown": {} }, "...": "..." },
      "comparison": { "vs_global_avg": 208.1, "vs_paris_target": 489 }
    },
    "recommendations": [
      {
        "category": "food",
        "action": "Replace red meat with chicken or plant proteins a few times a week",
        "impact_kg_per_year": 178.88,
        "difficulty": "easy",
        "cost_saving": true
      }
    ],
    "equivalencies": {
      "trees_to_offset_annual": 466,
      "km_driving_equivalent": 50935,
      "smartphone_charges": 1164232,
      "beef_burgers_equivalent": 3260,
      "hours_of_streaming": 162992
    }
  },
  "requestId": "c3b09484-9f7d-4f78-a023-601f5e37c8f4"
}
```

### `GET /api/emission-factors`

Returns all emission factors and diet presets used by the calculator.

### `GET /api/equivalencies/:kg`

Returns equivalencies for an arbitrary kg CO₂e value.

### `GET /api/health`

Health check endpoint (used by Render's health check).

---

## 🌍 Impact Context

| Benchmark              | Annual CO₂e  |
| ---------------------- | ------------ |
| Paris Agreement target | 2.0 tonnes   |
| Global average         | 4.7 tonnes   |
| US average             | ~14.5 tonnes |
| India average          | ~1.9 tonnes  |

_(Country averages are commonly cited approximations from Our World in Data; treat as indicative, not precise.)_

---

## 📄 License

MIT License — see [LICENSE](LICENSE)

---

_Built for Hack2Skill Virtual Prompt Wars._
