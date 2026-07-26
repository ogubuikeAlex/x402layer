

import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';
import { buildDomain, CASPER_DOMAIN_TYPES, hashTypedData } from '@casper-ecosystem/casper-eip-712';
import { casperAccountHash } from '@fourotwo/types';

import type { AgentKeypair } from './did.js';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

export interface CasperX402PaymentRequirements {
  scheme: string; 
  network: string; // "casper:casper" | "casper:casper-test"
  payTo: string;
  amount: string;
  /** CEP-18 contract package hash (bare hex, no 0x). */
  asset: string;
  maxTimeoutSeconds: number;
  /** EIP-712 domain / token metadata. `name` and `version` are required. */
  extra: { name: string; version: string; decimals?: string; symbol?: string; [k: string]: unknown };
}

export interface CasperX402Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface CasperX402PaymentPayload {
  x402Version: number;
  resource: { url: string };
  accepted: {
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
  };
  payload: {
    signature: string;
    publicKey: string;
    authorization: CasperX402Authorization;
  };
}

export function casperAccountAddress(taggedPublicKeyHex: string): string {
  return '00' + casperAccountHash(taggedPublicKeyHex);
}

export interface CreateCasperX402PaymentArgs {
  paymentRequirements: CasperX402PaymentRequirements;
  keypair: AgentKeypair;
  resourceUrl?: string;
  x402Version?: number;
  nowSec?: () => number;
  nonce?: Uint8Array;
}


export function createCasperX402Payment(args: CreateCasperX402PaymentArgs): CasperX402PaymentPayload {
  const { paymentRequirements: req, keypair } = args;
  const x402Version = args.x402Version ?? 2;

  if (keypair.network !== 'casper') {
    throw new Error('createCasperX402Payment requires a Casper keypair');
  }
  if (!keypair.taggedPublicKeyHex.startsWith('01')) {
    throw new Error('createCasperX402Payment currently supports ed25519 keys (tag 01) only');
  }
  const name = req.extra?.name;
  const version = req.extra?.version;
  if (typeof name !== 'string' || name === '') throw new Error('paymentRequirements.extra.name is required');
  if (typeof version !== 'string' || version === '') throw new Error('paymentRequirements.extra.version is required');

  const from = casperAccountAddress(keypair.taggedPublicKeyHex);
  const payTo = req.payTo.replace(/^0x/, '').toLowerCase();
  const asset = req.asset.replace(/^0x/, '').toLowerCase();

  const domain = buildDomain(name, version, req.network, '0x' + asset);

  const nowSec = args.nowSec ? args.nowSec() : Math.floor(Date.now() / 1000);
  const validAfter = nowSec - 600;
  const validBefore = nowSec + req.maxTimeoutSeconds;
  const nonce = args.nonce ?? randomBytes(32);
  const nonceHex = bytesToHex(nonce);

  const message = {
    from: '0x' + from,
    to: '0x' + payTo,
    value: BigInt(req.amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: '0x' + nonceHex,
  };

  const digest = hashTypedData(
    domain,
    TRANSFER_WITH_AUTHORIZATION_TYPES,
    'TransferWithAuthorization',
    message,
    { domainTypes: CASPER_DOMAIN_TYPES },
  );

  const raw = ed25519.sign(digest, hexToBytes(keypair.privateKeyHex.replace(/^0x/, '')));
  const signature = new Uint8Array(1 + raw.length);
  signature[0] = 0x01;
  signature.set(raw, 1);

  return {
    x402Version,
    resource: { url: args.resourceUrl ?? '' },
    accepted: {
      scheme: req.scheme,
      network: req.network,
      asset,
      amount: req.amount,
      payTo,
      maxTimeoutSeconds: req.maxTimeoutSeconds,
    },
    payload: {
      signature: bytesToHex(signature),
      publicKey: keypair.taggedPublicKeyHex,
      authorization: {
        from,
        to: payTo,
        value: req.amount,
        validAfter: String(validAfter),
        validBefore: String(validBefore),
        nonce: nonceHex,
      },
    },
  };
}

export interface CasperX402VerifyResult {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
  invalidMessage?: string;
}

export async function verifyCasperX402Payment(args: {
  facilitatorUrl: string;
  accessToken?: string;
  paymentRequirements: CasperX402PaymentRequirements;
  payment: CasperX402PaymentPayload;
  fetchImpl?: typeof fetch;
}): Promise<CasperX402VerifyResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const res = await fetchImpl(`${args.facilitatorUrl.replace(/\/+$/, '')}/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args.accessToken ? { authorization: args.accessToken } : {}),
    },
    body: JSON.stringify({ paymentPayload: args.payment, paymentRequirements: args.paymentRequirements }),
  });
  const body = (await res.json().catch(() => ({}))) as CasperX402VerifyResult;
  return { ...body, isValid: body.isValid === true };
}
