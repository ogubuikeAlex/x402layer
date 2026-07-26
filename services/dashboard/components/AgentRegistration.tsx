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

interface Notice {
  kind: 'busy' | 'inbox' | 'error' | 'success';
  title: string;
  detail: string;
}

export function AgentRegistration() {
  const [agentName, setAgentName] = useState('RWA Oracle Agent');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const busy = notice?.kind === 'busy';

  // Bound every request so a hung registry can't leave the modal spinning
  // forever with no way out.
  const REQUEST_TIMEOUT_MS = 15_000;

  async function register() {
    setNotice({ kind: 'busy', title: 'verifying operator', detail: 'requesting operator verification…' });
    const verifyRes = await fetch(`${NEXT_PUBLIC_KYX_REGISTRY_URL}/operators/verify-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, ...(username.trim() ? { username: username.trim() } : {}) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const verify = (await verifyRes.json()) as {
      dev_token?: string;
      email_sent?: boolean;
      already_verified?: boolean;
      error?: string;
      detail?: string;
    };
    if (!verifyRes.ok) {
      throw new Error(
        verify.error === 'USERNAME_TAKEN'
          ? 'That username is taken - pick another and try again.'
          : verify.detail ?? verify.error ?? 'verification failed',
      );
    }

    if (verify.email_sent) {
      setNotice({
        kind: 'inbox',
        title: 'check your inbox',
        detail: `We emailed a verification link to ${email}. Open it, then come back here to finish registering ${agentName}.`,
      });
      return;
    }
    if (verify.dev_token) {
      setNotice({ kind: 'busy', title: 'verifying operator', detail: 'confirming local magic link…' });
      await fetch(`${NEXT_PUBLIC_KYX_REGISTRY_URL}/operators/verify/${verify.dev_token}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }

    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    const privateKeyHex = bytesToHex(secret);
    const publicKeyHex = `01${bytesToHex(ed25519.getPublicKey(secret))}`;
    const did = deriveDid('casper', publicKeyHex);

    setNotice({ kind: 'busy', title: 'registering agent', detail: 'registering public DID…' });
    const res = await fetch(`${NEXT_PUBLIC_KYX_REGISTRY_URL}/agents/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent_name: agentName,
        operator_email: email,
        public_key: publicKeyHex,
        network: 'casper',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await res.json()) as { agent?: { did: string }; error?: string };
    if (!res.ok || !body.agent) {
      throw new Error(
        body.error === 'AGENT_NAME_ALREADY_REGISTERED'
          ? `The agent name "${agentName}" is already taken - agent names are globally unique. Pick a different name.`
          : body.error ?? 'registration failed',
      );
    }
    setCreated({ did, privateKeyHex, publicKeyHex });
    setNotice({
      kind: 'success',
      title: 'agent registered ✓',
      detail: `${agentName} is registered. Download its private key below - it is shown exactly once.`,
    });
  }

  function startRegister() {
    void register().catch((err) => {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      setNotice({
        kind: 'error',
        title: 'registration failed',
        detail: isTimeout
          ? 'The registry did not respond in time. Check that it is reachable and try again.'
          : (err as Error).message,
      });
    });
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
        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-[10px] uppercase tracking-wide2 text-text-dim">
            operator username <span className="normal-case text-text-dim/70">(public pseudonym - shown instead of your email; auto-generated if blank)</span>
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. atlas-labs"
            maxLength={24}
            className="border border-hairline bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
          />
        </label>
      </div>
      <button
        onClick={startRegister}
        disabled={busy}
        className="mt-5 bg-accent px-6 py-3 text-[11px] uppercase tracking-wide2 text-bg disabled:opacity-50"
      >
        Generate key + register
      </button>
      {created && (
        <div className="mt-5 border border-hairline bg-bg/60 p-4">
          <div className="text-[10px] uppercase tracking-wide2 text-text-dim">new did</div>
          <code className="mt-2 block break-all text-[11px] text-accent">{created.did}</code>
          <button disabled={downloaded} onClick={downloadKey} className="mt-4 border border-accent px-4 py-2 text-[10px] uppercase tracking-wide2 text-accent disabled:opacity-40">
            {downloaded ? 'private key downloaded' : 'download private key once'}
          </button>
        </div>
      )}

      {notice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm"
          onClick={() => !busy && setNotice(null)}
          role="dialog"
          aria-modal="true"
          aria-label={notice.title}
        >
          <div
            className={`w-full max-w-md border bg-surface p-6 shadow-2xl ${
              notice.kind === 'error'
                ? 'border-accent2'
                : notice.kind === 'success'
                  ? 'border-accent3'
                  : 'border-hairline-accent'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              {busy && (
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              )}
              {notice.kind === 'inbox' && <span className="text-lg leading-none">✉</span>}
              <div
                className={`text-[10px] uppercase tracking-wide2 ${
                  notice.kind === 'error'
                    ? 'text-accent2'
                    : notice.kind === 'success'
                      ? 'text-accent3'
                      : 'text-accent'
                }`}
              >
                {notice.title}
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-text-mid">{notice.detail}</p>
            {!busy && (
              <div className="mt-6 flex justify-end gap-3">
                {notice.kind === 'inbox' && (
                  <button
                    onClick={startRegister}
                    className="bg-accent px-4 py-2.5 text-[10px] uppercase tracking-wide2 text-bg"
                  >
                    I clicked the link - finish registration
                  </button>
                )}
                <button
                  onClick={() => setNotice(null)}
                  className="border border-hairline px-4 py-2.5 text-[10px] uppercase tracking-wide2 text-text-dim transition-colors hover:border-accent hover:text-accent"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
