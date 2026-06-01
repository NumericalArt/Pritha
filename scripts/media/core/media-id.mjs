import { slug as makeSlug } from "../../lib/slug.mjs";
import { today } from "../../lib/date.mjs";
import { hashText } from "./hash.mjs";

export function createMediaId({ title, input, date = today() }) {
  const titleSlug = makeSlug(title || input || "media", {
    stripUrls: true,
    allowCyrillic: false,
    maxLength: 72,
    fallback: "media",
  });
  return `${date}-media-${titleSlug}-${hashText(input || title || Date.now(), 12)}`;
}
