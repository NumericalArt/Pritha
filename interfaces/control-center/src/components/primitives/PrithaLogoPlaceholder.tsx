export function PrithaLogoPlaceholder({ size = 44 }: { size?: number }) {
  return (
    <div className="pritha-logo" style={{ width: size, height: size }} aria-label="Pritha logo">
      <img className="pritha-logo-image" src="/pritha-logo.png" alt="" draggable={false} />
    </div>
  );
}
