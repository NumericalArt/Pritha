import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import process from 'node:process';
import { RESPONSES_REQUEST_LIMIT } from "./attachment-policy.mjs";
import { classifyNeuralDeepProviderError, parseProviderErrorPayload, safeProviderRetryAfter } from "./provider-error.mjs";
import { normalizeResponsesSse, responsesUsage, responsesSummary, responsesTerminalSummary, parseSseData } from "./responses-normalizer.mjs";
import { ResponsesStreamNormalizer, writeResponseChunk } from "./responses-stream.mjs";
export { normalizeResponsesSse, responsesUsage } from "./responses-normalizer.mjs";
import { requestDeadlineWindow } from './creation-execution-policy.mjs';
import {normalizeModelExecutionRequest} from './model-execution-profile.mjs';
import {projectProviderToolRequest,wireCall} from '../lib/provider-tool-projection.mjs';
import {normalizeTextToolOutputs} from './responses-input-policy.mjs';

function createDispatcher(options,timeout){
  if(options.createDispatcher)return options.createDispatcher(timeout);
  const {Agent}=process.getBuiltinModule('node:module').createRequire(new URL('../../interfaces/control-center/package.json',import.meta.url))('undici');
  return new Agent({headersTimeout:timeout,bodyTimeout:timeout});
}
const DEFAULT_UPSTREAM = "https://api.neuraldeep.ru";
const DEFAULT_REQUEST_LIMIT = RESPONSES_REQUEST_LIMIT;
const DEFAULT_RESPONSE_LIMIT = 32 * 1024 * 1024;
// The catalog uses unqualified IDs; verified upstream terminals can use these
// publisher-qualified IDs (Kimi observed 2026-11-09). Each exact pair is an
// equivalence, not generic prefix stripping or permission to change models.
const responseModelMatches=(requested,returned)=>returned===requested
  || ['gpt-oss-20b','gpt-oss-120b'].includes(requested) && returned==='openai/'+requested
  || requested==='kimi-k3.1-pro' && returned==='moonshotai/kimi-k3.1-pro';
// NeuralDeep advertises a 900-second gateway deadline; allow its terminal response to arrive.
const DEFAULT_UPSTREAM_TIMEOUT_MS = 930_000;
const upstreamDispatchers = new WeakMap();
// A complete provider rejection carries no output. Resend the identical bytes a
// bounded number of times before the turn fails; every attempt is admitted and
// settled separately (see recordProviderResponse).
const PROVIDER_RETRY_ATTEMPTS = 3;
const RETRYABLE_PROVIDER_STATUS = new Set([429, 502, 503, 504]);
const PROVIDER_RETRY_DELAYS_MS = [5_000, 20_000];
const PROVIDER_RETRY_AFTER_CAP_MS = 60_000;
// A buffered response whose stream broke before any byte reached the caller is
// resent the same way; its attempt settles at the reservation's upper bound.
const BROKEN_STREAM_CODES = new Set(["neuraldeep_stream_truncated", "ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_BODY_TIMEOUT"]);
const brokenStream = error => BROKEN_STREAM_CODES.has(error?.code) || BROKEN_STREAM_CODES.has(error?.cause?.code) || (error instanceof TypeError && error.message === "terminated");
// NeuralDeep ends a Gemma 4 response cut at max_output_tokens with response.completed, status
// "incomplete" and no incomplete reason (2026-09-28): the status and the reached limit decide.
function unfinishedResponseError(summary, eventType, status) {
  const state = summary?.status || String(eventType || "").replace(/^response\./, "");
  if (eventType === "response.completed" && state === "completed") return null;
  const cut = summary?.incompleteReason === "max_output_tokens" || state === "incomplete" && summary?.outputLimitReached;
  return classifyNeuralDeepProviderError({ status, transportCode: cut ? "neuraldeep_output_limit" : `neuraldeep_response_${state}` });
}

export function providerRetryRequestHash(requestHash, attempt) {
  return createHash("sha256").update(`${requestHash}:provider-retry:${attempt}`).digest("hex");
}

export function providerRetryDelayMs(attempt, status, retryAfter) {
  const seconds = Number(retryAfter);
  if (status === 429 && Number.isFinite(seconds) && seconds >= 0) return Math.min(PROVIDER_RETRY_AFTER_CAP_MS, Math.max(1_000, seconds * 1000));
  return PROVIDER_RETRY_DELAYS_MS[Math.min(attempt, PROVIDER_RETRY_DELAYS_MS.length) - 1];
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort',aborted); resolve(); }, ms);
    signal.addEventListener("abort", aborted, { once: true });
  });
}
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

async function readNodeBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error(`Request body exceeds ${limit} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function readWebBody(response, limit, onChunk) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    if (chunk.length) onChunk?.(chunk.length);
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error(`Upstream response exceeds ${limit} bytes`), { code: "neuraldeep_response_too_large" });
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function upstreamHeaders(requestHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(requestHeaders)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

function copyResponseHeaders(upstream, response, protectedBoundary = false) {
  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (protectedBoundary) {
      if (lower === 'content-type') response.setHeader('content-type',value.includes('text/event-stream') ? 'text/event-stream' : 'application/json');
      if (lower === 'retry-after' && safeProviderRetryAfter(value)) response.setHeader('retry-after',safeProviderRetryAfter(value));
      continue;
    }
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === "content-encoding") continue;
    response.setHeader(name, value);
  }
}

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

export function createNeuralDeepAdapter(options = {}) {
  const upstreamOrigin = new URL(options.upstreamOrigin || DEFAULT_UPSTREAM);
  const requestLimit = options.requestLimit || DEFAULT_REQUEST_LIMIT;
  const responseLimit = options.responseLimit || DEFAULT_RESPONSE_LIMIT;
  const upstreamTimeoutMs = options.upstreamTimeoutMs || (options.deadline?.version===2
    ? options.deadline.requestTimeoutMs : DEFAULT_UPSTREAM_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (upstreamOrigin.protocol !== "https:") throw new Error("NeuralDeep upstream must use HTTPS");
  // Only explicitly injected fixture transports may exercise the legacy raw proxy.
  // Real dispatch uses a per-process loopback capability; the provider key stays in this host.
  const protectedBoundary = options.localToken !== undefined || !options.fetchImpl;
  if (protectedBoundary && (!/^[A-Za-z0-9_-]{32,256}$/.test(options.localToken || '')
    || typeof options.upstreamAuthorization !== 'string' || !/^Bearer [^\r\n\0]{1,8192}$/.test(options.upstreamAuthorization))) throw new Error('provider_adapter_credentials_required');
  if (protectedBoundary && (upstreamOrigin.origin !== DEFAULT_UPSTREAM || upstreamOrigin.username || upstreamOrigin.password)) throw new Error('provider_adapter_origin_invalid');
  const localDigest = protectedBoundary ? createHash('sha256').update(`Bearer ${options.localToken}`).digest() : null;
  const transformStream = protectedBoundary ? raw => parseSseData(options.transformResponsesStream ? options.transformResponsesStream(raw) : raw).map(event => {
    if (event.response?.error || event.error) {
      const classified = classifyNeuralDeepProviderError({status:502,payload:{error:event.response?.error || event.error}});
      const error = {code:classified.code,message:'The selected provider response did not complete.'};
      event = {...event,...(event.error ? {error} : {}),...(event.response ? {response:{...event.response,error}} : {})};
    }
    return `data: ${JSON.stringify(event)}\n\n`;
  }).join('') : options.transformResponsesStream;
  // Node fetch has separate 300-second header/body timers unless its dispatcher overrides them.
  const dispatcher = options.fetchImpl ? undefined : createDispatcher(options,upstreamTimeoutMs);

  const server = createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/healthz") {
      sendJson(response, 200, { ok: true, service: "pritha-neuraldeep-responses-adapter" });
      return;
    }
    if (protectedBoundary) {
      if (request.headers.origin || !timingSafeEqual(localDigest,createHash('sha256').update(String(request.headers.authorization || '')).digest())) {
        sendJson(response,401,{error:{code:'provider_adapter_unauthorized',message:'The local task transport requires its own capability.'}});return;
      }
      if (!(request.method === 'POST' && requestUrl.pathname === '/v1/responses' || request.method === 'GET' && requestUrl.pathname === '/v1/models')) {
        sendJson(response,404,{error:{code:'provider_adapter_endpoint_invalid',message:'This endpoint is unavailable to task tools.'}});return;
      }
    }
    // Codex expects its private catalog schema here, while NeuralDeep correctly
    // returns the public OpenAI { data: [...] } shape. An empty compatible
    // refresh keeps Codex on its fallback metadata for the explicitly selected
    // model without treating the standard upstream response as a transport
    // failure.
    if (request.method === "GET" && requestUrl.pathname === "/v1/models") {
      sendJson(response, 200, { models: [] });
      return;
    }
    if (!requestUrl.pathname.startsWith("/v1/")) {
      sendJson(response, 404, { error: { message: "Only /v1/* is proxied" } });
      return;
    }

    const controller = new AbortController();
    const timings = { upstreamStartedAt: null, firstByteMs: null, lastByteMs: null, responseCompletedMs: null, responseBytes: 0, timedOut: false };
    let timeout, heartbeat, cancellationReason=null, notified=false, progressAt=0;
    const abort = (code,message) => {
      cancellationReason ||= code;
      controller.abort(Object.assign(new Error(message),{code}));
    };
    const abortIfClientLeaves = () => {
      if (!response.writableEnded) abort('client_disconnect','Codex disconnected from the adapter');
    };
    response.once("close", abortIfClientLeaves);
    let upstreamAttempted = false;
    let requestHash = null, dispatchHash = null, responsesPayload = null,toolMapping=null;
    let pendingModelMetadata=false;
    const projectResponse=value=>{
      if(!toolMapping)return value;
      if((value?.model || pendingModelMetadata) && !responseModelMatches(responsesPayload?.model,value?.model))throw Object.assign(new Error('Provider model identity changed.'),{code:'neuraldeep_model_identity_mismatch',statusCode:502});
      return Array.isArray(value?.output)?{...value,output:value.output.map(item=>wireCall(item,toolMapping))}:value;
    };
    const transformResponseStream=raw=>{
      const value=transformStream?transformStream(raw):raw;if(!toolMapping)return value;
      return parseSseData(value).map(event=>{
        // Billing evidence belongs to the provider response, including a
        // complete response whose tool identity is rejected below.
        if(['response.completed','response.incomplete','response.failed','response.cancelled'].includes(event.type)){
          providerUsage=responsesUsage(JSON.stringify(event.response),'application/json');
          responseSummary=responsesTerminalSummary(event.response,{eventType:event.type,outputLimit});
        }
        if(event.item)event.item=wireCall(event.item,toolMapping,{partial:event.type==='response.output_item.added'});
        if(event.response){
          const prelude=['response.created','response.in_progress'].includes(event.type);
          if(prelude && (pendingModelMetadata || event.response.model && !responseModelMatches(responsesPayload?.model,event.response.model))){
            // Live NeuralDeep can announce a gateway placeholder model before
            // the selected model appears in its terminal snapshot. Quarantine
            // this metadata, and all output, until that exact identity and the
            // complete stream are verified. Never normalize an actual result
            // from another model or release a tool on provisional metadata.
            if(response.headersSent || !['queued','in_progress'].includes(event.response.status)
              || !Array.isArray(event.response.output) || event.response.output.length)throw Object.assign(new Error('Provider model identity changed.'),{code:'neuraldeep_model_identity_mismatch',statusCode:502});
            pendingModelMetadata=true;
            const {model:unverifiedModel,...metadata}=event.response;event.response=metadata;
          }else event.response=projectResponse(event.response);
        }
        return 'data: '+JSON.stringify(event)+'\n\n';
      }).join('');
    };
    let providerUsage = null;
    let responseSummary = null, outputLimit = null;
    const progress=(state,force=false)=>{
      if(!force && Date.now()-progressAt<1000)return;
      progressAt=Date.now();
      try {options.onProgress?.({requestHash,state,elapsedMs:Date.now()-startedAt,timings:{...timings}});}catch{/* Metadata diagnostics cannot break a request. */}
    };
    const received=bytes=>{
      const elapsedMs=Date.now()-Date.parse(timings.upstreamStartedAt);
      const first=timings.firstByteMs===null;
      timings.firstByteMs ??= elapsedMs;timings.lastByteMs=elapsedMs;timings.responseBytes+=bytes;
      progress('receiving',first);
    };
    const notifyRequest=async event=>{if(!notified){notified=true;try{await options.onRequest?.({method:request.method,path:requestUrl.pathname,
      durationMs:Date.now()-startedAt,timings:{...timings},cancellationReason,requestHash:dispatchHash,upstreamAttempted,usage:providerUsage,responseSummary,...event});}
      catch{throw Object.assign(new Error('The host could not record the provider receipt.'),{code:'provider_receipt_failed',statusCode:503});}}};
    try {
      const window=requestDeadlineWindow(options.deadline);
      const requestDeadlineAt=startedAt+Math.min(upstreamTimeoutMs,window ?? upstreamTimeoutMs);
      timeout=setTimeout(()=>{
        timings.timedOut=true;
        abort(window!==null?'iteration_deadline':'provider_timeout','Pritha stopped the response at its local request deadline');
      },Math.min(upstreamTimeoutMs,window ?? upstreamTimeoutMs));
      if(options.responsesOnly && requestUrl.pathname !== '/v1/responses')throw Object.assign(new Error('This budgeted adapter accepts only Responses requests.'),{code:'provider_budget_endpoint',statusCode:409});
      let body = await readNodeBody(request, requestLimit);
      if (requestUrl.pathname === "/v1/responses") {
        let payload;
        try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body || Buffer.alloc(0))); }
        catch { throw Object.assign(new Error("Invalid Responses JSON request."), { statusCode: 400 }); }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Object.assign(new Error("Invalid Responses request."), { statusCode: 400 });
        await options.validateResponsesRequest?.(payload, body);
        if(options.allowedTools){const projection=projectProviderToolRequest(payload,options.allowedTools);payload=projection.payload;toolMapping=projection.map;}
        if(protectedBoundary)payload=normalizeTextToolOutputs(payload);
        if (options.transformResponsesRequest) payload = options.transformResponsesRequest(payload);
        payload=normalizeModelExecutionRequest(payload);
        // Identity belongs to the caller's request. A shrinking host response
        // cap must not turn an exact retry into a new payable request.
        requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
        dispatchHash = requestHash;
        if (options.prepareResponsesRequest) payload = await options.prepareResponsesRequest(payload,{requestHash});
        outputLimit = payload.max_output_tokens;
        body = Buffer.from(JSON.stringify(payload));
        requestDeadlineWindow(options.deadline);
        if(controller.signal.aborted) throw controller.signal.reason;
        dispatchHash = requestHash;
        responsesPayload = payload;
        await options.beforeResponsesDispatch?.({ requestHash, model: payload.model, bytes: body.length, payload });
      }
      const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstreamOrigin);
      const isResponses = requestUrl.pathname === "/v1/responses";
      const maxAttempts = isResponses && requestHash ? Math.min(3,Math.max(1, options.providerRetryAttempts ?? (protectedBoundary ? 1 : PROVIDER_RETRY_ATTEMPTS))) : 1;
      let upstream, upstreamStartedAt, rejectedBody = null, bufferedBody = null;
      for (let attempt = 1; ; attempt += 1) {
        upstreamAttempted = true;
        upstreamStartedAt = Date.now();
        Object.assign(timings, { upstreamStartedAt: new Date(upstreamStartedAt).toISOString(), firstByteMs: null, lastByteMs: null, responseCompletedMs: null, responseBytes: 0 });
        progress('waiting',true);
        clearInterval(heartbeat);
        heartbeat=setInterval(()=>progress(timings.firstByteMs===null?'waiting':'receiving'),options.heartbeatMs || 5000);heartbeat.unref?.();
        upstream = await fetchImpl(target, {
          method: request.method,
          headers: protectedBoundary ? new Headers({ 'authorization':options.upstreamAuthorization, 'content-type':'application/json', 'accept':'text/event-stream, application/json' }) : upstreamHeaders(request.headers),
          body,
          redirect: "error",
          signal: controller.signal,
          dispatcher,
        });
        const buffered = isResponses && upstream.ok && !(upstream.headers.get("content-type")?.includes("text/event-stream") && typeof response.write === "function"
          && (!options.validateResponsesResponse || options.requiresBufferedResponse?.() === false));
        let attemptBody, broken = null;
        if (buffered) {
          // Nothing reaches the caller until the whole response is read, so a
          // stream that breaks here can be resent without partial output.
          try {
            attemptBody = await readWebBody(upstream, responseLimit, received);
            timings.responseCompletedMs = Date.now() - upstreamStartedAt;
            if (upstream.headers.get("content-type")?.includes("text/event-stream")) normalizeResponsesSse(transformStream ? transformStream(attemptBody.toString("utf8")) : attemptBody.toString("utf8"));
          } catch (error) {
            if (controller.signal.aborted) throw error;
            if (brokenStream(error)) broken = Object.assign(new Error("The provider response stream broke before it completed."), { code: "neuraldeep_stream_truncated", statusCode: 502 });
            // A complete but unusable response (empty, malformed, over the limit) is classified below, once.
            else if (attemptBody === undefined) throw error;
          }
          if (!broken) { bufferedBody = attemptBody; break; }
        } else if (upstream.ok || !isResponses || !RETRYABLE_PROVIDER_STATUS.has(upstream.status) || attempt >= maxAttempts) break;
        else attemptBody = await readWebBody(upstream, responseLimit, received);
        // The provider rejected the request completely, or its stream broke before
        // any byte reached the caller. Settle this attempt, then resend the
        // identical bytes under a derived dispatch identity.
        timings.responseCompletedMs = Date.now() - upstreamStartedAt;
        const status = broken ? 502 : upstream.status;
        const retryAfter = broken ? null : upstream.headers.get("retry-after");
        const retry = attempt < maxAttempts;
        const delayMs = !retry ? 0 : options.providerRetryDelayMs ? options.providerRetryDelayMs(attempt, status, retryAfter) : providerRetryDelayMs(attempt, status, retryAfter);
        await options.onRequest?.({ method: request.method, path: requestUrl.pathname, status, durationMs: Date.now() - startedAt,
          timings: { ...timings }, cancellationReason: null, requestHash: dispatchHash, upstreamAttempted: true, usage: null, responseSummary: null,
          ...(broken ? { streamBroken: true } : { providerRejected: true }), retry: retry ? { attempt, maxAttempts, nextDelayMs: delayMs } : null,
          error: broken ? classifyNeuralDeepProviderError({ status, transportCode: broken.code })
            : classifyNeuralDeepProviderError({ status, payload: parseProviderErrorPayload(attemptBody), retryAfter }) });
        const retryHash = providerRetryRequestHash(requestHash, attempt + 1);
        // Start another attempt only when it can finish inside this request's window.
        const fits = Date.now() + delayMs + (Date.now() - upstreamStartedAt) + 5_000 < requestDeadlineAt;
        try {
          if (!retry) throw Object.assign(new Error("Provider attempts are exhausted."), { code: "provider_retry_exhausted" });
          if (!fits) throw Object.assign(new Error("No time remains for another provider attempt."), { code: "provider_retry_window" });
          await abortableDelay(delayMs, controller.signal);
          requestDeadlineWindow(options.deadline);
          await options.beforeResponsesDispatch?.({ requestHash: retryHash, model: responsesPayload?.model, bytes: body.length, payload: responsesPayload, retryOf: requestHash, attempt: attempt + 1 });
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason ?? error;
          // Another attempt was not admitted: return the outcome already recorded.
          notified = true;
          if (broken) throw broken;
          rejectedBody = attemptBody;
          break;
        }
        dispatchHash = retryHash;
      }
      const isEventStream = upstream.headers.get("content-type")?.includes("text/event-stream");
      const stream=isResponses && upstream.ok && isEventStream && typeof response.write==='function'
        && (!options.validateResponsesResponse || options.requiresBufferedResponse?.()===false);
      if(stream) {
        const deferred=[];let deferredBytes=0;
        const write=async chunk=>{
          if(!response.headersSent){copyResponseHeaders(upstream,response,protectedBoundary);response.writeHead(upstream.status);}
          await writeResponseChunk(response,chunk,controller.signal);
        };
        const normalizer=new ResponsesStreamNormalizer({maxBytes:responseLimit,transform:transformResponseStream,
          onTerminal:event=>{
            providerUsage=responsesUsage(JSON.stringify(event.response),'application/json');
            responseSummary=responsesTerminalSummary(event.response,{eventType:event.type,outputLimit});
          },
          write:async chunk=>{
            if(pendingModelMetadata){
              deferredBytes+=Buffer.byteLength(chunk);
              if(deferredBytes>responseLimit)throw Object.assign(new Error('Deferred response exceeds its bounded size.'),{code:'neuraldeep_response_too_large',statusCode:502});
              deferred.push(chunk);return;
            }
            await write(chunk);
          }});
        for await(const chunk of upstream.body || []) {if(chunk.length)received(chunk.length);await normalizer.push(chunk);}
        timings.responseCompletedMs=Date.now()-upstreamStartedAt;
        const events=normalizer.finish(),terminal=normalizer.terminal;
        const error=unfinishedResponseError(responseSummary,terminal.type,upstream.status);
        // Close the accounting gap before any complete tool can cause Codex to
        // submit another request. Partial public text never settles the turn.
        await notifyRequest({status:upstream.status,error});
        await normalizer.flush(events);
        for(const chunk of deferred)await write(chunk);
        response.end();progress('finished',true);return;
      }
      const upstreamBody = rejectedBody ?? bufferedBody ?? await readWebBody(upstream, responseLimit, received);
      if (protectedBoundary && !upstream.ok) {
        const error=classifyNeuralDeepProviderError({status:upstream.status,payload:parseProviderErrorPayload(upstreamBody),retryAfter:upstream.headers.get('retry-after')});
        if(error.retryAfter)response.setHeader('retry-after',error.retryAfter);
        sendJson(response,upstream.status,{error:{code:error.code,message:'The selected task provider could not accept the request.'}});
        await notifyRequest({status:upstream.status,providerRejected:true,error});progress('finished',true);return;
      }
      if (!rejectedBody && !bufferedBody) timings.responseCompletedMs = Date.now() - upstreamStartedAt;
      if(isResponses)providerUsage=responsesUsage(upstreamBody.toString('utf8'),upstream.headers.get('content-type') || '');
      if(isResponses)responseSummary=responsesSummary(upstreamBody.toString('utf8'),upstream.headers.get('content-type') || '',{outputLimit});
      if(isResponses && upstream.ok)await options.validateResponsesResponse?.(upstreamBody.toString('utf8'),upstream.headers.get('content-type') || '');
      const output = isResponses && isEventStream
        ? Buffer.from(normalizeResponsesSse(transformResponseStream(upstreamBody.toString("utf8"))))
        : isResponses && upstream.ok && toolMapping ? Buffer.from(JSON.stringify(projectResponse(JSON.parse(upstreamBody.toString('utf8'))))) : upstreamBody;
      await notifyRequest({
        method: request.method,
        path: requestUrl.pathname,
        status: upstream.status,
        durationMs: Date.now() - startedAt,
        timings: { ...timings },
        cancellationReason,
        requestHash: dispatchHash,
        upstreamAttempted,
        usage: providerUsage,
        // The provider's complete error response reached us; no output was streamed to Codex.
        providerRejected: isResponses && !upstream.ok,
        error: upstream.ok ? responseSummary && responseSummary.status!=='completed'
          ? unfinishedResponseError(responseSummary,`response.${responseSummary.status}`,upstream.status) : null : classifyNeuralDeepProviderError({
          status: upstream.status,
          payload: parseProviderErrorPayload(upstreamBody),
          retryAfter: upstream.headers.get("retry-after"),
        }),
      });
      // Buffered JSON can contain executable tools too. Persist accounting
      // before releasing any output, just as for the streaming path above.
      copyResponseHeaders(upstream, response,protectedBoundary);
      response.setHeader("content-length", output.length);
      response.writeHead(upstream.status);
      response.end(output);
      progress('finished',true);
    } catch (error) {
      if(error?.code==='neuraldeep_empty_response' && responseSummary?.outputLimitReached) {
        error=Object.assign(new Error('The response reached its output limit without a visible answer.'),{code:'neuraldeep_output_limit',statusCode:502});
      }
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
      if (!response.destroyed && !response.headersSent) {
        sendJson(response, statusCode, { error: protectedBoundary ? {code:classifyNeuralDeepProviderError({status:statusCode,transportCode:error?.code}).code,message:'The selected task transport did not complete the request.'} : { message: error instanceof Error ? error.message : String(error) } });
      } else if (!response.destroyed && !response.writableEnded) {
        // HTTP status is already committed; explicitly terminate the SSE as a
        // failure. Never present the partial text as response.completed.
        const code=protectedBoundary ? classifyNeuralDeepProviderError({transportCode:error?.code}).code : typeof error?.code==='string' && /^[a-z_]{1,96}$/.test(error.code)?error.code:'neuraldeep_stream_failed';
        response.end(`data: ${JSON.stringify({type:'response.failed',response:{status:'failed',error:{code,message:'Response stream did not complete.'}}})}\n\ndata: [DONE]\n\n`);
      }
      try { await notifyRequest({
        method: request.method,
        path: requestUrl.pathname,
        status: statusCode,
        durationMs: Date.now() - startedAt,
        timings: { ...timings },
        cancellationReason: cancellationReason || (error?.code==='provider_iteration_deadline'?'iteration_deadline':null),
        requestHash: dispatchHash,
        upstreamAttempted,
        usage: providerUsage,
        ...(error?.toolDiagnostic?{toolDiagnostic:error.toolDiagnostic}:{}),
        error: classifyNeuralDeepProviderError({
          status: Number.isInteger(error?.statusCode) ? error.statusCode : null,
          transportCode: cancellationReason || (error?.name === "AbortError" ? "provider_timeout" : error?.code),
        }),
        ...(!protectedBoundary && typeof error?.detail === "string" ? { errorDetail: error.detail } : {}),
      }); } catch { /* Failed accounting stays blocked; do not reject the HTTP handler. */ }
      progress('failed',true);
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      response.off("close", abortIfClientLeaves);
    }
  });
  if (dispatcher) upstreamDispatchers.set(server, dispatcher);
  return server;
}

export async function listenNeuralDeepAdapter(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = options.port ?? 17861;
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error("NeuralDeep adapter may bind only to a loopback host");
  }
  const server = createNeuralDeepAdapter(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

export async function closeNeuralDeepAdapter(server) {
  if (!server) return;
  if (server.listening) await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections?.();
  });
  const dispatcher = upstreamDispatchers.get(server);
  upstreamDispatchers.delete(server);
  await dispatcher?.close();
}
