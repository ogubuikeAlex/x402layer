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

export interface UserDocTab {
  id: string;
  label: string;
  blurb: string;
  status: DocStatus;
  content: ReactNode;
}

const code = (s: string) => <code className="bg-surface px-1.5 py-0.5 text-accent">{s}</code>;

export const USER_TABS: UserDocTab[] = [
  /* ─────────────────────────── QUICKSTART ─────────────────────────── */
  {
    id: 'quickstart',
    label: 'Quickstart',
    blurb: 'Make your first paid request in minutes.',
    status: 'live',
    content: (
      <>
        <DocH2>What is fourotwo?</DocH2>
        <Prose>
          fourotwo is a payment layer for AI agents built on the x402 standard. It lets an agent pay
          for an API call automatically when the server answers with HTTP 402, verifies and settles
          that payment on-chain, and attaches a portable <strong>trust score</strong> to every agent
          so providers know who they are transacting with.
        </Prose>
        <Prose>There are two sides, and you can adopt either independently:</Prose>
        <DocTable
          headers={['You are…', 'Use', 'Start here']}
          rows={[
            ['Building an agent that consumes paid APIs', 'The Agent SDK', 'Quickstart ↓ / Agent SDK'],
            ['Selling an API and want to charge per call', 'The Facilitator', 'Accept payments'],
            ['Either — and want portable reputation', 'The Trust Registry', 'Trust & identity'],
          ]}
        />

        <DocH2>The payment loop</DocH2>
        <Prose>
          Every fourotwo transaction is the same four-step loop. The SDK and facilitator handle every
          step for you.
        </Prose>
        <CodeBlock
          lang="flow"
          code={`pay      → agent signs an x402 payment when it gets a 402 response
verify   → facilitator checks signature, replay, balance, and trust
settle   → payment is settled on-chain and a signed receipt is returned
score    → the agent's trust score is updated from the settled payment`}
        />

        <DocH2 status="live">Install the SDK</DocH2>
        <CodeBlock lang="bash" code={`npm install @fourotwo/agent-sdk`} />

        <DocH3>Make a paid request</DocH3>
        <Prose>
          The agent is a drop-in {code('fetch')} replacement. Point it at any x402-gated URL and it
          handles the 402 → sign → retry handshake transparently.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`import { fourotwoAgent } from '@fourotwo/agent-sdk';

const agent = new fourotwoAgent({
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY,  // never leaves your process
  budget: { dailyUsd: 10, perRequestUsd: 0.5 },     // optional spend limits
});

// agent.fetch behaves exactly like fetch — but pays when it has to
const res = await agent.fetch('https://api.example.com/data/RE-NYC-001');
const data = await res.json();`}
        />
        <Callout>
          The DID is derived from your key automatically. Pass {code('did')} explicitly only if you
          registered the agent under a specific identity. Your private key is used to sign locally and
          is never transmitted.
        </Callout>

        <DocH3>Try it without writing code</DocH3>
        <Prose>
          The <a href="/playground" className="text-accent underline">Playground</a> crafts a real
          signed Casper payment and runs it through the live facilitator so you can watch the
          verify → settle trace and the signed receipt before integrating.
        </Prose>
      </>
    ),
  },

  /* ─────────────────────────── AGENT SDK ─────────────────────────── */
  {
    id: 'sdk',
    label: 'Agent SDK',
    blurb: 'Pay for APIs automatically from your agent.',
    status: 'live',
    content: (
      <>
        <DocH2 status="live">@fourotwo/agent-sdk</DocH2>
        <Prose>
          A TypeScript {code('fetch')} wrapper that handles the entire x402 client flow: detect 402,
          parse the payment terms, enforce your spend budget, sign with the agent key, retry, and log
          every payment to a local ledger.
        </Prose>

        <DocH3>Constructor options</DocH3>
        <DocTable
          headers={['Option', 'Type', 'Notes']}
          rows={[
            ['privateKeyHex', 'string (required)', 'Agent signing key. Stays in your process.'],
            ['did', 'string', 'Defaults to the DID derived from the key.'],
            ['publicKeyHex', 'string', 'Override the derived public key (rarely needed).'],
            ['budget', 'SpendBudget', 'Daily + per-request USD limits. See below.'],
            ['logFilePath', 'string', 'Where to persist the transaction ledger.'],
            ['fetchImpl', 'typeof fetch', 'Custom fetch (e.g. for tracing or tests).'],
          ]}
        />

        <DocH3>Spend budget</DocH3>
        <Prose>
          Budgets <strong>reject</strong> — they do not queue. If a payment would exceed a limit the
          SDK throws {code('BudgetExceededError')} <em>before</em> the payment is ever signed, so a
          runaway loop can never drain the wallet. The daily counter resets at UTC midnight.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`import { fourotwoAgent, BudgetExceededError } from '@fourotwo/agent-sdk';

const agent = new fourotwoAgent({
  privateKeyHex: process.env.FOUROTWO_PRIVATE_KEY,
  budget: {
    dailyUsd: 25,        // hard daily cap
    perRequestUsd: 1,    // max for any single request
  },
});

try {
  const res = await agent.fetch(url);
} catch (err) {
  if (err instanceof BudgetExceededError) {
    // err.scope is 'daily' or 'per-request'
    console.warn('over budget:', err.message);
  }
}`}
        />

        <DocH3>What happens on a 402</DocH3>
        <CodeBlock
          lang="steps"
          code={`1. Your call gets a 402 + a PAYMENT-REQUIRED header
2. The SDK decodes the terms (amount, recipient, network, expiry, nonce)
3. It checks your budget — throws BudgetExceededError if over
4. It signs the canonical payment envelope with your key
5. It retries with PAYMENT-SIGNATURE + X-FOUROTWO-DID headers attached
6. On success it commits the spend and logs the payment to the ledger`}
        />

        <DocH3>Transaction ledger</DocH3>
        <Prose>
          Every attempt is recorded locally — successes, failures, and budget rejections. Read it back
          with {code('getTransactionLog()')}.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`const log = agent.getTransactionLog();
// [{ did, amount, recipient, network, status, responseStatus, ... }]
// status: 'success' | 'failed' | 'budget_rejected'`}
        />
      </>
    ),
  },

  /* ─────────────────────────── ACCEPT PAYMENTS ─────────────────────────── */
  {
    id: 'accept',
    label: 'Accept payments',
    blurb: 'Charge per API call with x402 + the facilitator.',
    status: 'live',
    content: (
      <>
        <DocH2>Charge for your API</DocH2>
        <Prose>
          To monetise an endpoint you do two things: answer unpaid requests with a{' '}
          <strong>402 + payment terms</strong>, and when the caller retries with a signature, hand it
          to the fourotwo facilitator to <strong>verify</strong> and <strong>settle</strong>. The
          facilitator does all the chain-specific work; your server just brokers two HTTP calls.
        </Prose>

        <DocH3>1 · Answer unpaid requests with 402</DocH3>
        <Prose>
          Emit a {code('PAYMENT-REQUIRED')} envelope describing the price, recipient, network, and a
          unique nonce. {code('@fourotwo/types')} ships {code('encodeEnvelope()')} for this.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`import { encodeEnvelope } from '@fourotwo/types';

const FACILITATOR_URL = 'https://your-facilitator.example.com';

function paymentRequired(assetId) {
  return {
    amount: '5000',                 // smallest unit (motes / wei)
    recipient: 'account-hash-...',  // where funds settle
    network: 'casper',
    token: 'CSPR',
    expiry: Math.floor(Date.now() / 1000) + 600,
    nonce: assetId + '-' + Date.now(),   // replay protection
    facilitator: FACILITATOR_URL,
    minTrustScore: 40,              // optional: gate low-trust agents
  };
}

// no payment yet → 402 with the terms in a header
res.writeHead(402, { 'PAYMENT-REQUIRED': encodeEnvelope(paymentRequired(id)) });
res.end(JSON.stringify({ error: 'PAYMENT_REQUIRED' }));`}
        />

        <DocH3>2 · Verify &amp; settle the retry</DocH3>
        <Prose>
          The SDK retries with three headers — {code('PAYMENT-REQUIRED')},{' '}
          {code('PAYMENT-SIGNATURE')}, and {code('X-FOUROTWO-DID')}. Forward them to{' '}
          {code('/verify')}; if it returns {code('valid: true')}, call {code('/settle')} with the
          returned {code('verification_id')}.
        </Prose>
        <CodeBlock
          lang="ts"
          code={`async function verifyAndSettle({ did, paymentRequired, paymentSignature }) {
  const verify = await fetch(FACILITATOR_URL + '/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payment_required: paymentRequired,    // the PAYMENT-REQUIRED header value
      payment_signature: paymentSignature,  // the PAYMENT-SIGNATURE header value
      agent_did: did,                        // the X-FOUROTWO-DID header value
    }),
  }).then((r) => r.json());

  if (!verify.valid) return { ok: false, verify };

  const settle = await fetch(FACILITATOR_URL + '/settle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verification_id: verify.verification_id }),
  }).then((r) => r.json());

  return { ok: true, verify, settle };   // settle.receipt is signed by the facilitator
}`}
        />
        <Callout>
          {code('/settle')} returns a <strong>signed receipt</strong> ({code('facilitatorSignature')})
          you can store as proof of payment. Settlement is best-effort on-chain: a broadcast hiccup
          never fails the response, and the receipt still verifies.
        </Callout>

        <DocH3>Gating by trust</DocH3>
        <Prose>
          Set {code('minTrustScore')} in the envelope (or inspect {code('agent_trust')} on the verify
          response) to refuse or price-discriminate low-trust agents. Unregistered agents come back as{' '}
          {code('trust_pending')}; known-bad agents are {code('BLOCKED')}.
        </Prose>
      </>
    ),
  },

  /* ─────────────────────────── TRUST & IDENTITY ─────────────────────────── */
  {
    id: 'trust',
    label: 'Trust & identity',
    blurb: 'Agent DIDs, operator verification, trust scores.',
    status: 'live',
    content: (
      <>
        <DocH2>Identity &amp; trust</DocH2>
        <Prose>
          Every agent has a <strong>DID</strong> derived from its public key, linked to a verified
          operator. Each settled payment contributes to a public, portable trust score that any
          provider can read before transacting.
        </Prose>

        <DocH3>DID format</DocH3>
        <CodeBlock
          lang="text"
          code={`did:fourotwo:{network}:{address}
# casper → blake2b account hash, base → EVM address
did:fourotwo:casper:3d5de8c609159a0954e773dd686fb7724428316cb30e00bdc...`}
        />

        <DocH3>Register an agent</DocH3>
        <Prose>
          Registration is two steps against the registry: verify an operator email (magic link), then
          register the agent under that email. Keys are generated client-side — the private key never
          touches a server. You can also do this visually on the{' '}
          <a href="/agents" className="text-accent underline">Agents</a> page.
        </Prose>
        <CodeBlock
          lang="bash"
          code={`# 1. request an operator magic link (dev returns the token directly)
curl -X POST $KYX_URL/operators/verify-request \\
  -H 'content-type: application/json' \\
  -d '{ "email": "you@example.com" }'

# 2. confirm the email
curl $KYX_URL/operators/verify/<token>

# 3. register the agent (needs the verified operator email + public key)
curl -X POST $KYX_URL/agents/register \\
  -H 'content-type: application/json' \\
  -d '{ "operator_email": "you@example.com", "agent_name": "RWA Oracle",
        "public_key": "<pubkey hex>", "network": "casper" }'`}
        />

        <DocH3>How the score works</DocH3>
        <DocTable
          headers={['Dimension', 'Weight', 'Status']}
          rows={[
            ['Payment completion rate', '50%', 'live'],
            ['Operator verification (KYC)', '30%', 'live'],
            ['Volume tier', '20%', 'live'],
            ['Behavioral consistency', '— (v2)', 'upcoming'],
            ['Dispute rate', '— (v2)', 'upcoming'],
          ]}
        />

        <DocH3>Trust tiers</DocH3>
        <DocTable
          headers={['Score', 'Tier', 'Meaning']}
          rows={[
            ['90–100', <span className="text-accent3">ELITE</span>, 'Long track record, KYC, ~0 disputes'],
            ['70–89', <span className="text-accent3">VERIFIED</span>, 'Established agent, good history'],
            ['40–69', <span className="text-accent">STANDARD</span>, 'New / unverified agent'],
            ['1–39', <span className="text-accent-warn">RESTRICTED</span>, 'Anomalous or failed KYC'],
            ['0', <span className="text-accent2">BLOCKED</span>, 'Known fraud / active dispute'],
          ]}
        />
        <Prose>
          Read any agent&apos;s public trust profile with {code('GET /trust/{did}')} — see the API
          reference.
        </Prose>
      </>
    ),
  },

  /* ─────────────────────────── API REFERENCE ─────────────────────────── */
  {
    id: 'api',
    label: 'API reference',
    blurb: 'Facilitator + registry HTTP endpoints.',
    status: 'live',
    content: (
      <>
        <DocH2>API reference</DocH2>
        <Prose>
          Two services. The <strong>facilitator</strong> (default {code('4001')}) verifies and
          settles payments; the <strong>KYX registry</strong> (default {code('4002')}) handles agent
          identity and trust. All bodies are JSON.
        </Prose>

        <DocH2>Facilitator</DocH2>

        <Endpoint method="POST" path="/verify" status="live">
          Verify a signed payment before settling. Called by the API provider on each 402 retry.
        </Endpoint>
        <Prose>Request:</Prose>
        <CodeBlock
          lang="json"
          code={`{
  "payment_required": "<base64 PAYMENT-REQUIRED envelope>",
  "payment_signature": "<base64 of {\\"payer\\":\\"<pubkey hex>\\",\\"signature\\":\\"<hex>\\"}>",
  "agent_did": "did:fourotwo:casper:<account-hash>"
}`}
        />
        <Prose>Response:</Prose>
        <CodeBlock
          lang="json"
          code={`{
  "valid": true,
  "verification_id": "vrf_...",
  "agent_trust": { "did": "...", "trust_score": null, "trust_pending": true },
  "settlement_recommendation": "direct"
}`}
        />
        <DocH3>Rejection reasons</DocH3>
        <DocTable
          headers={['reason', 'meaning']}
          rows={[
            ['SIGNATURE_INVALID', 'Signature does not verify against the payer'],
            ['EXPIRED', 'Envelope expiry is in the past'],
            ['REPLAYED', 'Nonce already seen within the replay window'],
            ['AGENT_BLOCKED', 'Agent is BLOCKED or below the merchant min score'],
            ['INSUFFICIENT_BALANCE', 'Payer balance below the required amount'],
            ['UNSUPPORTED_NETWORK', 'No adapter for the envelope network'],
            ['MALFORMED_PAYLOAD', 'Envelope / signature / DID could not be parsed'],
          ]}
        />

        <Endpoint method="POST" path="/settle" status="live">
          Settle a verified payment and return a facilitator-signed receipt.
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
  "receipt": { "...": "SettlementReceipt", "facilitatorSignature": "<ed25519 hex>" }
}`}
        />

        <Endpoint method="GET" path="/supported" status="live">
          Capability advertisement — supported networks, tokens, and features.
        </Endpoint>
        <Endpoint method="GET" path="/trust/{did}" status="live">
          Public trust profile for an agent DID (reads sub-second, served by the registry).
        </Endpoint>

        <DocH2>KYX Registry</DocH2>
        <Endpoint method="POST" path="/operators/verify-request" status="live">
          Request an operator email magic link. In local dev the token is returned in the response.
        </Endpoint>
        <Endpoint method="GET" path="/operators/verify/:token" status="live">
          Confirm the magic link and mark the operator email verified.
        </Endpoint>
        <Endpoint method="POST" path="/agents/register" status="live">
          Register an agent DID. Requires a verified operator email and the agent public key.
        </Endpoint>
        <Endpoint method="GET" path="/trust/{did}" status="live">
          Public trust profile (score, tier, dimensions, flags).
        </Endpoint>

        <DocH3>Self-hosting</DocH3>
        <KeyVal
          items={[
            ['facilitator', 'default port 4001 · FACILITATOR_URL'],
            ['kyx registry', 'default port 4002 · KYX_REGISTRY_URL'],
            ['network', 'casper-test (Casper) + Base Sepolia'],
            ['cors', 'set KYX_CORS_ORIGIN for browser clients'],
          ]}
        />
        <Callout>
          Want the internals — contracts, ADR decisions, settlement routing, the threat model? The{' '}
          <a href="/xfourohtwo-daducks" className="text-accent underline">developer docs</a> cover the
          full build surface.
        </Callout>
      </>
    ),
  },
];
