type Props = { label: string | null };

export function WorkingIndicator({ label }: Props) {
  return <span className="codex-working-indicator" role="status" aria-live="polite" aria-atomic="true">
    {label ? <><span>{label}</span><span className="codex-working-dots" aria-hidden="true"><span /><span /><span /></span></> : null}
  </span>;
}
