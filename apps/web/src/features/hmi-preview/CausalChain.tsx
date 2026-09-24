import type { AssetHMIState, CausalityEdgeHMI } from "../../app/schemas/plantHmi";
import { Panel } from "../../components/ui/primitives";
import { AssetStatusCard } from "./AssetStatusCard";

interface CausalChainProps {
  assets: AssetHMIState[];
  edges: CausalityEdgeHMI[];
}

export function CausalChain({ assets, edges }: CausalChainProps) {
  return (
    <Panel title="Assets & causality" aria-label="Assets and causality" className="hmi-card hmi-card--wide">
      {assets.length === 0 ? (
        <p className="hmi-muted">No asset state available.</p>
      ) : (
        <>
          <div className="hmi-causal-chain__assets">
            {assets.map((asset) => (
              <AssetStatusCard key={asset.asset_id} asset={asset} />
            ))}
          </div>
          {edges.length === 0 ? (
            <p className="hmi-muted">No causality edges supplied.</p>
          ) : (
            <ul className="hmi-causal-chain__edges">
              {edges.map((edge) => (
                <li key={edge.edge_id} className={edge.active ? "is-active" : ""}>
                  <span className="pl-mono">{edge.from_asset_id}</span>
                  <span aria-hidden> → </span>
                  <span className="pl-mono">{edge.to_asset_id}</span>
                  <span className="hmi-muted"> ({edge.relation})</span>
                  {edge.active ? <span className="hmi-causal-chain__active"> · active path</span> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
