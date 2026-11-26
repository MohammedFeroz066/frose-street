export function createApiClient(deps?: {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  redirectImpl?: (target: string) => void;
  onSessionCleared?: () => void;
}): {
  apiFetch: (url: string, options?: RequestInit & { _retried?: boolean }) => Promise<Response>;
};

export function apiFetch(
  url: string,
  options?: RequestInit & { _retried?: boolean },
): Promise<Response>;
