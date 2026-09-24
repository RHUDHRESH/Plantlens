import type { AssetHMIState } from "../../app/schemas/plantHmi";
import { StatusBadge } from "../../components/ui/primitives";
import { assetStatusKind, statusLabel } from "./statusStyles";

interface AssetStatusCardProps {
  asset: AssetHMIState;
}

export function AssetStatusCard({ asset }: AssetStatusCardProps) {
  return (
    <article className="hmi-item hmi-asset-card">
      <header className="hmi-item__head">
        <div>
          <h3 className="hmi-item__title">{asset.name}</h3>
          <p className="hmi-meta" data-tabular>
            {asset.asset_id} · {asset.kind}
          </p>
        </div>
        <StatusBadge compact status={assetStatusKind(asset.status)} label={statusLabel(asset.status)} />
      </header>
      <p className="hmi-asset-card__health">
        Health <span data-tabular>{asset.health_score.toFixed(0)}</span>
      </p>
      {asset.primary_signals.length > 0 && (
        <p className="hmi-meta">Signals: {asset.primary_signals.join(", ")}</p>
      )}
      {asset.active_faults.length > 0 && (
        <p className="hmi-meta">Active faults: {asset.active_faults.join(", ")}</p>
      )}
      {asset.downstream_impacts.length > 0 && (
        <p className="hmi-meta">Downstream impacts: {asset.downstream_impacts.join(", ")}</p>
      )}
    </article>
  );
}
