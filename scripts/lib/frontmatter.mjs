const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Bounded YAML flow collections used by authored metadata. This is deliberately
// a small data parser: no tags, anchors, object constructors or evaluation.
function splitFlow(value, separator) {
  const parts = [];
  let start = 0, depth = 0, quote = "", escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\" && quote === '"') { escaped = true; continue; }
      if (char === quote) {
        if (quote === "'" && value[i + 1] === "'") { i++; continue; }
        quote = "";
      }
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") { if (--depth < 0) return null; }
    else if (char === separator && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  return quote || depth ? null : [...parts, value.slice(start)];
}

function parseScalar(value, depth = 0) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return "";
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return Object.create(null);
  if (depth >= 12 || trimmed.length > 65_536) return trimmed;
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    const inner = trimmed.slice(1, -1).trim();
    const parts = inner ? splitFlow(inner, ",") : [];
    if (parts === null || parts.some(item => !item.trim())) return trimmed;
    if (trimmed.startsWith("[")) return parts.map(item => parseScalar(item, depth + 1));
    const result = Object.create(null);
    for (const part of parts) {
      const pair = splitFlow(part, ":");
      if (!pair || pair.length < 2) return trimmed;
      const key = pair[0].trim().replace(/^["']|["']$/g, "");
      if (!/^[A-Za-z0-9_-]+$/.test(key) || Object.hasOwn(result, key)) return trimmed;
      if (!FORBIDDEN_KEYS.has(key.toLowerCase())) result[key] = parseScalar(pair.slice(1).join(":"), depth + 1);
    }
    return result;
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { data: {}, body: text, raw: "" };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: text, raw: "" };

  const raw = text.slice(4, end);
  const body = text.slice(end + 5);
  const data = parseFrontmatterBlock(raw);

  return { data, body, raw };
}

export function parseFrontmatterData(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return parseFrontmatterBlock(text.slice(4, end));
}

function parseFrontmatterBlock(raw) {
  const lines = raw.split(/\r?\n/);
  const data = Object.create(null);
  let currentKey = null;
  let currentNestedKey = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const topMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (topMatch) {
      if (FORBIDDEN_KEYS.has(topMatch[1].toLowerCase())) {
        currentKey = null;
        currentNestedKey = null;
        continue;
      }
      currentKey = topMatch[1];
      currentNestedKey = null;
      data[currentKey] = parseScalar(topMatch[2] ?? "");
      continue;
    }

    const nestedMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (nestedMatch && currentKey) {
      if (FORBIDDEN_KEYS.has(nestedMatch[1].toLowerCase())) {
        currentNestedKey = null;
        continue;
      }
      if (!data[currentKey] || Array.isArray(data[currentKey]) || typeof data[currentKey] !== "object") {
        data[currentKey] = Object.create(null);
      }
      currentNestedKey = nestedMatch[1];
      data[currentKey][currentNestedKey] = parseScalar(nestedMatch[2] ?? "");
      continue;
    }

    const listMatch = line.match(/^\s{2,4}-\s*(.*)$/);
    if (listMatch && currentKey) {
      const value = parseScalar(listMatch[1]);
      if (currentNestedKey && data[currentKey] && typeof data[currentKey] === "object" && !Array.isArray(data[currentKey])) {
        if (!Array.isArray(data[currentKey][currentNestedKey])) data[currentKey][currentNestedKey] = [];
        data[currentKey][currentNestedKey].push(value);
      } else {
        if (!Array.isArray(data[currentKey])) data[currentKey] = [];
        data[currentKey].push(value);
      }
    }
  }

  return data;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

export function yamlString(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).replace(/\n/g, " ");
}

export function yamlList(values) {
  const list = unique(values);
  if (list.length === 0) return "[]";
  return `\n${list.map((item) => `  - ${yamlString(item)}`).join("\n")}`;
}

export function indentedYamlList(values, spaces = 4) {
  const list = unique(values);
  if (list.length === 0) return " []";
  const pad = " ".repeat(spaces);
  return `\n${list.map((item) => `${pad}- ${yamlString(item)}`).join("\n")}`;
}
