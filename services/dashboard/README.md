# @fourotwo/dashboard

Developer dashboard (Next.js 14 App Router + Tailwind). Scaffolded ahead of Milestone 3 (M3-T8) with a working **Facilitator Playground** that exercises the
Milestone 1 backend.

## Pages

| Route         | Status                                                       |
| ------------- | ------------------------------------------------------------ |
| `/`           | Overview + live facilitator status (`/health`, `/supported`) |
| `/playground` | Runs a real `/verify → /settle` loop against the facilitator |
| `/agents`     | Placeholder (M3-T9/T11/T12)                                  |
| `/wallet`     | Placeholder (M3-T10)                                         |

## Run

```bash
cp .env.example .env          # FACILITATOR_URL, default http://localhost:4001
# start the facilitator first (in the repo root):
npm run dev -w @fourotwo/facilitator
# then the dashboard:
npm run dev -w @fourotwo/dashboard      # http://localhost:3000
```

Open <http://localhost:3000/playground> and click **Run payment loop** to watch a
signed Casper layer402 payment flow through verify → settle and produce a signed
receipt.
