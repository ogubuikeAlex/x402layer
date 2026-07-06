# fourotwo mock RWA API

Static layer402-gated merchant for the MVP demo (ADR AD-6).

```bash
npm run build -w @fourotwo/types
node demos/mock-rwa-api/server.js
```

Defaults:

- API: `http://localhost:5000/data/RE-NYC-001`
- Facilitator: `http://localhost:4001`
- Price: `5000` CSPR motes

The first request returns `402` with `PAYMENT-REQUIRED`. A retry with
`PAYMENT-SIGNATURE`, `PAYMENT-REQUIRED`, and `X-FOUROTWO-DID` forwards to
the facilitator `/verify`, then `/settle`, and returns the static asset data.
