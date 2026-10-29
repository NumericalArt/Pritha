export const ANNOTATION_LIMITS = { pixels: 16_000_000, side: 8192, bytes: 100 * 1024 * 1024 };
export const ANNOTATION_COLORS = ["#000000", "#ffffff", "#ef4444", "#f97316", "#facc15", "#22c55e", "#2563eb"] as const;
export type Point = { x: number; y: number };
export type Annotation = { tool: "pen" | "arrow" | "rectangle" | "text"; points: Point[]; color: string; width: number; text?: string; fontSize?: number };
export type AnnotationHistory = { past: Annotation[][]; present: Annotation[]; future: Annotation[][] };
export const emptyAnnotationHistory = (): AnnotationHistory => ({ past: [], present: [], future: [] });
export function annotationHistory(state: AnnotationHistory, action: { type: "add"; value: Annotation } | { type: "undo" | "redo" }): AnnotationHistory {
  if (action.type === "add") return { past: [...state.past, state.present], present: [...state.present, action.value], future: [] };
  if (action.type === "undo" && state.past.length) return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
  if (action.type === "redo" && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  return state;
}
export function imagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, width: number, height: number): Point {
  return { x: Math.max(0, Math.min(width, (clientX - rect.left) * width / rect.width)), y: Math.max(0, Math.min(height, (clientY - rect.top) * height / rect.height)) };
}
export function assertImageDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new Error("The image dimensions could not be verified.");
  if (width > ANNOTATION_LIMITS.side || height > ANNOTATION_LIMITS.side || width * height > ANNOTATION_LIMITS.pixels) throw new Error("Annotation supports images up to 16 megapixels and 8192 pixels per side. The original can still be sent.");
}

/** Inspect compressed headers before browser decoding; animated files stay untouched. */
export function annotationImageInfo(bytes: Uint8Array): { width: number; height: number; type: string } {
  if (bytes.length > ANNOTATION_LIMITS.bytes) throw new Error("The image exceeds the 100 MiB limit.");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, count: number) => String.fromCharCode(...bytes.subarray(at, at + count));
  let width = 0, height = 0, type = "";
  if (bytes.length >= 33 && ascii(1, 3) === "PNG" && data.getUint32(0) === 0x89504e47 && ascii(12, 4) === "IHDR") {
    width = data.getUint32(16); height = data.getUint32(20); type = "image/png";
    let ended = false;
    for (let at = 8; at + 12 <= bytes.length;) {
      const size = data.getUint32(at), kind = ascii(at + 4, 4);
      if (kind === "acTL") throw new Error("Animated images cannot be annotated. The original can still be sent.");
      if (size > bytes.length - at - 12) throw new Error("The PNG is incomplete.");
      if (kind === "IEND") { ended = true; break; }
      at += size + 12;
    }
    if (!ended) throw new Error("The PNG is incomplete.");
  } else if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    type = "image/webp";
    for (let at = 12; at + 8 <= bytes.length;) {
      const kind = ascii(at, 4), size = data.getUint32(at + 4, true), p = at + 8;
      if (size > bytes.length - p) throw new Error("The WebP is incomplete.");
      if (kind === "ANIM" || (kind === "VP8X" && size >= 10 && (bytes[p] & 2))) throw new Error("Animated images cannot be annotated. The original can still be sent.");
      if (kind === "VP8X" && size >= 10) {
        width = 1 + (bytes[p + 4] | bytes[p + 5] << 8 | bytes[p + 6] << 16); height = 1 + (bytes[p + 7] | bytes[p + 8] << 8 | bytes[p + 9] << 16);
      } else if (!width && kind === "VP8 " && size >= 10) {
        width = data.getUint16(p + 6, true) & 0x3fff; height = data.getUint16(p + 8, true) & 0x3fff;
      } else if (!width && kind === "VP8L" && size >= 5) {
        const bits = data.getUint32(p + 1, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
      }
      at = p + size + (size & 1);
    }
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    type = "image/jpeg";
    for (let at = 2; at + 4 <= bytes.length;) {
      if (bytes[at] !== 255) break;
      const marker = bytes[at + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { at++; continue; }
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) { at += 2; continue; }
      const size = data.getUint16(at + 2);
      if (size < 2 || at + 2 + size > bytes.length) throw new Error("The JPEG is incomplete.");
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && size >= 7) {
        height = data.getUint16(at + 5); width = data.getUint16(at + 7); break;
      }
      at += 2 + size;
    }
  }
  if (!type) throw new Error("Annotation supports static PNG, JPEG and WebP images. The original can still be sent.");
  assertImageDimensions(width, height);
  return { width, height, type };
}

export function drawAnnotations(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, actions: Annotation[]) {
  ctx.clearRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
  for (const action of actions) {
    const a = action.points[0], b = action.points.at(-1);
    if (!a || !b) continue;
    ctx.save(); ctx.strokeStyle = action.color; ctx.fillStyle = action.color; ctx.lineWidth = action.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (action.tool === "text") {
      const size = action.fontSize || 36; ctx.font = `${size}px sans-serif`; ctx.textBaseline = "top";
      (action.text || "").split("\n").forEach((line, index) => ctx.fillText(line, a.x, a.y + index * size * 1.2));
    } else if (action.tool === "rectangle") ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    else {
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (action.tool === "pen") {
        for (const point of action.points.slice(1)) ctx.lineTo(point.x, point.y);
        if (action.points.length === 1) ctx.lineTo(a.x + .1, a.y);
      } else ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (action.tool === "arrow") {
        const angle = Math.atan2(b.y - a.y, b.x - a.x), head = Math.max(12, action.width * 4);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6)); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

export async function loadAnnotationImage(href: string, signal: AbortSignal) {
  if (!/^\/api\/codex-chat\/v1\/attachments\/[a-f0-9-]{36}$/i.test(href)) throw new Error("The image address could not be verified.");
  const response = await fetch(href, { signal, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("The original image is unavailable. Your attachment has been kept.");
  const blob = await response.blob();
  if (blob.size > ANNOTATION_LIMITS.bytes) throw new Error("The image exceeds the 100 MiB limit.");
  const info = annotationImageInfo(new Uint8Array(await blob.arrayBuffer()));
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    image.src = url; await image.decode(); signal.throwIfAborted();
    assertImageDimensions(image.naturalWidth, image.naturalHeight);
    if (!(image.naturalWidth === info.width && image.naturalHeight === info.height) && !(info.type === "image/jpeg" && image.naturalWidth === info.height && image.naturalHeight === info.width)) throw new Error("The browser changed the image resolution. Your original has been kept.");
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function exportAnnotation(image: HTMLImageElement, actions: Annotation[]): Promise<Blob> {
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("The image editor is unavailable in this browser.");
  try {
    drawAnnotations(ctx, image, canvas.width, canvas.height, actions);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob || blob.size > ANNOTATION_LIMITS.bytes) throw new Error("The annotated image could not be exported within the 100 MiB limit.");
    return blob;
  } finally { canvas.width = 0; canvas.height = 0; }
}
