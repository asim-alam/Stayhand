"use client";

import { useEffect, useState } from "react";

export type CoolingItem = {
  id: string;
  text: string;
  sendsAt: number;
};

export function CoolingDrawer({
  items,
  onCancel,
  onEdit,
  onSendNow,
}: {
  items: CoolingItem[];
  onCancel: (id: string) => void;
  onEdit: (id: string, nextText: string) => void;
  onSendNow: (id: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!items.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [items.length]);

  if (!items.length) {
    return null;
  }

  return (
    <aside className="cooling-drawer animate-in">
      <div className="cooling-drawer__header">
        <span className="eyebrow">cooling · {items.length}</span>
        <span className="top-link subtle">a short wait, on purpose</span>
      </div>

      <div className="cooling-drawer__list">
        {items.map((item) => {
          const remainingMs = Math.max(0, item.sendsAt - now);
          const pct = Math.max(0, Math.min(1, 1 - remainingMs / 30000));
          const seconds = Math.ceil(remainingMs / 1000);
          const editing = editingId === item.id;

          return (
            <article key={item.id} className="cooling-item">
              {editing ? (
                <>
                  <textarea
                    className="real-textarea"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    autoFocus
                  />
                  <div className="cooling-item__actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => {
                        setEditingId(null);
                        setDraft("");
                      }}
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => {
                        onEdit(item.id, draft);
                        setEditingId(null);
                        setDraft("");
                      }}
                    >
                      Save edit
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>{item.text}</p>
                  <div className="cooling-item__progress">
                    <span style={{ width: `${pct * 100}%` }} />
                  </div>
                  <div className="cooling-item__footer">
                    <span>sends in {seconds}s</span>
                    <div className="cooling-item__actions">
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => {
                          setEditingId(item.id);
                          setDraft(item.text);
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="button ghost" onClick={() => onCancel(item.id)}>
                        Cancel
                      </button>
                      <button type="button" className="button primary" onClick={() => onSendNow(item.id)}>
                        Send anyway
                      </button>
                    </div>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}

