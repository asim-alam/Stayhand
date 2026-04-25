"use client";

export function SoftenSheet({
  open,
  original,
  softened,
  onDismiss,
  onSendOriginal,
  onSendSoftened,
}: {
  open: boolean;
  original: string;
  softened: string;
  onDismiss: () => void;
  onSendOriginal: () => void;
  onSendSoftened: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="soften-sheet animate-in">
      <div className="soften-sheet__header">
        <span className="eyebrow">one calmer version</span>
        <button type="button" className="top-link subtle" onClick={onDismiss}>
          dismiss
        </button>
      </div>
      <div className="soften-sheet__grid">
        <div className="soften-sheet__card">
          <span className="soften-sheet__label">original · heavy</span>
          <p>{original}</p>
          <button type="button" className="button ghost" onClick={onSendOriginal}>
            Send original
          </button>
        </div>
        <div className="soften-sheet__card soften-sheet__card--accent">
          <span className="soften-sheet__label">safer · lighter</span>
          <p>{softened}</p>
          <button type="button" className="button primary" onClick={onSendSoftened}>
            Use safer version
          </button>
        </div>
      </div>
    </div>
  );
}

