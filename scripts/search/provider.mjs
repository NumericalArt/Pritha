import {readProviderCredential,providerCredentialStatus} from "../lib/provider-credential.mjs";
import { SearchError, fail } from "./contracts.mjs";
import { searxngUrl } from "./policy.mjs";
export async function credential(options = {}) {
  const key=readProviderCredential('neuraldeep',options);
  if(!key) fail("credentials_missing");
  return key;
}
export function retrySeconds(value) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(n, 86400))
    : Math.max(
        0,
        Math.min(
          Math.ceil((Date.parse(value) - Date.now()) / 1000) || 0,
          86400,
        ),
      );
}
export async function boundedJson(
  url,
  { method = "GET", body, token, signal, fetcher = fetch } = {},
) {
  let r;
  try {
    r = await fetcher(url, {
      method,
      redirect: "error",
      signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (signal?.aborted) throw signal.reason;
    fail("provider_unavailable");
  }
  if (!r.ok) {
    await r.body?.cancel().catch(() => {});
    throw new SearchError(
      r.status === 401 || r.status === 403
        ? "auth_failed"
        : r.status === 429
          ? "quota_exceeded"
          : r.status >= 500
            ? "provider_unavailable"
            : "invalid_response",
      { retryAfter: retrySeconds(r.headers.get("retry-after")) },
    );
  }
  if (Number(r.headers.get("content-length")) > 2 * 1024 * 1024) {
    await r.body?.cancel().catch(() => {});
    fail("invalid_response");
  }
  const reader = r.body?.getReader();
  if (!reader) fail("invalid_response");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) fail("invalid_response");
      chunks.push(value);
    }
    const d = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!d || typeof d !== "object" || Array.isArray(d))
      fail("invalid_response");
    return d;
  } catch (e) {
    if (signal?.aborted) throw signal.reason;
    if (e instanceof SearchError) throw e;
    fail("invalid_response");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export class NeuralDeepProvider {
  constructor({ getCredential, fetcher = fetch, ...options } = {}) {
    this.getCredential = getCredential || (()=>credential(options));
    this.fetcher = fetcher;
  }
  async request(route, body, signal) {
    const token = await this.getCredential();
    if (!token) fail("credentials_missing");
    return boundedJson(`https://api.neuraldeep.ru/v1/search/${route}`, {
      method: body ? "POST" : "GET",
      body,
      token,
      signal,
      fetcher: this.fetcher,
    });
  }
  async search(input, signal) {
    const query = [
      input.query,
      ...(input.domains.length
        ? [`(${input.domains.map((d) => `site:${d}`).join(" OR ")})`]
        : []),
    ].join(" ");
    const d = await this.request(
      "web",
      { query, limit: input.max_results },
      signal,
    );
    if (d.success !== true || !Array.isArray(d.results))
      fail("invalid_response");
    return {
      items: d.results,
      quota: d.quota,
      warnings: [
        ...(input.freshness !== "any"
          ? ["freshness_requires_source_verification"]
          : []),
        ...(input.language ? ["language_filter_not_guaranteed"] : []),
      ],
    };
  }
  async read(url, signal) {
    const d = await this.request("crawl", { url, limit: 1 }, signal);
    if (d.success !== true || !Array.isArray(d.pages)) fail("invalid_response");
    return {
      items: d.pages.slice(0, 1),
      quota: d.quota,
      warnings: ["remote_crawl_redirects_not_controlled_by_pritha"],
    };
  }
  async quota(signal) {
    for (let n = 0; n < 2; n++) {
      try {
        const d = await this.request("quota", null, signal);
        if (!d.search || !d.crawl) fail("invalid_response");
        return d;
      } catch (e) {
        if (n || e.code !== "provider_unavailable" || signal.aborted) throw e;
      }
    }
  }
}
export class SearxngProvider {
  constructor(url, { fetcher = fetch } = {}) {
    this.url = searxngUrl(url);
    this.fetcher = fetcher;
  }
  async search(input, signal) {
    const u = new URL(this.url);
    u.searchParams.set(
      "q",
      [
        input.query,
        ...(input.domains.length
          ? [`(${input.domains.map((d) => `site:${d}`).join(" OR ")})`]
          : []),
      ].join(" "),
    );
    u.searchParams.set("format", "json");
    u.searchParams.set("safesearch", "1");
    if (input.language) u.searchParams.set("language", input.language);
    if (["day", "week", "month", "year"].includes(input.freshness))
      u.searchParams.set("time_range", input.freshness);
    const d = await boundedJson(u, { signal, fetcher: this.fetcher });
    if (!Array.isArray(d.results)) fail("invalid_response");
    return {
      items: d.results.slice(0, input.max_results),
      warnings:
        input.freshness === "any"
          ? []
          : ["freshness_requires_source_verification"],
    };
  }
  async read() {
    fail("provider_unavailable");
  }
}

export async function credentialStatus(options={}) {
  try{return providerCredentialStatus('neuraldeep',options).status;}catch{return 'missing_or_locked';}
}
