import { DEMO_SOURCE_FILES } from "./demoHmiCompilerData";

function statusMarker(status: string): string {
  switch (status) {
    case "valid":
      return "✓";
    case "warning":
      return "!";
    case "missing":
      return "×";
    default:
      return "○";
  }
}

export function SourceModelList() {
  return (
    <section className="pl-hmi-source-list" aria-label="Source model files">
      <h3 className="pl-hmi-source-list__title">Source</h3>
      <ul className="pl-hmi-source-list__items">
        {DEMO_SOURCE_FILES.map((file) => (
          <li key={file.id} className={`pl-hmi-source-list__item--${file.status}`}>
            <span className="pl-hmi-source-list__marker" aria-hidden="true">
              {statusMarker(file.status)}
            </span>
            <div className="pl-hmi-source-list__body">
              <code className="pl-hmi-source-list__filename">{file.filename}</code>
              <span className="pl-hmi-source-list__purpose">{file.purpose}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}