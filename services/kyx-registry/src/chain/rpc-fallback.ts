
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
