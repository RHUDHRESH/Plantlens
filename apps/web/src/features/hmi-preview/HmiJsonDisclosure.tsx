import { useState } from "react";
import type { PlantHMIState } from "../../app/schemas/plantHmi";

interface HmiJsonDisclosureProps {
  state: PlantHMIState;
}

export function HmiJsonDisclosure({ state }: HmiJsonDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="hmi-json-disclosure">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "Hide" : "View"} raw PlantHMIState JSON
      </button>
      {open && (
        <pre className="hmi-json-disclosure__pre" data-tabular>
          {JSON.stringify(state, null, 2)}
        </pre>
      )}
    </section>
  );
}