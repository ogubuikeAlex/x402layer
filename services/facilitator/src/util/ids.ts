import { randomBytes } from 'node:crypto';

function rand(len: number): string {
  return randomBytes(len).toString('hex');
}

export function verificationId(): string {
  return `vrf_${rand(12)}`;
}

export function settlementId(): string {
  return `stl_${rand(12)}`;
}
