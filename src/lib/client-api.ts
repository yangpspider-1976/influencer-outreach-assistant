"use client";

/** Typed fetch wrapper used by every client component. */

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "ERROR",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    // §18 — a network failure must surface as a retryable state, never as a
    // silent success that advances the queue.
    throw new ClientApiError(0, "The network request failed. Check your connection and retry.", "NETWORK_ERROR");
  }

  if (response.status === 401) {
    throw new ClientApiError(401, "Your session has expired. Sign in again to continue.", "UNAUTHORIZED");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ClientApiError(
      response.status,
      payload?.error ?? `Request failed with status ${response.status}.`,
      payload?.code ?? "ERROR",
      payload?.details,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  upload: <T>(url: string, form: FormData) => request<T>(url, { method: "POST", body: form }),
};

/**
 * FR-017 / §18 — copies plain text using the Clipboard API after a user
 * gesture, with a document.execCommand fallback and an explicit failure signal
 * so the caller can show selectable text instead.
 */
export async function copyPlainText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

/**
 * FR-018 — opens the saved profile URL in a new tab with a normal window
 * action. No automation of any kind happens inside that tab (§16).
 */
export function openProfile(url: string): boolean {
  const handle = window.open(url, "_blank", "noopener,noreferrer");
  return handle !== null;
}
