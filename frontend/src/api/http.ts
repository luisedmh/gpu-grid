/** Shared HTTP helper for every call to the backend API. */

/** An error answered by the API, with the per-field details of validation errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: { field: string; message: string }[];

  constructor(message: string, status: number, details: { field: string; message: string }[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Fired when the backend says the session is no longer valid (expired or logged out). */
export const SESSION_EXPIRED_EVENT = 'gpugrid:session-expired';

/**
 * Sends a request to the API and returns the JSON answer.
 * The session cookie is sent automatically by the browser (same origin).
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    // A 401 outside the login endpoints means the session ended: tell the app
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
      body?.details,
    );
  }
  return body as T;
}

/** Turns an error into text for the user, listing invalid fields if there are any. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.details.length > 0) {
    return err.details.map((d) => `${d.field}: ${d.message}`).join('\n');
  }
  return (err as Error).message;
}
