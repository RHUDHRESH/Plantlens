import { useMemo } from "react";

export function useWebGLAvailable(): boolean {
  return useMemo(() => {
    if (typeof document === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      return !!gl;
    } catch {
      return false;
    }
  }, []);
}