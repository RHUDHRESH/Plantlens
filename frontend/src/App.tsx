import { useEffect } from "react";
import { useStore } from "./store/useStore";
import { Scene } from "./three/Scene";
import { StatusStrip } from "./components/StatusStrip";
import { CalmCard } from "./components/CalmCard";
import { Plant2D } from "./fallback2d/Plant2D";

export default function App() {
  const { connect, degraded, activeSituation } = useStore();

  useEffect(() => {
    void connect();
  }, [connect]);

  return (
    <div className="flex h-full flex-col">
      <StatusStrip />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1">
          {degraded ? <Plant2D /> : <Scene />}
        </main>
        {activeSituation && (
          <aside className="w-96 border-l border-white/10 p-4">
            <CalmCard situation={activeSituation} />
          </aside>
        )}
      </div>
    </div>
  );
}
