import type { AssetHMIState, CausalityEdgeHMI } from "../../app/schemas/plantHmi";
import { AssetStatusCard } from "./AssetStatusCard";

interface CausalChainProps {
  assets: AssetHMIState[];
  edges: CausalityEdgeHMI[];
}

export function CausalChain({ assets, edges }: CausalChainProps) {
  if (assets.length === 0) {
    return (
      <section className="hmi-causal-chain hmi-causal-chain--empty" aria-label="Assets and causality">
        <h2>Assets & causality</h2>
        <p>No asset state available.</p>
      </section>
    );
  }

  return (
    <section className="hmi-causal-chain" aria-label="Assets and causality">
      <h2>Assets & causality</h2>
      <div className="hmi-causal-chain__assets">
        {assets.map((asset) => (
          <AssetStatusCard key={asset.asset_id} asset={asset} />
        ))}
      </div>
      {edges.length === 0 ? (
        <p className="hmi-causal-chain__empty-edges">No causality edges supplied.</p>
      ) : (
        <ul className="hmi-causal-chain__edges">
          {edges.map((edge) => (
            <li key={edge.edge_id} className={edge.active ? "is-active" : ""}>
              {edge.from_asset_id} → {edge.to_asset_id} ({edge.relation})
              {edge.active ? " · active path" : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}