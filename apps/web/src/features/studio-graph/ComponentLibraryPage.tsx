import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { issueDevToken } from "../../api/client";
import { setAuthToken } from "../../api/config";
import { ComponentPalette } from "./ComponentPalette";
import { fetchComponentLibrary } from "./componentLibraryApi";

export function ComponentLibraryPage() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await issueDevToken("viewer");
        if (!cancelled) {
          setAuthToken(token);
          setAuthReady(true);
        }
      } catch {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const libraryQuery = useQuery({
    queryKey: ["component-library"],
    queryFn: ({ signal }) => fetchComponentLibrary(signal),
    enabled: authReady,
  });

  return (
    <div className="library-page">
      <header className="library-page__header">
        <div>
          <h1>Component Library</h1>
          <p className="component-palette__summary">
            Standard industrial parts catalog — metadata preview for assembly studio.
          </p>
        </div>
        <nav>
          <Link to="/studio">← Studio forms</Link>
        </nav>
      </header>

      {libraryQuery.isLoading ? <p>Loading component library…</p> : null}
      {libraryQuery.error ? (
        <p className="library-page__error">
          Failed to load library. Ensure the API is running and you are authenticated.
        </p>
      ) : null}
      {libraryQuery.data ? <ComponentPalette components={libraryQuery.data.components} /> : null}
    </div>
  );
}