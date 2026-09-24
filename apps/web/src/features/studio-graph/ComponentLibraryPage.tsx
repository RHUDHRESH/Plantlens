/** Component catalog (/eng/studio/components): every template with its ports, media and ranges. */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../app/session";
import { ComponentSymbol } from "./canvas/ComponentSymbol";
import { EmptyState, ErrorNotice, Mono, PageHeader, SegmentedControl } from "../../components/ui/primitives";
import { formatRange, mediumLabel } from "../connection-rules/media";
import { MediumChip } from "./canvas/EquipmentNode";
import { fetchComponentLibrary } from "./componentLibraryApi";
import { CATEGORY_LABELS, type ComponentCategory, type ComponentTemplate } from "./componentLibraryTypes";
import { portSummary } from "./model/portLayout";
import { matchesQuery } from "./Palette";
import { StudioFrame } from "../studio-nav/StudioFrame";
import "./studio.css";

function ComponentCard({ component }: { component: ComponentTemplate }) {
  return (
    <article className="st-card" aria-labelledby={`c-${component.component_type_id}`}>
      <header className="st-card__head">
        <ComponentSymbol componentTypeId={component.component_type_id} size={40} />
        <div>
          <h3 id={`c-${component.component_type_id}`}>{component.display_name}</h3>
          <Mono className="st-card__id">{component.component_type_id}</Mono>
        </div>
      </header>
      <p className="st-card__desc">{component.description}</p>
      <table className="st-card__ports">
        <caption className="st-sr-only">Ports of {component.display_name}</caption>
        <thead>
          <tr>
            <th scope="col">Port</th>
            <th scope="col">Dir</th>
            <th scope="col">Medium</th>
            <th scope="col">Nominal</th>
          </tr>
        </thead>
        <tbody>
          {component.ports.map((p) => (
            <tr key={p.port_id}>
              <td>
                {p.name}
                {p.required ? <span className="st-port-list__req" title="Required"> *</span> : null}
              </td>
              <td>{p.direction === "bidirectional" ? "bi" : p.direction === "input" ? "in" : "out"}</td>
              <td>
                <MediumChip medium={p.medium} /> {mediumLabel(p.medium)}
              </td>
              <td className="pl-mono">{formatRange(p.nominal_range, p.quantity_kind) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="st-card__foot">
        <span>{portSummary(component.ports)}</span>
        {component.tags.length ? <span className="st-card__tags">{component.tags.join(" · ")}</span> : null}
      </footer>
    </article>
  );
}

export function ComponentLibraryPage() {
  const ready = useSession((s) => s.status === "ready");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ComponentCategory | "all">("all");
  const libraryQuery = useQuery({
    queryKey: ["component-library"],
    queryFn: ({ signal }) => fetchComponentLibrary(signal),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const components = libraryQuery.data?.components ?? [];
  const shown = useMemo(
    () => components.filter((c) => (category === "all" || c.category === category) && matchesQuery(c, query)),
    [components, category, query],
  );

  return (
    <StudioFrame>
    <div className="pl-page">
      <PageHeader
        title="Component library"
        description="Manufacturer-neutral templates with their ports, media and nominal ranges. The connection rules read these."
        actions={
          <Link to="/eng/studio" className="pl-btn pl-btn--secondary pl-btn--md">
            Open Plant Studio <ArrowRight width={15} height={15} aria-hidden />
          </Link>
        }
      />
      <div className="st-catalog__filters">
        <label className="st-palette__search st-catalog__search">
          <Search aria-hidden />
          <input className="pl-input" type="search" placeholder="Search name, tag, medium…" aria-label="Search components" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <SegmentedControl
          label="Category"
          value={category}
          onChange={setCategory}
          options={[{ value: "all", label: `All (${components.length})` }, ...(Object.keys(CATEGORY_LABELS) as ComponentCategory[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]}
        />
      </div>
      {libraryQuery.error ? <ErrorNotice error={libraryQuery.error} /> : null}
      {libraryQuery.isLoading ? <p className="st-muted">Loading component library…</p> : null}
      {libraryQuery.data && !shown.length ? <EmptyState title="No component matches">Try another search or category.</EmptyState> : null}
      <div className="st-catalog">
        {shown.map((c) => (
          <ComponentCard key={c.component_type_id} component={c} />
        ))}
      </div>
    </div>
    </StudioFrame>
  );
}
