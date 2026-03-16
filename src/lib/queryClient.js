import { QueryClient } from "@tanstack/react-query";

/**
 * Global QueryClient instance used across the app.
 * Admin pages import this to invalidate queries.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
});

/**
 * Small helper for talking to our Next.js API routes.
 */
export async function apiRequest(method, url, body) {
  const options = {
    method,
    headers: {},
  };

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed with status ${res.status}`);
  }

  // If there is no body just return null
  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return res.json();
}
