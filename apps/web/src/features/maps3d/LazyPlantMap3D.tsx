import { Component, lazy, Suspense, type ReactNode } from "react";
import type { PlantMap3DProps } from "./PlantMap3D";

const PlantMap3D = lazy(() =>
  import("./PlantMap3D").then((m) => ({ default: m.PlantMap3D })),
);

const PlantMap3DFallback = lazy(() =>
  import("./PlantMap3D").then((m) => ({ default: m.PlantMap3DFallback })),
);

interface LazyPlantMap3DProps extends PlantMap3DProps {
  webglAvailable: boolean;
  onSwitch2D: () => void;
}

interface ErrorBoundaryState {
  failed: boolean;
}

class Map3DErrorBoundary extends Component<
  { onSwitch2D: () => void; children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Suspense fallback={<p className="runtime-placeholder">Loading…</p>}>
          <PlantMap3DFallback onSwitch2D={this.props.onSwitch2D} />
        </Suspense>
      );
    }
    return this.props.children;
  }
}

export function LazyPlantMap3D({ webglAvailable, onSwitch2D, ...props }: LazyPlantMap3DProps) {
  if (!webglAvailable) {
    return (
      <Suspense fallback={<p className="runtime-placeholder">Loading…</p>}>
        <PlantMap3DFallback onSwitch2D={onSwitch2D} />
      </Suspense>
    );
  }
  return (
    <Map3DErrorBoundary onSwitch2D={onSwitch2D}>
      <Suspense fallback={<p className="runtime-placeholder">Loading 3D map…</p>}>
        <PlantMap3D {...props} />
      </Suspense>
    </Map3DErrorBoundary>
  );
}