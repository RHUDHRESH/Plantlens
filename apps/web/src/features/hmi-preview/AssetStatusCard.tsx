import type { AssetHMIState } from "../../app/schemas/plantHmi";
import { assetStatusClass } from "./statusStyles";

interface AssetStatusCardProps {
  asset: AssetHMIState;
}

export function AssetStatusCard({ asset }: AssetStatusCardProps) {
  return (
    <article className="hmi-asset-card">
      <header className="hmi-asset-card__head">
        <div>
          <h3>{asset.name}</h3>
          <p className="hmi-asset-card__id" data-tabular>
            {asset.asset_id} · {asset.kind}
          </p>
        </div>
        <span className={assetStatusClass(asset.status)}>{asset.status}</span>
      </header>
      <p className="hmi-asset-card__health" data-tabular>
        Health {asset.health_score.toFixed(0)}
      </p>
      {asset.primary_signals.length > 0 && (
        <p>Signals: {asset.primary_signals.join(", ")}</p>
      )}
      {asset.active_faults.length > 0 && (
        <p>Active faults: {asset.active_faults.join(", ")}</p>
      )}
      {asset.downstream_impacts.length > 0 && (
        <p>Downstream impacts: {asset.downstream_impacts.join(", ")}</p>
      )}
    </article>
  );
}