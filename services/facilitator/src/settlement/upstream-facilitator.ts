import type { PaymentPayload } from '@fourotwo/types';
import { fetchWithTimeout, deriveAddress } from '@fourotwo/types';

export interface UpstreamAssetMetadata {
  name: string;
  version: string;
  decimals: string;
  symbol: string;
}

export interface UpstreamFacilitatorOptions {
  baseUrl: string;
  /** CSPR.cloud access token (sent raw in the Authorization header). */
  accessToken?: string;
  /** CAIP-2 network: "casper:casper" (mainnet) or "casper:casper-test" (testnet). */
  network?: string;
  /** CEP-18 contract hash of the settlement asset (required for a real settle). */
  asset?: string;
  /** EIP-712 domain / token metadata sent as paymentRequirements.extra. */
  assetMetadata?: UpstreamAssetMetadata;
  /** Resource URL to report as paymentPayload.resource.url. */
  resourceUrl?: string;
  x402Version?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** POST /settle response (docs.cspr.cloud/x402-facilitator-api/settle). */
interface CasperSettleResponse {
  success?: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
  errorMessage?: string;
}

/** POST /verify response (docs.cspr.cloud/x402-facilitator-api/verify). */
interface CasperVerifyResponse {
  isValid?: boolean;
  payer?: string;
  invalidReason?: string;
  invalidMessage?: string;
}

export interface UpstreamSettleResult {
  txHash: string;
  state: 'pending' | 'confirmed';
  payer?: string;
}

export class UpstreamFacilitatorError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'UpstreamFacilitatorError';
  }
}

/** Strip a Casper `account-hash-`/`hash-`/`0x` prefix, returning bare lowercase hex. */
function bareHex(value: string): string {
  return value.trim().replace(/^account-hash-/i, '').replace(/^hash-/i, '').replace(/^0x/i, '').toLowerCase();
}

export class UpstreamFacilitatorClient {
  private readonly baseUrl: string;
  private readonly network: string;
  private readonly x402Version: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: UpstreamFacilitatorOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.network = opts.network ?? 'casper:casper-test';
    this.x402Version = opts.x402Version ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    // CSPR.cloud APIs take the access token raw in the Authorization header.
    return {
      'content-type': 'application/json',
      ...(this.opts.accessToken ? { authorization: this.opts.accessToken } : {}),
    };
  }

  /**
   * Build the upstream request body per the documented Casper x402 schema.
   * See the compatibility note at the top of this file: `signature`/`publicKey`/
   * `authorization` must be a Casper-x402 (EIP-712 over CEP-18) authorization,
   * and `asset` a CEP-18 contract hash, for the upstream to actually settle.
   */
  private toRequestBody(payload: PaymentPayload): unknown {
    const env = payload.paymentRequired;
    const nowSec = Math.floor(Date.now() / 1000);
    const maxTimeoutSeconds = env.expiry ? Math.max(0, env.expiry - nowSec) : 600;
    const from = bareHex(payload.payer ? deriveAddress(env.network, payload.payer) : '');
    const payTo = bareHex(env.recipient);

    const accepted = {
      scheme: 'exact',
      network: this.network,
      asset: this.opts.asset ?? '',
      amount: env.amount,
      payTo,
      maxTimeoutSeconds,
    };

    return {
      paymentPayload: {
        x402Version: this.x402Version,
        resource: { url: this.opts.resourceUrl ?? '' },
        accepted,
        payload: {
          signature: payload.signature,
          publicKey: payload.payer,
          authorization: {
            from,
            to: payTo,
            value: env.amount,
            validAfter: '0',
            validBefore: String(env.expiry ?? nowSec + maxTimeoutSeconds),
            nonce: env.nonce,
          },
        },
      },
      paymentRequirements: {
        scheme: 'exact',
        network: this.network,
        payTo,
        amount: env.amount,
        asset: this.opts.asset ?? '',
        maxTimeoutSeconds,
        extra: this.opts.assetMetadata ?? {},
      },
    };
  }

  private async post<T>(path: string, body: unknown): Promise<{ res: Response; json: T }> {
    let res: Response;
    try {
      res = await fetchWithTimeout(this.fetchImpl, `${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      throw new UpstreamFacilitatorError(
        `upstream facilitator unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    let json = {} as T;
    try {
      json = (await res.json()) as T;
    } catch {
      /* non-JSON body handled by callers via status */
    }
    return { res, json };
  }

  /** POST /verify — validate a payment payload without settling. */
  async verify(payload: PaymentPayload): Promise<CasperVerifyResponse> {
    const { res, json } = await this.post<CasperVerifyResponse>('/verify', this.toRequestBody(payload));
    if (!res.ok) {
      throw new UpstreamFacilitatorError(
        `upstream /verify failed: ${res.status} ${json.invalidReason ?? ''}`.trim(),
        res.status,
        json.invalidReason,
      );
    }
    return json;
  }

  /**
   * POST /settle by mapping our native envelope. NOTE: this only settles if the
   * envelope already carries a Casper-x402 (EIP-712/CEP-18) signature - see the
   * compatibility note above. For the correct path use {@link settlePayload}.
   */
  async settle(payload: PaymentPayload): Promise<UpstreamSettleResult> {
    const { res, json } = await this.post<CasperSettleResponse>('/settle', this.toRequestBody(payload));
    return this.readSettle(res, json);
  }

  /**
   * Forward an already Casper-x402-signed payload to /settle - the correct path
   * once the payer's SDK has produced the EIP-712/CEP-18 signature
   * (createCasperX402Payment). The { paymentPayload, paymentRequirements } are
   * sent verbatim rather than re-mapped from our native envelope.
   */
  async settlePayload(paymentPayload: unknown, paymentRequirements: unknown): Promise<UpstreamSettleResult> {
    const { res, json } = await this.post<CasperSettleResponse>('/settle', {
      paymentPayload,
      paymentRequirements,
    });
    return this.readSettle(res, json);
  }

  /** Forward an already-signed payload to /verify (validation without settling). */
  async verifyPayload(paymentPayload: unknown, paymentRequirements: unknown): Promise<CasperVerifyResponse> {
    const { res, json } = await this.post<CasperVerifyResponse>('/verify', {
      paymentPayload,
      paymentRequirements,
    });
    if (!res.ok) {
      throw new UpstreamFacilitatorError(
        `upstream /verify failed: ${res.status} ${json.invalidReason ?? ''}`.trim(),
        res.status,
        json.invalidReason,
      );
    }
    return json;
  }

  private readSettle(res: Response, json: CasperSettleResponse): UpstreamSettleResult {
    if (!res.ok) {
      throw new UpstreamFacilitatorError(
        `upstream /settle failed: ${res.status} ${json.errorReason ?? json.errorMessage ?? ''}`.trim(),
        res.status,
        json.errorReason,
      );
    }
    if (json.success !== true || !json.transaction) {
      throw new UpstreamFacilitatorError(
        `upstream /settle did not settle: ${json.errorReason ?? json.errorMessage ?? 'no transaction returned'}`,
        res.status,
        json.errorReason,
      );
    }
    // The upstream returns the settlement deploy hash on success.
    return { txHash: json.transaction, state: 'confirmed', payer: json.payer };
  }

  /** GET /supported — networks + schemes the upstream settles. */
  async supported(): Promise<unknown> {
    const res = await fetchWithTimeout(this.fetchImpl, `${this.baseUrl}/supported`, {
      method: 'GET',
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
    });
    if (!res.ok) throw new UpstreamFacilitatorError(`upstream /supported failed: ${res.status}`, res.status);
    return res.json();
  }
}
