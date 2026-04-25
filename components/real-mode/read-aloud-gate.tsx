"use client";

export function ReadAloudGate({
  open,
  text,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  text: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true">
      <div className="drawer read-aloud-gate">
        <div>
          <div className="eyebrow">read it out loud</div>
          <h3>Long replies deserve your own ear first.</h3>
          <p className="lede" style={{ marginTop: 12 }}>
            If it feels different out loud than it did in the composer, that difference matters.
          </p>
        </div>

        <div className="read-aloud-gate__quote">
          <p>“{text}”</p>
        </div>

        <div className="row spread">
          <button type="button" className="button ghost" onClick={onCancel}>
            Let me reconsider
          </button>
          <button type="button" className="button primary" onClick={onConfirm}>
            I read this out loud
          </button>
        </div>
      </div>
    </div>
  );
}
