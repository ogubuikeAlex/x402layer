/**
 * Shared HTTP helper: a `fetch` that always applies a timeout so a hung upstream
 * cannot stall a request (or an SSR render) indefinitely. All services import
 * this rather than calling bare `fetch`.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export interface TimeoutFetchInit extends RequestInit {
  /** Abort the request after this many ms (default {@link DEFAULT_FETCH_TIMEOUT_MS}). */
  timeoutMs?: number;
}

/**
 * `fetch` with an enforced timeout. If the caller passes their own `signal` it is
 * honored alongside the timeout (whichever aborts first wins). Throws the usual
 * `AbortError` on timeout.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string | URL | Request,
  init: TimeoutFetchInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await fetchImpl(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
function clearTimeout(timer: any) {
  if (timer != null) {
    try {
      (globalThis as any).clearTimeout(timer);
    } catch {
    }
  }
}

