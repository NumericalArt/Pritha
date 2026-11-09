const SAFE_CODE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;
const PUBLIC_CODES = new Set(['invalid_api_key','invalid_credentials','key_model_access_denied','insufficient_balance','insufficient_quota','payment_required','billing_access_required','policy_denied','access_denied','model_unavailable','model_not_found','rate_limited','rate_limit_exceeded','context_length_exceeded','invalid_request_error','provider_unavailable']);
const TRANSPORT_CODES = new Set(['provider_timeout','provider_iteration_deadline','iteration_deadline','job_deadline','operator_cancel','client_disconnect','host_shutdown','host_signal','provider_token_budget','provider_budget_endpoint','provider_budget_exhausted','provider_budget_unknown','provider_usage_unconfirmed','provider_retry_exhausted','provider_retry_window','neuraldeep_empty_response','neuraldeep_output_limit','neuraldeep_tool_arguments','neuraldeep_response_incomplete','neuraldeep_response_failed','neuraldeep_response_cancelled','neuraldeep_response_too_large','neuraldeep_stream_encoding','neuraldeep_stream_failed','neuraldeep_stream_identity','neuraldeep_stream_malformed','neuraldeep_stream_order','neuraldeep_stream_size','neuraldeep_stream_text_changed','neuraldeep_stream_truncated','neuraldeep_stream_unsupported_item','neuraldeep_model_identity_mismatch','attachment_original_not_preserved','attachment_provider_payload_too_large','attachment_runtime_unsupported','model_image_unsupported','model_image_unverified','image_format_unverified','invalid_image_encoding','econnreset','econnrefused','etimedout','enotfound','und_err_socket','und_err_body_timeout']);

const LOCAL_TOOL_CODES = new Set(['factory_token_budget_exhausted', 'factory_time_budget_exhausted', 'provider_tools_unsupported', 'provider_tool_identity_mismatch', 'invalid_responses_input', 'provider_receipt_failed', 'attachment_image_missing', 'attachment_transport_unverified', 'attachment_manifest_invalid', 'attachment_integrity_failed']);

export function safeProviderRetryAfter(value) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (/^\d{1,6}$/.test(text)) return String(Math.min(Number(text), 86400));
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text) && Number.isFinite(Date.parse(text))) return new Date(text).toUTCString();
  return null;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeCode(value) {
  const code = typeof value === "string" ? value.trim().slice(0, 96) : "";
  return SAFE_CODE.test(code) ? code.toLowerCase() : null;
}

function providerDetails(payload) {
  const root = record(payload);
  const error = record(root.error);
  const code = [error.code,root.code,error.type,root.type].map(safeCode).find(value=>PUBLIC_CODES.has(value)) || null;
  const message = [typeof root.error === "string" ? root.error : null, error.message, root.message, error.detail, root.detail]
    .filter((value) => typeof value === "string")
    .join(" ")
    .slice(0, 2_000)
    .toLowerCase();
  return { code, message, type: [error.type,root.type].map(safeCode).find(value=>PUBLIC_CODES.has(value)) || null };
}

/**
 * Convert a provider response into a stable, non-secret error contract.
 * Raw provider messages are used for classification only and are never returned.
 */
export function classifyNeuralDeepProviderError({ status, payload, transportCode, retryAfter } = {}) {
  const statusCode = status != null && status !== "" && Number.isInteger(Number(status)) ? Number(status) : null;
  const details = providerDetails(payload);
  const candidate = safeCode(transportCode);
  const transport = TRANSPORT_CODES.has(candidate) || LOCAL_TOOL_CODES.has(candidate) ? candidate : null;
  const retry = safeProviderRetryAfter(retryAfter);

  if (LOCAL_TOOL_CODES.has(transport)) {
    return { class: 'input', code: transport, status: statusCode, retryAfter: null };
  }

  if (['provider_timeout','provider_iteration_deadline','iteration_deadline','job_deadline','operator_cancel','client_disconnect','host_shutdown','host_signal'].includes(transport)) {
    return {class:'control',code:transport,status:statusCode,retryAfter:null};
  }

  if (/^provider_(?:token_budget|budget_|usage_unconfirmed)/.test(transport || '')) {
    return { class: 'input', code: transport, status: statusCode, retryAfter: null };
  }
  if (/^neuraldeep_(?:stream_|empty_response|output_limit|tool_arguments|response_incomplete|response_failed|response_cancelled)/.test(transport || '')) {
    return {class:'input',code:transport,status:statusCode,retryAfter:null};
  }

  if (/^(?:attachment_|model_image_|image_format_|invalid_image_encoding|neuraldeep_model_identity_mismatch)/.test(transport || "")) {
    return { class: "input", code: transport, status: statusCode, retryAfter: null };
  }

  // NeuralDeep can return HTTP 401 + numeric code for a valid key whose model
  // is outside its access list. Preserve the explicit type before the status.
  if ([401,403].includes(statusCode) && [details.type, details.code].includes("key_model_access_denied")) {
    return { class: "access_denied", code: "key_model_access_denied", status: statusCode, retryAfter: null };
  }
  if (statusCode === 401) {
    return { class: "credentials", code: details.code || "invalid_credentials", status: 401, retryAfter: null };
  }
  if (statusCode === 404) {
    return { class: "model_unavailable", code: details.code || "model_unavailable", status: 404, retryAfter: null };
  }
  if (statusCode === 429) {
    return { class: "rate_limit", code: details.code || "rate_limited", status: 429, retryAfter: retry };
  }
  if (statusCode === 402) {
    return { class: "billing", code: details.code || "payment_required", status: 402, retryAfter: null };
  }
  if (statusCode === 403) {
    const billingSignal = `${details.code || ""} ${details.message}`;
    const billing = /(wallet|balance|billing|payment|insufficient|entitlement|subscription|plan|tariff|quota|credit|fund)/i.test(billingSignal);
    return billing
      ? { class: "billing", code: details.code || "billing_access_required", status: 403, retryAfter: null }
      : { class: "access_denied", code: details.code || "access_denied", status: 403, retryAfter: null };
  }
  if (statusCode != null && statusCode >= 500) {
    return { class: "outage", code: transport || details.code || "provider_unavailable", status: statusCode, retryAfter: retry };
  }
  if (statusCode == null || transport) {
    return { class: "outage", code: transport || "network_error", status: statusCode, retryAfter: retry };
  }
  return { class: "request", code: details.code || `http_${statusCode}`, status: statusCode, retryAfter: retry };
}

export function parseProviderErrorPayload(bufferOrText) {
  try {
    const text = Buffer.isBuffer(bufferOrText) ? bufferOrText.toString("utf8") : String(bufferOrText || "");
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
