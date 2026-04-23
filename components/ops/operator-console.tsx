import { OperatorWorkspace } from "@/components/operator-workspace";

export function OperatorConsole() {
  return (
    <div className="ops-theme">
      <div className="ops-topbar">
        <a href="/" className="top-link">
          Back to product
        </a>
        <div className="eyebrow">Technical proof</div>
      </div>
      <OperatorWorkspace />
    </div>
  );
}
