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
              'MVP: verify, settle (direct), supported',
            ],
            [
              'KYX Registry',
              'Agent DIDs, operator KYC, composable trust scores',
              'MVP: registration + 3-dimension scoring + settlement ingestion',
            ],
            [
              'Client SDK',
              'Auto-handles 402, signs with DID, spend budget, local ledger',
              'MVP: TypeScript SDK + mock RWA merchant',
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

        <Endpoint method="POST" path="/settle" status="mvp">
          Settle a verified payment. Direct on-chain mode in MVP; returns a signed receipt.
        </Endpoint>
        <CodeBlock
          lang="json"
          code={`// request
{ "verification_id": "vrf_...", "settlement_mode": "auto" }   // auto | direct

// response
{
  "settlement_id": "stl_...",
  "status": "pending",
  "mode": "direct",
  "receipt": { ...SettlementReceipt, "facilitatorSignature": "<ed25519 hex>" }
}`}
        />

        <Endpoint method="GET" path="/supported" status="mvp">
          x402-v2 capability advertisement: networks, tokens, features.
        </Endpoint>
        <Endpoint method="POST" path="/operators/verify-request" status="mvp">
          Request an email magic link. Local dev logs and returns the token.
        </Endpoint>
        <Endpoint method="GET" path="/operators/verify/:token" status="mvp">
          Mark the operator email as verified.
        </Endpoint>
        <Endpoint method="GET" path="/trust/{did}" status="mvp">
          Public trust score query served by the KYX Registry.
        </Endpoint>
        <Endpoint method="POST" path="/batch/settle" status="planned">
          Force-flush a payer's pending batch (post-MVP settlement mode).
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
            ['UNSUPPORTED_NETWORK', 'No adapter for the envelope network'],
            ['MALFORMED_PAYLOAD', 'Envelope / signature / DID could not be parsed'],
          ]}
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
          composable trust score. The MVP service is file-backed for local demo reliability and keeps
          Casper writes as non-blocking sync hooks (AD-3).
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
            ['70-89', <span className="text-accent3">VERIFIED</span>, 'Established agent, good history'],
            ['40-69', <span className="text-accent">STANDARD</span>, 'New / unverified agent'],
            ['1-39', <span className="text-accent-warn">RESTRICTED</span>, 'Anomalous or failed KYC'],
            ['0', <span className="text-accent2">BLOCKED</span>, 'Known fraud / active dispute'],
          ]}
        />

        <DocH3>Operator verification (MVP)</DocH3>
        <Prose>
          MVP &quot;KYC&quot; is email magic-link verification only (AD-4) - real in mechanism, trivial
          in rigor. The full document-verification pipeline is post-MVP.
        </Prose>

        <Endpoint method="POST" path="/agents/register" status="mvp">
          Register an agent DID. Requires a verified operator email.
        </Endpoint>
        <Endpoint method="GET" path="/trust/{did}" status="mvp">
          Public trust profile (sub-second, reads off-chain DB - AD-3).
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

        <Callout tone="warn">
          Contract code + deploy tooling are complete. The live testnet deploy needs a funded testnet
          key - see {code('KNOWN_ISSUES.md')}. Hashes land in {code('contracts/deployed-addresses.json')}.
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
        <DocH2 status="mvp">@fourotwo/agent-sdk</DocH2>
        <Prose>
          A drop-in {code('fetch')} replacement that handles the entire x402 client flow: detect 402,
          parse terms, check budget, sign with the agent&apos;s DID, retry, and log. The TypeScript
          package ships in Milestone&nbsp;2. Python SDK remains a P1 stretch.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`import { fourotwoAgent } from '@fourotwo/agent-sdk';

const agent = new fourotwoAgent({
  did: process.env.FOUROTWO_AGENT_DID,
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY,   // never leaves the client
  budget: { dailyUsd: 10.0, perRequestUsd: 0.5 }, // USD limits
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
            ['/', 'Overview + live facilitator status', 'mvp'],
            ['/playground', 'Live /verify → /settle demo loop', 'mvp'],
            ['/docs', 'Public, user-facing platform docs + API reference', 'mvp'],
            ['/xfourohtwo-daducks', 'These internal developer docs (unlinked)', 'mvp'],
            ['/agents', 'Agent list, registration, trust cards', 'mvp'],
            ['/agents/[did]', 'Agent detail + transaction history', 'mvp'],
            ['/wallet', 'CSPR balance + faucet funding', 'mvp'],
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
            ['Direct on-chain', 'First-time pairs, large transactions', 'mvp'],
            ['Batched', 'Many low-value settlements (60s window)', 'upcoming'],
            ['Payment channel', 'High-frequency trusted pairs (off-chain)', 'planned'],
            ['L2 / rollup', 'When base-chain gas spikes', 'planned'],
          ]}
        />
        <Prose>
          MVP settles direct on-chain only. The smart router (auto-selecting the cheapest correct mode)
          is post-MVP - the {code('/settle')} contract already accepts {code('settlement_mode: "auto"')}.
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
          (AD-3), email-only operator verification (AD-4), reject-don&apos;t-queue budgets (AD-5).
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
