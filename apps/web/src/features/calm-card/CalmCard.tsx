import { useState } from "react";
import type { CalmCard as CalmCardType } from "../../app/schemas/calmCard";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { cn } from "@/lib/utils";
import { BlockedActions } from "./BlockedActions";
import { EvidenceChain } from "./EvidenceChain";
import { FirstSignal } from "./FirstSignal";
import { RawAlarmDisclosure } from "./RawAlarmDisclosure";
import { RecommendedAction } from "./RecommendedAction";
import { TimeToConsequenceRing } from "./TimeToConsequenceRing";

interface CalmCardProps {
  card: CalmCardType;
  onViewRawAlarms?: () => void;
  onEscalate?: () => void;
  onExplain?: () => void;
  onHighlightAsset?: (assetId: string) => void;
  onFocusRoot?: () => void;
  escalating?: boolean;
}

function severityVariant(severity: CalmCardType["severity"]): "critical" | "warning" | "secondary" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "secondary";
}

export function CalmCard({
  card,
  onViewRawAlarms,
  onEscalate,
  onExplain,
  onHighlightAsset,
  onFocusRoot,
  escalating,
}: CalmCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(
    () => card.severity === "warning" || card.severity === "critical",
  );

  const severityClass =
    card.severity === "critical"
      ? "calm-card--critical"
      : card.severity === "warning"
        ? "calm-card--warning"
        : "";

  return (
    <Card
      className={cn("calm-card border-0 shadow-none rounded-none", severityClass)}
      aria-labelledby="calm-card-title"
    >
      <CardHeader className="calm-card__header space-y-2 p-4 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle id="calm-card-title" className="text-lg">
            {card.title}
          </CardTitle>
          <Badge variant={severityVariant(card.severity)}>{card.severity}</Badge>
        </div>
        <div className="calm-card__root-row">
          <p className="calm-card__root">
            Root: <strong>{card.root_asset_name ?? card.root_asset_id}</strong>
          </p>
          {onFocusRoot && (
            <Button type="button" variant="ghost" size="sm" onClick={onFocusRoot}>
              Focus root
            </Button>
          )}
        </div>
        {card.confidence && (
          <span className="calm-card__confidence data-number">Confidence: {card.confidence}</span>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4 pt-0">
        {card.first_signal && <FirstSignal signal={card.first_signal} />}

        {card.why_it_matters && (
          <section className="calm-card__why">
            <h3>Why it matters</h3>
            <p>{card.why_it_matters}</p>
          </section>
        )}

        <RecommendedAction check={card.recommended_first_check} />

        <button
          type="button"
          className="calm-card__details-toggle"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
        >
          {detailsOpen ? "Hide" : "Show"} evidence & details
        </button>

        {detailsOpen && (
          <div className="calm-card__details">
            <EvidenceChain
              items={card.evidence_chain}
              {...(onHighlightAsset ? { onHighlightAsset } : {})}
            />
            {card.time_to_consequence && <TimeToConsequenceRing ttc={card.time_to_consequence} />}
            {card.blocked_actions && <BlockedActions actions={card.blocked_actions} />}
          </div>
        )}
      </CardContent>

      <CardFooter className="calm-card__footer flex-col items-stretch gap-2 p-4 pt-0">
        <RawAlarmDisclosure
          count={card.raw_alarm_count}
          {...(onViewRawAlarms ? { onView: onViewRawAlarms } : {})}
        />
        <p className="calm-card__authority">{card.operator_authority}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onExplain ? (
            <Button type="button" variant="outline" className="flex-1" onClick={onExplain}>
              Explain
            </Button>
          ) : null}
          <Button
            type="button"
            className="flex-1"
            onClick={onEscalate}
            disabled={!onEscalate || escalating}
          >
            {escalating ? "Opening incident…" : "Escalate to Incident Room"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export function NoActiveSituation() {
  return (
    <Card className="calm-card calm-card--empty shadow-none" role="status">
      <CardHeader>
        <CardTitle>All clear</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p>No active situation. Plant health and map status remain visible.</p>
        <p className="calm-card__empty-hint">Raw alarms stay available in the strip below — never hidden.</p>
      </CardContent>
    </Card>
  );
}
