interface RuntimeUnavailableNoticeProps {
  isNetworkError?: boolean;
}

export function RuntimeUnavailableNotice({ isNetworkError = false }: RuntimeUnavailableNoticeProps) {
  return (
    <div className="hmi-runtime-unavailable" role="alert">
      {isNetworkError ? (
        <p>
          Could not reach PlantLens API. Check that the backend is running and VITE_API_BASE_URL is
          configured.
        </p>
      ) : (
        <p>
          Runtime HMI endpoint is not available yet. Use Scenario Preview, or enable the backend
          runtime bridge route at GET /api/hmi/runtime.
        </p>
      )}
    </div>
  );
}