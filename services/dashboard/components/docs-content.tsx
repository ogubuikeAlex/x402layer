'use client';

import type { ReactNode } from 'react';

import {
  Callout,
  CodeBlock,
  DocH2,
  DocH3,
  DocTable,
  Endpoint,
  KeyVal,
  Prose,
  type DocStatus,
} from './docs';

export interface DocTab {
  id: string;
  label: string;
  blurb: string;
  status: DocStatus;
  content: ReactNode;
}

const code = (s: string) => <code className="bg-surface px-1.5 py-0.5 text-accent">{s}</code>;

export const TABS: DocTab[] = [
  /* ─────────────────────────── OVERVIEW ─────────────────────────── */
  {
    id: 'overview',
    label: 'Overview',
    blurb: 'What layer402 is and how the pieces fit.',
    status: 'mvp',
    content: (
      <>
        <DocH2>The trust & settlement layer for x402</DocH2>
        <Prose>
          x402 solved the mechanics of agent-to-API payments - but every payment is effectively
          anonymous, settlement is fragmented and costly at scale, and funding an agent wallet is a
          UX nightmare. layer402 is the compliance and intelligence layer on top of x402: it verifies
          and settles payments <em>and</em> attaches a verifiable trust score to every transaction.
        </Prose>

        <DocH3>The three components</DocH3>
        <DocTable
          headers={['Component', 'Role', 'Status']}
          rows={[
            [
              'Facilitator',
              'Standards-compliant x402 verify/settle with smart routing + trust enrichment',
              'Live: verify, settle (direct + batch), fees + on-chain collection, supported, metrics; optional upstream Casper facilitator delegation',
            ],
            [
              'KYX Registry',
              'Agent DIDs, operator KYC, composable trust scores',
              'Live: MongoDB store, email magic links, operator usernames, paginated search, on-chain backfill',
            ],
            [
              'Client SDK',
              'Auto-handles 402, signs with DID, spend budget, local ledger',
              'Live: TypeScript (@fourotwo/agent-sdk) + Python (fourotwo-agent-sdk) with cross-language signature parity',
            ],
          ]}
        />

        <DocH3>The MVP loop</DocH3>
        <Prose>
          The whole product proves one loop: <strong>pay → verify → settle → score</strong>.
        </Prose>
        <CodeBlock
          lang="flow"
          code={`1. Agent SDK calls a 402-gated API
2. SDK signs an x402 payment, attaches its DID, retries
3. Merchant forwards payload → facilitator POST /verify
4. Facilitator checks signature + replay + trust, returns verification_id
5. Merchant calls POST /settle → direct on-chain settlement + signed receipt
6. Trust score recomputed for the paying agent → visible in the dashboard`}
        />

        <DocH2>Architecture</DocH2>
        <CodeBlock
          lang="ascii"
          code={`  Agent (Client SDK) ──HTTP──► API Provider (server middleware)
          │                          │
          │ signs w/ DID             │ points to layer402 facilitator
          ▼                          ▼
   ┌───────────────────────────────────────────┐
   │              layer402 facilitator                                   │
   │  /verify  /settle  /supported  /trust                              │
   │     │           │                                                 │
   │     └─ trust ───┴─ chain adapter (AD-2) ───┼──► Casper | Base
   └───────────────────────────────────────────┘
                     │
              KYX Registry (DIDs, trust scores)  ──► KyxRegistry contract`}
        />
        <Callout>
          Chain-specific code lives behind a <strong>ChainAdapter</strong> interface (ADR AD-2).
          Casper is the primary path; Base is the fallback. The facilitator core never imports chain
          code directly.
        </Callout>
        <Callout>
          <strong>Extends Casper&apos;s official facilitator.</strong> layer402 doesn&apos;t compete
          with the{' '}
          <a
            href="https://docs.cspr.cloud/x402-facilitator-api"
            className="text-accent underline"
            target="_blank"
            rel="noreferrer"
          >
            Casper x402 Facilitator
          </a>{' '}
          (CSPR.cloud, part of the Casper AI Toolkit) - it can delegate on-chain settlement to it and
          add identity, trust, receipts and batching on top. See{' '}
          <em>Extend the Casper x402 Facilitator</em> under Facilitator.
        </Callout>
      </>
    ),
  },

  /* ─────────────────────────── FACILITATOR ─────────────────────────── */
  {
    id: 'facilitator',
    label: 'Facilitator',
    blurb: 'verify · settle · supported endpoints.',
    status: 'mvp',
    content: (
      <>
        <DocH2>Facilitator API</DocH2>
        <Prose>
          A standards-compliant x402 facilitator any server can point to. It adds smart settlement
          routing and trust enrichment on top of the base spec. Default port {code('4001')}.
        </Prose>

        <Endpoint method="POST" path="/verify" status="mvp">
          Verify a payment payload before settling. Servers call this on every 402 retry.
        </Endpoint>
        <Prose>Request body - {code('payment_signature')} is base64 of {code('{ payer, signature }')}:</Prose>
        <CodeBlock
          lang="json"
          code={`{
  "payment_signature": "<base64 of {\\"payer\\":\\"<pubkey hex>\\",\\"signature\\":\\"<hex|base64>\\"}>",
  "payment_required": "<base64 PAYMENT-REQUIRED envelope>",
  "agent_did": "did:fourotwo:casper:<account-hash>"
}`}
        />
        <Prose>Verification order (FR-5):</Prose>
        <CodeBlock
          lang="steps"
          code={`1. Decode + validate the PAYMENT-REQUIRED envelope
2. Check expiry
3. Verify the signature via the network's ChainAdapter (ed25519 / EIP-3009)
4. Check the replay cache (in-memory, 120s TTL)
5. Resolve the agent DID → trust summary (BLOCKED / min-score gating)
6. Confirm payer balance (best-effort if no live node)
7. Return valid:true + verification_id + agent_trust`}
        />
        <Prose>Success response:</Prose>
        <CodeBlock
          lang="json"
          code={`{
  "valid": true,
  "agent_trust": { "did": "...", "trust_score": null, "trust_pending": true, ... },
  "settlement_recommendation": "direct",
  "verification_id": "vrf_..."
}`}
        />
        <Callout tone="warn">
          When {code('KYX_REGISTRY_URL')} is set, /verify reads live trust summaries from the KYX
          Registry. If KYX is down, payment verification still runs and the trust summary carries{' '}
          {code('trust_unavailable: true')}.
        </Callout>

        <Endpoint method="POST" path="/settle" status="live">
          Settle a verified payment. Direct or batched; every settlement accrues the platform fee.
        </Endpoint>
        <CodeBlock
          lang="json"
          code={`// request
{ "verification_id": "vrf_...", "settlement_mode": "auto" }   // auto | direct | batch

// response
{
  "settlement_id": "stl_...",
  "status": "pending",
  "mode": "direct",             // "batch" adds batch_id; receipt is signed immediately either way
  "fee_motes": "2500000",       // FOUROTWO_FEE_BPS of amount (default 10 bps)
  "receipt": { ...SettlementReceipt, "feeMotes": "2500000", "facilitatorSignature": "<ed25519 hex>" }
}`}
        />

        <Endpoint method="POST" path="/batch/settle" status="live">
          Force-flush the pending batch: one aggregated SettlementVault record settles the whole
          queue (window: BATCH_WINDOW_MS, early flush at BATCH_MAX_PENDING).
        </Endpoint>
        <Endpoint method="GET" path="/batch/status" status="live">
          Live queue state: pending count, queued motes, window, last flush.
        </Endpoint>
        <Endpoint method="GET" path="/fees" status="live">
          Platform revenue report (admin token): accrued bps fees, totals, per-merchant breakdown,
          and collected vs uncollected. Persisted to FEES_DATA_FILE (or MongoDB when configured).
        </Endpoint>
        <Endpoint method="POST" path="/fees/collect" status="live">
          Sweep accrued fees on-chain to the fee recipient (admin token). Disabled unless fee
          collection is enabled - see <strong>Fees &amp; collection</strong> below.
        </Endpoint>
        <Endpoint method="GET" path="/supported" status="live">
          x402-v2 capability advertisement: networks, tokens, features, fee_bps, batch config.
        </Endpoint>
        <Endpoint method="GET" path="/metrics" status="live">
          Prometheus text exposition: per-route request counts/latency + verification/settlement
          counters.
        </Endpoint>
        <Endpoint method="GET" path="/trust/{did}" status="live">
          Public trust score query served by the KYX Registry.
        </Endpoint>

        <DocH3>Rejection reasons</DocH3>
        <DocTable
          headers={['reason', 'meaning']}
          rows={[
            ['SIGNATURE_INVALID', 'Signature does not verify against the payer'],
            ['EXPIRED', 'Envelope expiry is in the past'],
            ['REPLAYED', 'Nonce already seen within the 120s window'],
            ['AGENT_NOT_REGISTERED', 'DID unknown to the registry'],
            ['AGENT_BLOCKED', 'Agent is BLOCKED or below merchant min score'],
            ['INSUFFICIENT_BALANCE', 'Payer balance below required amount'],
            ['DID_KEY_MISMATCH', 'Signing key does not own the claimed agent DID'],
            ['TRUST_UNAVAILABLE', 'Trust registry unreachable - verification fails closed'],
            ['BALANCE_UNAVAILABLE', 'Payer balance could not be read - fails closed'],
            ['UNSUPPORTED_NETWORK', 'No adapter for the envelope network'],
            ['MALFORMED_PAYLOAD', 'Envelope / signature / DID could not be parsed'],
          ]}
        />

        <DocH3>Fees &amp; collection</DocH3>
        <Prose>
          Every settlement accrues a basis-point platform fee ({code('FOUROTWO_FEE_BPS')}, default
          10 = 0.10%) to the fee recipient. By default fees are only <strong>accrued</strong> (tracked
          as owed) - nothing moves on-chain. Set {code('FEE_COLLECTION_ENABLED=true')} (plus a
          facilitator key and a {code('FOUROTWO_FEE_RECIPIENT')} Casper <strong>public key</strong>) to
          enable {code('POST /fees/collect')}, which sweeps all uncollected fees to the recipient in
          one native transfer and marks them collected. Native transfers have a 2.5 CSPR minimum, so
          collection only fires once accrued fees clear that floor. {code('GET /fees')} reports the
          collected vs uncollected split.
        </Prose>

        <DocH3>Extend the Casper x402 Facilitator</DocH3>
        <Prose>
          Rather than broadcasting its own settlement, the facilitator can <strong>delegate</strong>
          the on-chain settle to the official{' '}
          <a
            href="https://docs.cspr.cloud/x402-facilitator-api"
            className="text-accent underline"
            target="_blank"
            rel="noreferrer"
          >
            Casper x402 Facilitator
          </a>{' '}
          (CSPR.cloud) and keep everything we add on top - DID&rarr;key binding, trust gating, signed
          receipts, batching, vault records and fees. Set {code('UPSTREAM_FACILITATOR_URL')} to turn it
          on. That scheme settles <strong>CEP-18</strong> tokens authorized by an EIP-712{' '}
          {code('transfer_with_authorization')} signature; the agent SDK ships{' '}
          {code('createCasperX402Payment()')} to produce those payloads and{' '}
          {code('verifyCasperX402Payment()')} to confirm acceptance against the upstream{' '}
          {code('/verify')} before relying on it.
        </Prose>
        <CodeBlock
          lang="bash"
          code={`# facilitator env - delegate settlement to the upstream Casper x402 facilitator
UPSTREAM_FACILITATOR_URL=https://x402-facilitator.cspr.cloud
UPSTREAM_FACILITATOR_ACCESS_TOKEN=<cspr.cloud access token>
UPSTREAM_FACILITATOR_NETWORK=casper:casper-test        # or casper:casper (mainnet)
UPSTREAM_FACILITATOR_ASSET=<CEP-18 contract package hash>
UPSTREAM_FACILITATOR_ASSET_METADATA={"name":"Cep18x402","version":"1","decimals":"2","symbol":"CSPR"}`}
        />
      </>
    ),
  },

  /* ─────────────────────────── KYX & TRUST ─────────────────────────── */
  {
    id: 'kyx',
    label: 'KYX & Trust',
    blurb: 'Agent identity (DID) + trust scoring.',
    status: 'mvp',
    content: (
      <>
        <DocH2>KYX Registry & trust scoring</DocH2>
        <Prose>
          The identity backbone. Developers register an agent once; registration produces an on-chain
          DID linked to a KYC&apos;d operator, and every settled transaction contributes to a public,
          composable trust score. Storage is <strong>MongoDB</strong> when {code('MONGODB_URI')} is
          set (required on ephemeral-disk hosts) with the JSON-file store as the local-dev fallback.
          Casper writes stay non-blocking (AD-3) and a <strong>startup backfill</strong> retries any
          agent whose on-chain registration previously failed.
        </Prose>

        <DocH3>Operator usernames (pseudonyms)</DocH3>
        <Prose>
          Operators carry a unique, case-insensitive {code('username')} chosen at verify-request time
          (auto-generated from the email hash if omitted). Public agent listings show{' '}
          {code('@username')} - <strong>operator emails never leave the registry</strong>. Agent
          names are globally unique (case-insensitive).
        </Prose>

        <DocH3>DID format</DocH3>
        <CodeBlock lang="text" code={`did:fourotwo:{network}:{address}
# casper → blake2b account hash, base → EVM address
did:fourotwo:casper:3d5de8c609159a0954e773dd686fb7724428316cb30e00bdc...`}
        />
        <Callout>
          DID derivation lives in the shared {code('@fourotwo/types')} package, so the SDK and the
          registry derive byte-identical DIDs (no drift).
        </Callout>

        <DocH3>Trust score - MVP (3 of 5 dimensions)</DocH3>
        <DocTable
          headers={['Dimension', 'MVP weight', 'Status']}
          rows={[
            ['Payment completion rate', '50%', 'mvp'],
            ['Operator verification (KYC)', '30%', 'mvp'],
            ['Volume tier', '20%', 'mvp'],
            ['Behavioral consistency', '- (25% in v2)', 'upcoming'],
            ['Dispute rate', '- (10% in v2)', 'upcoming'],
          ]}
        />
        <CodeBlock
          lang="ts"
          code={`// MVP scorer (AD-7)
score = 0.5 * completionRate
      + 0.3 * (operatorVerified ? 1 : 0)
      + 0.2 * volumeTierScore;   // 0-100`}
        />

        <DocH3>Trust tiers</DocH3>
        <DocTable
          headers={['Score', 'Tier', 'Meaning']}
          rows={[
            ['90-100', <span className="text-accent3">ELITE</span>, 'Long track record, KYC, ~0 disputes'],
            ['70-89', <span className="text-accent3">VERIFIED</span>, 'Established agent, good settlement history'],
            ['40-69', <span className="text-accent">STANDARD</span>, 'Verified operator, building a track record'],
            ['1-39', <span className="text-accent-warn">RESTRICTED</span>, 'New agent (no history yet) or anomalous - earn trust by settling'],
            ['0', <span className="text-accent2">BLOCKED</span>, 'Known fraud / active dispute'],
          ]}
        />
        <Prose>
          Trust is <strong>earned, not granted</strong>: a brand-new agent - even under a verified
          operator - starts around <strong>30 (RESTRICTED)</strong>, because completion rate and volume
          are both zero with no settled history. Each confirmed settlement raises the score; a few
          successful settlements move an agent into VERIFIED.
        </Prose>

        <DocH3>Operator verification</DocH3>
        <Prose>
          Email magic-link verification (AD-4): with SMTP configured (nodemailer + a Gmail App
          Password) the link is <strong>actually emailed</strong> and {code('dev_token')} disappears
          from the API response; unconfigured local dev keeps the token-in-response flow. Tokens are
          single-use and re-requests for verified operators are idempotent
          ({code('already_verified')}). The full document-verification pipeline is post-MVP.
        </Prose>

        <Endpoint method="GET" path="/agents" status="live">
          Paginated + searchable listing ({code('q')}, {code('page')}, {code('limit')}); returns
          operator usernames, never emails.
        </Endpoint>
        <Endpoint method="POST" path="/agents/register" status="live">
          Register an agent DID. Requires a verified operator email; agent name is globally unique.
        </Endpoint>
        <Endpoint method="GET" path="/trust/{did}" status="live">
          Public trust profile (sub-second, reads off-chain DB - AD-3).
        </Endpoint>
        <Endpoint method="GET" path="/metrics" status="live">
          Prometheus metrics: registrations, settlements ingested, emails sent, on-chain writes.
        </Endpoint>
      </>
    ),
  },

  /* ─────────────────────────── CONTRACTS ─────────────────────────── */
  {
    id: 'contracts',
    label: 'Contracts',
    blurb: 'Casper smart contracts (Rust / Odra).',
    status: 'mvp',
    content: (
      <>
        <DocH2>Casper contracts</DocH2>
        <Prose>
          Written with the Odra framework. Unit-tested against the MockVM ({code('cargo test')}),
          compiled to WASM ({code('cargo odra build')}), deployed to Casper Testnet.
        </Prose>
        <KeyVal
          items={[
            ['network', 'casper-test'],
            ['node rpc', 'rpc.testnet.casperlabs.io/rpc'],
            ['explorer', 'testnet.cspr.live'],
            ['framework', 'Odra (Rust)'],
          ]}
        />

        <DocH2 status="mvp">KyxRegistry</DocH2>
        <Prose>Agent identity + trust score registry. Score writes are restricted to the facilitator service account.</Prose>
        <CodeBlock
          lang="rust"
          code={`register_agent(did, operator, agent_name, public_key)  // reverts on dup pubkey/DID
get_agent(did) -> Option<AgentRecord>
update_trust_score(did, score, tier, completion_bps, txs, disputes)  // facilitator only
get_trust_score(did) -> Option<TrustScoreRecord>
set_kyc_verified(did, verified)                       // facilitator only`}
        />

        <DocH2 status="mvp">SettlementVault</DocH2>
        <Prose>On-chain record of settled payments. Cross-checks the DID exists in KyxRegistry before recording.</Prose>
        <CodeBlock
          lang="rust"
          code={`record_settlement(did, amount, recipient, settlement_id, trust_score)  // facilitator only
get_settlement(settlement_id) -> Option<SettlementRecord>`}
        />

        <DocH2 status="planned">BatchSettler</DocH2>
        <Prose>
          Accepts batched settlement instructions from the facilitator (post-MVP, paired with the
          batch settlement mode).
        </Prose>

        <Callout>
          <strong>Deployed on casper-test</strong> - hashes in{' '}
          {code('contracts/deployed-addresses.json')}: KyxRegistry{' '}
          {code('hash-1e2b354d…a312d0')} and SettlementVault {code('hash-7601c689…a0ecf6')}. The
          registry backfills failed on-chain registrations at startup, and batched settlements write
          one aggregated vault record per flush.
        </Callout>
      </>
    ),
  },

  /* ─────────────────────────── SDK ─────────────────────────── */
  {
    id: 'sdk',
    label: 'Client SDK',
    blurb: 'Agent wallet toolkit - auto 402 handling.',
    status: 'mvp',
    content: (
      <>
        <DocH2 status="live">@fourotwo/agent-sdk + fourotwo-agent-sdk (Python)</DocH2>
        <Prose>
          A drop-in {code('fetch')} replacement that handles the entire x402 client flow: detect 402,
          parse terms, check budget, sign with the agent&apos;s DID, retry, and log. Ships in
          TypeScript ({code('@fourotwo/agent-sdk')}, npm) and Python ({code('fourotwo-agent-sdk')},{' '}
          {code('packages/agent-sdk-py')}) - the Python port is verified byte-identical against TS
          vectors for DIDs, canonical messages, and ed25519 signatures.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`import { fourotwoAgent } from '@fourotwo/agent-sdk';

const agent = new fourotwoAgent({
  did: process.env.FOUROTWO_AGENT_DID,
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY,   // never leaves the client
  budget: { dailyTokens: 10.0, perRequestTokens: 0.5 }, // whole-token limits
  network: 'casper',
});

// replaces fetch - handles 402 automatically
const res = await agent.fetch('https://mock-rwa-api.fourotwo.io/data/RE-NYC-001');
const data = await res.json();`}
        />

        <DocH3>Under the hood on a 402</DocH3>
        <CodeBlock
          lang="steps"
          code={`1. Receive 402 + PAYMENT-REQUIRED header
2. Decode terms (amount, recipient, network, expiry)
3. Check daily + per-request budget - abort if exceeded
4. Sign the canonical envelope with the agent key
5. Attach DID, retry with PAYMENT-SIGNATURE header
6. Log the payment to the local ledger; return the response`}
        />

        <DocH3>Spend budget (AD-5)</DocH3>
        <Prose>
          Budgets <strong>reject</strong>, they do not queue. Exceeding a daily or per-request limit
          throws {code('BudgetExceededError')} before the payment is ever signed. The daily counter
          resets at UTC midnight.
        </Prose>

        <DocH3>Reference consumer - RWA Oracle Agent</DocH3>
        <Prose>
          {code('demos/rwa-oracle-agent')} is the first SDK consumer (M2-T7). It optionally
          self-registers in the KYX registry, then drives the full 402→pay→settle→data loop against
          the mock merchant with zero manual signing.
        </Prose>
        <CodeBlock
          lang="bash"
          code={`node demos/mock-rwa-api/server.js              # :5000
node demos/rwa-oracle-agent/agent.mjs         # runs the loop, logs each step`}
        />
      </>
    ),
  },

  /* ─────────────────────────── DASHBOARD ─────────────────────────── */
  {
    id: 'dashboard',
    label: 'Dashboard',
    blurb: 'This app - pages and live demo.',
    status: 'mvp',
    content: (
      <>
        <DocH2>Developer dashboard</DocH2>
        <Prose>
          Next.js 14 (App Router) + Tailwind. Dark technical-lab design system (see {code('design.md')}).
          Custom cursor, grid/noise overlays, scroll reveals, animated counters.
        </Prose>
        <DocTable
          headers={['Route', 'Purpose', 'Status']}
          rows={[
            ['/', 'Overview + live facilitator status', 'live'],
            ['/playground', 'Live /verify → /settle demo loop', 'live'],
            ['/docs', 'Public, user-facing platform docs + API reference', 'live'],
            ['/xfourohtwo-daducks', 'These internal developer docs (unlinked)', 'live'],
            ['/agents', 'Search + paginated agent list, registration (username + email), per-agent transaction refresh', 'live'],
            ['/agents/[did]', 'Agent detail + transaction history', 'live'],
            ['/wallet', 'CSPR balance + faucet funding', 'live'],
            ['/api/health', 'Aggregate uptime probe (503 when registry/facilitator down)', 'live'],
          ]}
        />

        <DocH3>Playground</DocH3>
        <Prose>
          The Playground crafts a real signed Casper payment and runs it through the live facilitator,
          rendering each step of the verify→settle trace and the signed receipt. It is the visual twin
          of the Milestone&nbsp;1 curl test.
        </Prose>

        <DocH3>Run it</DocH3>
        <CodeBlock
          lang="bash"
          code={`# start the facilitator
npm run dev -w @fourotwo/facilitator     # :4001
# start the dashboard
npm run dev -w @fourotwo/dashboard       # :3000  → open /playground`}
        />
        <Callout>
          The dashboard reads {code('FACILITATOR_URL')} (default {code('http://localhost:4001')}) for
          the status panel and the Playground demo route.
        </Callout>

        <DocH3>Agents, wallet & trust (Milestone 3)</DocH3>
        <Prose>
          Shipped: agent registration with in-browser keypair generation (AD-8 - the private key
          never touches a server), wallet balance via CSPR.cloud + faucet funding, the transaction
          history table, and trust-score cards with the full dimension breakdown.
        </Prose>
      </>
    ),
  },

  /* ─────────────────────────── DATA MODELS ─────────────────────────── */
  {
    id: 'models',
    label: 'Data Models',
    blurb: 'Shared TypeScript types.',
    status: 'mvp',
    content: (
      <>
        <DocH2>Data models</DocH2>
        <Prose>
          Shared via {code('@fourotwo/types')} so the facilitator, SDK, registry, and dashboard never
          drift on shapes.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`interface TrustScore {
  did: string;
  score: number;            // 0-100
  tier: TrustTier;
  dimensions: TrustDimensions;
  history: TrustHistory;
  flags: string[];
  lastUpdated: string;
}

interface SettlementReceipt {
  settlementId: string;
  did: string;
  amount: string;           // token smallest unit
  token: string;
  network: ChainNetwork;
  settlementMode: 'direct' | 'batch' | 'channel' | 'l2';
  txHash?: string;
  batchId?: string;         // present for batched settlements
  feeMotes?: string;        // platform fee accrued on this settlement
  trustScore: number;       // score at settlement time
  settledAt: string;
  facilitatorSignature: string;   // layer402 signs every receipt
}

type TrustTier   = 'ELITE' | 'VERIFIED' | 'STANDARD' | 'RESTRICTED' | 'BLOCKED';
type ChainNetwork = 'base' | 'casper' | 'solana' | 'stellar' | 'polygon';`}
        />

        <DocH3>PAYMENT-REQUIRED envelope</DocH3>
        <CodeBlock
          lang="ts"
          code={`interface PaymentRequired {
  amount: string;     // smallest unit
  recipient: string;
  network: ChainNetwork;
  token: string;
  expiry: number;     // unix seconds
  nonce: string;      // replay protection
  facilitator?: string;
  minTrustScore?: number;
}`}
        />
        <Callout>
          The bytes that are signed are produced by {code('canonicalPaymentMessage()')} - a fixed
          field order shared by signer and verifier. Changing it breaks every signature.
        </Callout>
      </>
    ),
  },

  /* ─────────────────────────── SETTLEMENT & SECURITY ─────────────────────────── */
  {
    id: 'settlement',
    label: 'Settlement & Security',
    blurb: 'Routing modes + threat model.',
    status: 'upcoming',
    content: (
      <>
        <DocH2>Settlement modes</DocH2>
        <DocTable
          headers={['Mode', 'When', 'Status']}
          rows={[
            ['Direct on-chain', 'First-time pairs, large transactions', 'live'],
            ['Batched', 'Many low-value settlements → one vault record per 60s window / 200 pending / manual flush', 'live'],
            ['Payment channel', 'High-frequency trusted pairs (off-chain)', 'planned'],
            ['L2 / rollup', 'When base-chain gas spikes', 'planned'],
          ]}
        />
        <Prose>
          {code('settlement_mode: "auto"')} settles direct by default; set{' '}
          {code('BATCH_AUTO_THRESHOLD_MOTES')} and auto routes payments at/below the threshold into
          the batch queue ({code('/verify')} then recommends {code('batch')}). Receipts are signed at
          enqueue time - only the on-chain write is deferred.
        </Prose>

        <DocH2>Platform fees</DocH2>
        <Prose>
          Every settlement (facilitator or SDK path - both funnel through {code('/settle')}) accrues{' '}
          {code('FOUROTWO_FEE_BPS')} (default 10 bps = 0.10%) to {code('FOUROTWO_FEE_RECIPIENT')}.
          Fees ride on the signed receipt ({code('feeMotes')}) and aggregate at {code('GET /fees')} -
          the collection report a periodic sweep settles against.
        </Prose>

        <DocH2>Security model</DocH2>
        <DocTable
          headers={['Threat', 'Mitigation', 'Status']}
          rows={[
            ['Replay attack', '120s TTL cache keyed by network + nonce', 'mvp'],
            ['Private key theft', 'Keys generated client-side, never sent to servers (AD-8)', 'mvp'],
            ['Trust farming / Sybil', 'Operator KYC + self-payment detection', 'upcoming'],
            ['Fake 402 server', 'SDK validates merchant signature before signing', 'upcoming'],
            ['Channel state fraud', '24h challenge period, last signed state wins', 'planned'],
          ]}
        />
        <Callout tone="warn">
          MVP simplifications (per the ADR): off-chain trust score with best-effort on-chain sync
          (AD-3), email magic-link operator verification instead of full document KYC (AD-4),
          reject-don&apos;t-queue budgets (AD-5).
        </Callout>
      </>
    ),
  },

  /* ─────────────────────────── ROADMAP ─────────────────────────── */
  {
    id: 'roadmap',
    label: 'Roadmap',
    blurb: 'What is built and what is next.',
    status: 'planned',
    content: (
      <>
        <DocH2 status="mvp">Now - Hackathon MVP</DocH2>
        <Prose>Casper Agentic Buildathon submission. The pay→verify→settle→score loop, end to end.</Prose>
        <DocTable
          headers={['Milestone', 'Scope', 'Status']}
          rows={[
            [
              'M1',
              'Contracts + facilitator core (verify/settle/supported)',
              <span className="text-accent3">built</span>,
            ],
            [
              'M2',
              'TypeScript SDK + mock RWA merchant + RWA Oracle Agent (live 402→settle loop)',
              <span className="text-accent3">built</span>,
            ],
            [
              'M3',
              'KYX registry + trust scoring + dashboard (registration, wallet, history, trust)',
              <span className="text-accent3">built*</span>,
            ],
            ['M4', 'Reliability pass, README, demo video, submission', <span className="text-text-dim">next</span>],
            [
              'Post-MVP (shipped)',
              'MongoDB store · emailed magic links · operator usernames · paginated agent search · autonomous Atlas payments · Python SDK · batched settlement · platform fees · /metrics + /health monitoring',
              <span className="text-accent3">built</span>,
            ],
          ]}
        />
        <Callout tone="warn">
          <strong>* One item carries the same testnet-deploy caveat as M1:</strong> on-chain
          trust-score sync (M3-T7) is a non-blocking write-behind stub pending the funded testnet
          deploy (acceptable under AD-3). Everything else in M1-M3 is implemented and the full
          pay→verify→settle→score loop runs end to end - 21 passing unit tests plus a live RWA Oracle
          Agent demo.
        </Callout>

        <DocH2 status="upcoming">Q3 2026 - Foundation</DocH2>
        <Prose>
          Open-source SDK (TS + Python), facilitator on Base + Casper mainnet, basic trust scoring
          live, dashboard closed beta, 10 design-partner API providers.
        </Prose>

        <DocH2 status="planned">Q4 2026 - Trust layer</DocH2>
        <Prose>
          Full KYC pipeline, trust score v2 (behavioral consistency), public API marketplace, fiat
          onramp, payment channels beta for ELITE agents.
        </Prose>

        <DocH2 status="planned">2027 - Scale & protocol</DocH2>
        <Prose>
          Multi-chain (Solana, Polygon, Stellar), L2 settlement routing, enterprise tier, batched
          settlement GA, and contributing a KYX credential spec to the x402 Foundation.
        </Prose>
      </>
    ),
  },
];
