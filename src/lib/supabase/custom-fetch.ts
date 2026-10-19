/**
 * PostgREST Fetch Adapter
 *
 * When PostgREST runs as a standalone service (on port 54320) without Kong API gateway,
 * it serves endpoints at the root path (e.g., http://127.0.0.1:54320/users) rather than
 * behind the Supabase Kong prefix /rest/v1 (e.g., http://127.0.0.1:54320/rest/v1/users).
 *
 * This adapter transparently rewrites URLs containing '/rest/v1/' to '/' so that all Supabase
 * client libraries (@supabase/supabase-js, @supabase/ssr) work seamlessly against standalone PostgREST.
 */

export const postgrestFetch: typeof fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string') {
    if (input.includes('/rest/v1/')) {
      return fetch(input.replace('/rest/v1/', '/'), init);
    }
    return fetch(input, init);
  }

  if (input instanceof URL) {
    if (input.pathname.includes('/rest/v1/')) {
      const newUrl = new URL(input.href);
      newUrl.pathname = newUrl.pathname.replace('/rest/v1/', '/');
      return fetch(newUrl, init);
    }
    return fetch(input, init);
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    if (input.url.includes('/rest/v1/')) {
      const rewrittenUrl = input.url.replace('/rest/v1/', '/');
      const newRequest = new Request(rewrittenUrl, input);
      return fetch(newRequest, init);
    }
    return fetch(input, init);
  }

  return fetch(input, init);
};
