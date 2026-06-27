const STYLE_PRESETS: Record<string, string> = {
  organ: "soft pipe organ ambient, warm sustained organ chords, slow harmonic movement, spacious reverb",
  "organ ambient": "soft pipe organ ambient, warm sustained organ chords, slow harmonic movement, spacious reverb",
  ambient: "calm ambient pads, slow evolving texture, warm and unobtrusive",
  piano: "soft felt piano, gentle minimal harmony, calm reflective mood",
  lofi: "soft lo-fi instrumental, gentle beat, warm tape texture, unobtrusive",
  orchestral: "soft cinematic orchestral underscore, warm strings, no percussion hits",
  cyberpunk: "soft futuristic synth ambience, subtle pulse, dark but non-distracting",
};

export function normalizeMusicStyleKey(style: string) {
  return String(style || "ambient")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "ambient";
}

export function normalizeStyleForPrompt(style: string) {
  const key = normalizeMusicStyleKey(style);
  return STYLE_PRESETS[key] || key;
}

export function buildBackgroundMusicPrompt(style: string) {
  return [
    "Instrumental-only background music for coding and voice assistant accompaniment.",
    `Style: ${normalizeStyleForPrompt(style)}.`,
    "No vocals, no lyrics, no spoken words.",
    "Unobtrusive, soft dynamics, low dynamic range, no sudden hits, no aggressive drums.",
    "Leave space for spoken voice and avoid lead vocal-like melodies.",
    "Smooth intro and outro, seamless loop feeling.",
    "Suitable as background under a realtime voice assistant.",
  ].join(" ");
}
