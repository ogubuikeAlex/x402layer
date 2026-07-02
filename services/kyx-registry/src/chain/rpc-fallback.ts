/**
 * RPC fallback: try a list of endpoints in order, returning the first success.
 *
 * A single Casper node can be down, rate-limited, or lagging. Rather than
 * surfacing that as an error to the caller, we try the next configured endpoint
 * before giving up — only the last endpoint's failure propagates.
 */
export async function tryEndpoints<T>(
  endpoints: readonly string[],
  attempt: (endpoint: string) => Promise<T>,
  onError?: (endpoint: string, error: unknown) => void,
): Promise<T> {
  if (endpoints.length === 0) {
    throw new Error('tryEndpoints: no RPC endpoints configured');
  }
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      return await attempt(endpoint);
    } catch (error) {
      lastError = error;
      onError?.(endpoint, error);
    }
  }
  throw lastError;
}
