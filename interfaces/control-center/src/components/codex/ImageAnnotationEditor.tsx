"use client";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ANNOTATION_COLORS, annotationHistory, drawAnnotations, emptyAnnotationHistory, exportAnnotation, imagePoint, loadAnnotationImage, type Annotation, type Point } from "@/lib/codex-chat/image-annotation";

type Props = { href: string; name: string; opener?: HTMLElement | null; onApply: (blob: Blob) => Promise<void>; onClose: () => void };
export default function ImageAnnotationEditor({ href, name, opener, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [history, setHistory] = useState(emptyAnnotationHistory);
  const [tool, setTool] = useState<Annotation["tool"]>("arrow");
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[2]);
  const [width, setWidth] = useState(6), [fontSize, setFontSize] = useState(36);
  const [stroke, setStroke] = useState<Annotation | null>(null), strokeRef = useRef<Annotation | null>(null);
  const pointer = useRef<number | null>(null);
  const [textAt, setTextAt] = useState<Point | null>(null), [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null), [discard, setDiscard] = useState(false), [saving, setSaving] = useState(false);
  const alive = useRef(true), applying = useRef(false);
  const exported = useRef<{ actions: Annotation[]; blob: Blob } | null>(null);
  const dirty = history.present.length > 0 || Boolean(stroke) || Boolean(textAt && text);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    alive.current = true;
    const previous = opener || document.activeElement;
    dialog.current?.showModal();
    return () => { alive.current = false; dialog.current?.close(); requestAnimationFrame(() => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(() => controller.abort(), 35_000);
    void loadAnnotationImage(href, controller.signal).then(value => { if (!controller.signal.aborted) setImage(value); }).catch(cause => {
      if (!disposed && alive.current) setError(controller.signal.aborted ? "Loading the image timed out. Close the editor and try again." : cause instanceof Error ? cause.message : "The image could not load.");
    }).finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [href]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !image) return;
    el.width = image.naturalWidth; el.height = image.naturalHeight;
    const ctx = el.getContext("2d");
    if (!ctx) { setError("The image editor is unavailable in this browser."); return; }
    try { drawAnnotations(ctx, image, el.width, el.height, [...history.present, ...(stroke ? [stroke] : [])]); }
    catch { setError("The image could not be drawn. The original has been kept."); }
  }, [image, history.present, stroke]);
  function close() {
    if (applying.current) return;
    if (dirtyRef.current) setDiscard(true); else onCloseRef.current();
  }
  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    return imagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), image!.naturalWidth, image!.naturalHeight);
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!image || saving || event.button !== 0 || pointer.current !== null) return;
    event.preventDefault(); const p = point(event);
    if (tool === "text") { setTextAt(p); return; }
    event.currentTarget.focus(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
    const next: Annotation = { tool, points: [p], color, width };
    strokeRef.current = next; setStroke(next);
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = strokeRef.current; if (!current || event.pointerId !== pointer.current) return;
    const p = point(event);
    const next = { ...current, points: current.tool === "pen" ? (current.points.length < 10_000 ? [...current.points, p] : current.points) : [current.points[0], p] };
    strokeRef.current = next; setStroke(next);
  }
  function end(event: ReactPointerEvent<HTMLCanvasElement>, cancelled = false) {
    if (event.pointerId !== pointer.current) return;
    if (!cancelled) move(event);
    const current = strokeRef.current;
    pointer.current = null; strokeRef.current = null; setStroke(null);
    if (current && !cancelled) setHistory(state => annotationHistory(state, { type: "add", value: current }));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function apply() {
    if (!image || !history.present.length || textAt || strokeRef.current || applying.current) return;
    applying.current = true; setSaving(true); setError(null);
    try {
      const blob = exported.current?.actions === history.present ? exported.current.blob : await exportAnnotation(image, history.present);
      exported.current = { actions: history.present, blob };
      if (!alive.current) return;
      await onApply(blob);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "The copy could not be saved. Your original was kept."); }
    finally { applying.current = false; if (alive.current) setSaving(false); }
  }
  return <dialog ref={dialog} className="codex-image-editor" aria-label="Image annotation" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
    // A modal key must never reach the composer. Native text editing keeps its undo.
    event.stopPropagation();
    if (event.key === "Tab") {
      // WebKit can move focus to browser chrome even with a native modal dialog.
      // Keep a deterministic cycle through its visible, enabled controls.
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      if (targets.length) {
        event.preventDefault(); const index = targets.indexOf(document.activeElement as HTMLElement);
        targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
      }
      return;
    }
    if (saving || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); setHistory(state => annotationHistory(state, { type: event.shiftKey ? "redo" : "undo" })); }
  }}>
    <div className="codex-editor-header"><strong>Annotate: {name}</strong><button type="button" disabled={saving} onClick={close}>Cancel</button></div>
    <fieldset disabled={saving || !image} className="codex-editor-toolbar">
      <legend className="sr-only">Annotation tools</legend>
      {([["arrow", "Arrow"], ["rectangle", "Rectangle"], ["pen", "Pen"], ["text", "Text"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={tool === value} onClick={() => setTool(value)}>{label}</button>)}
      <label>Color <select aria-label="Color" value={color} onChange={event => setColor(event.target.value)}>{ANNOTATION_COLORS.map((value, i) => <option key={value} value={value}>{["Black", "White", "Red", "Orange", "Yellow", "Green", "Blue"][i]}</option>)}</select></label>
      <label>Stroke width <select aria-label="Stroke width" value={width} onChange={event => setWidth(Number(event.target.value))}>{[3, 6, 12].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Text size <select aria-label="Text size" value={fontSize} onChange={event => setFontSize(Number(event.target.value))}>{[24, 36, 48].map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" disabled={!history.past.length || Boolean(stroke)} onClick={() => setHistory(state => annotationHistory(state, { type: "undo" }))}>Undo</button>
      <button type="button" disabled={!history.future.length || Boolean(stroke)} onClick={() => setHistory(state => annotationHistory(state, { type: "redo" }))}>Redo</button>
    </fieldset>
    {!image && !error ? <p role="status">Loading image…</p> : null}
    <div className="codex-editor-workspace">{image ? <canvas ref={canvas} tabIndex={0} aria-label="Annotation canvas" onPointerDown={start} onPointerMove={move} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => { if (pointer.current === event.pointerId) end(event, true); }} /> : null}</div>
    {textAt ? <div className="codex-editor-text"><label>Annotation text<textarea autoFocus aria-label="Annotation text" maxLength={2000} value={text} onChange={event => setText(event.target.value)} disabled={saving} /></label><button type="button" disabled={saving || !text.trim()} onClick={() => {
      setHistory(state => annotationHistory(state, { type: "add", value: { tool: "text", points: [textAt], text, color, width, fontSize } })); setTextAt(null); setText("");
    }}>Add text</button><button type="button" disabled={saving} onClick={() => { setTextAt(null); setText(""); }}>Cancel text</button></div> : null}
    {error ? <p role="status">{error}</p> : null}
    {discard ? <div role="alert" className="codex-editor-discard"><span>Close without saving annotations?</span><button type="button" onClick={() => onCloseRef.current()}>Discard changes</button><button type="button" onClick={() => setDiscard(false)}>Keep editing</button></div> : null}
    <div className="codex-editor-footer"><small>PNG · original resolution · original preserved</small><button type="button" className="codex-text-action" disabled={!image || !history.present.length || Boolean(textAt) || Boolean(stroke) || saving || discard} onClick={() => void apply()}>{saving ? "Saving…" : "Apply"}</button></div>
  </dialog>;
}
