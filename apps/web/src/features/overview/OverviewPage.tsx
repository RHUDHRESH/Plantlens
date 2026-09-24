import { RuntimeHMI } from "../plant-runtime/RuntimeHMI";

/** Operator overview. Hosts the existing runtime HMI inside the v2 shell while it is rebuilt. */
export function OverviewPage() {
  return <RuntimeHMI />;
}
