import type { CalmCard as CalmCardType } from "../../app/schemas/calmCard";
import type { Situation } from "../../app/schemas/situation";
import { StatusChip } from "../../components/ui/StatusChip";
import { CalmCard } from "../calm-card/CalmCard";

interface SituationPanelProps {
  situation: Situation;
  calmCard: CalmCardType | null;
  onViewRawAlarms?: () => void;
  onEscalate?: () => void;
  onHighlightAsset?: (assetId: string) => void;
  onFocusRoot?: () => void;
  escalating?: boolean;
}

function severityVariant(severity: Situation["severity"]): "critical" | "warning" | "advisory" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "advisory";
}

export function SituationPanel({
  situation,
  calmCard,
  onViewRawAlarms,
  onEscalate,
  onHighlightAsset,
  onFocusRoot,
  escalating,
}: SituationPanelProps) {
  const groupedCount = situation.grouped_alarm_ids?.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-surface overflow-y-auto">
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[28px] leading-[34px] font-semibold font-mono tabular-nums text-ink-900">
            {groupedCount || "—"}
          </span>
          <span className="text-ink-300">→</span>
          <span className="text-[28px] leading-[34px] font-semibold font-mono text-accent">1</span>
        </div>
        <p className="text-xs text-ink-500">
          {groupedCount} alarms grouped → 1 root cause ·{" "}
          <button type="button" className="text-accent underline" onClick={onViewRawAlarms}>
            view receipts
          </button>
        </p>
      </div>

      <div className="px-4 pb-4 border-b border-line">
        <div className="space-y-2">
          <StatusChip variant={severityVariant(situation.severity)} label={situation.severity} />
          <h2 className="text-lg font-semibold text-ink-900 leading-snug">{situation.title}</h2>
          <p className="text-xs text-ink-500">
            Root cause: {situation.root_asset_name ?? situation.root_asset_id}
          </p>
        </div>
      </div>

      {calmCard ? (
        <CalmCard
          card={calmCard}
          {...(onViewRawAlarms ? { onViewRawAlarms } : {})}
          {...(onEscalate ? { onEscalate } : {})}
          {...(onHighlightAsset ? { onHighlightAsset } : {})}
          {...(onFocusRoot ? { onFocusRoot } : {})}
          escalating={escalating ?? false}
        />
      ) : (
        <div className="px-4 py-4 text-sm text-ink-500">Situation active — awaiting Calm Card.</div>
      )}
    </div>
  );
}