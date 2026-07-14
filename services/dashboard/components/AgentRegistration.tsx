'use client';

import { useState } from 'react';
import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { deriveDid } from '@fourotwo/types';

import { NEXT_PUBLIC_KYX_REGISTRY_URL } from '@/lib/kyx';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

interface CreatedAgent {
  did: string;
  privateKeyHex: string;
  publicKeyHex: string;
}

export function AgentRegistration() {
  const [agentName, setAgentName] = useState('RWA Oracle Agent');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function register() {
    setStatus('requesting operator verification...');
    const verifyRes = await fetch(`${NEXT_PUBLIC_KYX_REGISTRY_URL}/operators/verify-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const verify = (await verifyRes.json()) as {
      dev_token?: string;
      email_sent?: boolean;
      already_verified?: boolean;
      error?: string;
    };
    if (!verifyRes.ok) throw new Error(verify.error ?? 'verification failed');

    if (verify.email_sent) {
      setStatus('verification email sent - open the link in your inbox, then press the button again to finish registration.');
      return;
    }
    if (verify.dev_token) {
      setStatus('confirming local magic link...');
      await fetch(`${NEXT_PUBLIC_KYX_REGISTRY_URL}/operators/verify/${verify.dev_token}`);
    }

    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    const privateKeyHex = bytesToHex(secret);
    const publicKeyHex = `01${bytesToHex(ed25519.getPublicKey(secret))}`;
    const did = deriveDid('casper', publicKeyHex);

    setStatus('registering public DID...');
    const res = await fetch(`${NEXT_PUBLIC_KYX_REGISTRY_URL}/agents/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent_name: agentName,
        operator_email: email,
        public_key: publicKeyHex,
        network: 'casper',
      }),
    });
    console.log({res})
    const body = (await res.json()) as { agent?: { did: string }; error?: string };
    if (!res.ok || !body.agent) throw new Error(body.error ?? 'registration failed');
    setCreated({ did, privateKeyHex, publicKeyHex });
    setStatus('registered');
  }

  function downloadKey() {
    if (!created || downloaded) return;
    const blob = new Blob([JSON.stringify(created, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fourotwo-agent-key.json';
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <div className="border border-hairline bg-surface p-6">
      <div className="section-label mb-4">register agent</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide2 text-text-dim">agent name</span>
          <input value={agentName} onChange={(e) => setAgentName(e.target.value)} className="border border-hairline bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide2 text-text-dim">operator email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="border border-hairline bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-accent" />
        </label>
      </div>
      <button onClick={() => void register().catch((err) => setStatus((err as Error).message))} className="mt-5 bg-accent px-6 py-3 text-[11px] uppercase tracking-wide2 text-bg">
        Generate key + register
      </button>
      {status && <p className="mt-4 text-[11px] text-text-dim">{status}</p>}
      {created && (
        <div className="mt-5 border border-hairline bg-bg/60 p-4">
          <div className="text-[10px] uppercase tracking-wide2 text-text-dim">new did</div>
          <code className="mt-2 block break-all text-[11px] text-accent">{created.did}</code>
          <button disabled={downloaded} onClick={downloadKey} className="mt-4 border border-accent px-4 py-2 text-[10px] uppercase tracking-wide2 text-accent disabled:opacity-40">
            {downloaded ? 'private key downloaded' : 'download private key once'}
          </button>
        </div>
      )}
    </div>
  );
}
