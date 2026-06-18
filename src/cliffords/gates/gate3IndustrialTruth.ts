import type {
  CanonicalAlarmEvent,
  CanonicalCausalEdgeCandidate,
  CanonicalRecord
} from "../contracts/canonical.js";
import type {
  ArchetypeLibrary,
  Clock,
  CliffordConfig,
  EquipmentRegistry,
  IdProvider,
  TagRegistry,
  ZoneRegistry
} from "../contracts/plantModel.js";
import type {
  MappingRequest,
  QuarantineRecord
} from "../contracts/quarantine.js";
import type {
  Gate3Result,
  ValidationIssue
} from "../contracts/validation.js";
import {
  getEquipmentDefinition,
  inferEquipmentFromTag,
  resolveEquipment,
  suggestEquipmentMatches
} from "../mapping/equipmentResolver.js";
import { classifySignal } from "../mapping/signalClassifier.js";
import {
  getTagDefinition,
  resolveTag,
  suggestTagMatches
} from "../mapping/tagResolver.js";
import { resolveZone } from "../mapping/zoneResolver.js";
import { normalizeEquipmentId } from "../normalizers/normalizeEquipmentId.js";
import { normalizeUnits } from "../normalizers/normalizeUnits.js";
import { createQuarantineRecord } from "../quarantine.js";

type Gate3Context = {
  tags: TagRegistry;
  equipment: EquipmentRegistry;
  zones: ZoneRegistry;
  archetypes: ArchetypeLibrary;
  config: CliffordConfig;
  clock: Clock;
  ids: IdProvider;
  previousRecords: CanonicalRecord[];
};

function canonicalId(record: CanonicalRecord): string {
  return record.record_type === "alarm_event"
    ? record.event_id
    : record.edge_candidate_id;
}

function quarantine(
  record: CanonicalRecord,
  code: string,
  message: string,
  context: Gate3Context,
  severity: QuarantineRecord["severity"] = "HIGH"
): QuarantineRecord {
  return createQuarantineRecord(
    {
      artifact_id: record.source_ref.artifact_id,
      canonical_id: canonicalId(record),
      gate: "GATE_3_TRUTH",
      severity,
      reason_code: code,
      reason_message: message,
      raw_snapshot: record
    },
    context.clock,
    context.ids
  );
}

function mappingRequest(
  issue: MappingRequest["issue"],
  rawValue: string,
  record: CanonicalRecord,
  suggestions: MappingRequest["suggested_matches"],
  context: Gate3Context
): MappingRequest {
  return {
    request_id: context.ids.next("mapping"),
    created_at_utc: context.clock.now().toISOString(),
    issue,
    raw_value: rawValue,
    suggested_matches: suggestions,
    source_ref: structuredClone(record.source_ref),
    status: "OPEN"
  };
}

function duplicateOf(
  candidate: CanonicalAlarmEvent,
  records: CanonicalRecord[],
  debounceSeconds: number
): boolean {
  const timestamp = Date.parse(candidate.timestamp_utc);
  return records.some((record) => {
    if (record.record_type !== "alarm_event") {
      return false;
    }
    if (
      candidate.source_event_id &&
      candidate.source_event_source &&
      record.source_event_id === candidate.source_event_id &&
      record.source_event_source === candidate.source_event_source
    ) {
      return true;
    }
    if (
      record.tag_id !== candidate.tag_id ||
      record.state !== candidate.state
    ) {
      return false;
    }
    return (
      Math.abs(Date.parse(record.timestamp_utc) - timestamp) <=
      debounceSeconds * 1000
    );
  });
}

function validateAlarm(
  input: CanonicalAlarmEvent,
  accepted: CanonicalRecord[],
  context: Gate3Context
): {
  clean: CanonicalAlarmEvent | null;
  quarantine: QuarantineRecord[];
  mapping: MappingRequest[];
  warnings: ValidationIssue[];
} {
  const record = structuredClone(input);
  const quarantined: QuarantineRecord[] = [];
  const mappings: MappingRequest[] = [];
  const warnings: ValidationIssue[] = [];
  if (record.source_quality === "BAD") {
    quarantined.push(
      quarantine(
        record,
        "SOURCE_QUALITY_BAD",
        "Source system marked the event data quality as bad",
        context,
        "BLOCKER"
      )
    );
  } else if (record.source_quality === "UNCERTAIN") {
    if (context.config.reject_uncertain_quality) {
      quarantined.push(
        quarantine(
          record,
          "SOURCE_QUALITY_UNCERTAIN",
          "Source system marked the event data quality as uncertain",
          context
        )
      );
    } else {
      warnings.push({
        code: "SOURCE_QUALITY_UNCERTAIN",
        message: "Source system marked event quality as uncertain",
        severity: "MEDIUM"
      });
    }
  } else if (record.source_quality === "UNKNOWN") {
    warnings.push({
      code: "SOURCE_QUALITY_UNKNOWN",
      message: "Source did not provide an explicit data quality",
      severity: "LOW"
    });
  }

  const tagResolution = resolveTag(
    record.tag_id,
    context.tags,
    context.config.mapping_confidence_threshold
  );
  if (
    tagResolution.status !== "RESOLVED" &&
    tagResolution.status !== "INFERRED_HIGH_CONFIDENCE"
  ) {
    quarantined.push(
      quarantine(
        record,
        "UNKNOWN_TAG",
        `Tag ${record.tag_id} is not resolved in the tag registry`,
        context
      )
    );
    mappings.push(
      mappingRequest(
        "UNKNOWN_TAG",
        record.tag_id,
        record,
        suggestTagMatches(record.tag_id, context.tags),
        context
      )
    );
    return {
      clean: null,
      quarantine: quarantined,
      mapping: mappings,
      warnings
    };
  }

  record.tag_id = tagResolution.id ?? record.tag_id;
  const tagDefinition = getTagDefinition(record.tag_id, context.tags);
  const expectedEquipment = tagDefinition?.equipment_id ?? null;

  if (record.equipment_id) {
    const resolution = resolveEquipment(
      record.equipment_id,
      context.equipment,
      context.config.mapping_confidence_threshold
    );
    if (
      resolution.status !== "RESOLVED" &&
      resolution.status !== "INFERRED_HIGH_CONFIDENCE"
    ) {
      quarantined.push(
        quarantine(
          record,
          "UNKNOWN_EQUIPMENT",
          `Equipment ${record.equipment_id} is not resolved`,
          context
        )
      );
      mappings.push(
        mappingRequest(
          "UNKNOWN_EQUIPMENT",
          record.equipment_id,
          record,
          suggestEquipmentMatches(record.equipment_id, context.equipment),
          context
        )
      );
    } else {
      record.equipment_id = resolution.id;
    }
  } else if (expectedEquipment) {
    const resolution = resolveEquipment(
      expectedEquipment,
      context.equipment,
      context.config.mapping_confidence_threshold
    );
    if (
      resolution.status === "RESOLVED" ||
      resolution.status === "INFERRED_HIGH_CONFIDENCE"
    ) {
      record.equipment_id = resolution.id;
    } else {
      quarantined.push(
        quarantine(
          record,
          "UNKNOWN_EQUIPMENT",
          `Tag registry references unresolved equipment ${expectedEquipment}`,
          context
        )
      );
      mappings.push(
        mappingRequest(
          "UNKNOWN_EQUIPMENT",
          expectedEquipment,
          record,
          suggestEquipmentMatches(expectedEquipment, context.equipment),
          context
        )
      );
    }
  } else {
    const guess = inferEquipmentFromTag(record.tag_id);
    quarantined.push(
      quarantine(
        record,
        "NEEDS_HUMAN_MAPPING",
        `No verified equipment mapping exists for tag ${record.tag_id}`,
        context
      )
    );
    mappings.push(
      mappingRequest(
        "UNKNOWN_EQUIPMENT",
        guess.id ?? record.tag_id,
        record,
        guess.id
          ? suggestEquipmentMatches(guess.id, context.equipment)
          : [],
        context
      )
    );
  }

  if (
    expectedEquipment &&
    record.equipment_id &&
    normalizeEquipmentId(expectedEquipment) !==
      normalizeEquipmentId(record.equipment_id)
  ) {
    quarantined.push(
      quarantine(
        record,
        "TOPOLOGY_CONFLICT",
        `Tag ${record.tag_id} belongs to ${expectedEquipment}, not ${record.equipment_id}`,
        context
      )
    );
  }

  const equipmentDefinition = record.equipment_id
    ? getEquipmentDefinition(record.equipment_id, context.equipment)
    : null;
  if (
    equipmentDefinition?.archetype_id &&
    !Object.entries(context.archetypes).some(
      ([key, archetype]) =>
        key === equipmentDefinition.archetype_id ||
        archetype.id === equipmentDefinition.archetype_id
    )
  ) {
    quarantined.push(
      quarantine(
        record,
        "NEEDS_HUMAN_MAPPING",
        `Equipment ${equipmentDefinition.id} references unknown archetype ${equipmentDefinition.archetype_id}`,
        context
      )
    );
    mappings.push(
      mappingRequest(
        "AMBIGUOUS_SIGNAL",
        equipmentDefinition.archetype_id,
        record,
        [],
        context
      )
    );
  }
  const expectedZone =
    tagDefinition?.zone_id ?? equipmentDefinition?.zone_id ?? null;
  let resolvedClaimedZone: string | null = null;
  let resolvedExpectedZone: string | null = null;

  if (record.zone_id) {
    const resolution = resolveZone(record.zone_id, context.zones);
    if (resolution.status !== "RESOLVED") {
      quarantined.push(
        quarantine(
          record,
          "UNKNOWN_ZONE",
          `Zone ${record.zone_id} is not resolved`,
          context
        )
      );
      mappings.push(
        mappingRequest("UNKNOWN_ZONE", record.zone_id, record, [], context)
      );
    } else {
      record.zone_id = resolution.id;
      resolvedClaimedZone = resolution.id;
    }
  }

  if (expectedZone) {
    const resolution = resolveZone(expectedZone, context.zones);
    if (resolution.status === "RESOLVED") {
      resolvedExpectedZone = resolution.id;
      if (!record.zone_id) {
        record.zone_id = resolution.id;
      }
    } else {
      quarantined.push(
        quarantine(
          record,
          "UNKNOWN_ZONE",
          `Registry references unresolved zone ${expectedZone}`,
          context
        )
      );
      mappings.push(
        mappingRequest("UNKNOWN_ZONE", expectedZone, record, [], context)
      );
    }
  }

  if (
    resolvedClaimedZone &&
    resolvedExpectedZone &&
    resolvedClaimedZone !== resolvedExpectedZone
  ) {
    quarantined.push(
      quarantine(
        record,
        "TOPOLOGY_CONFLICT",
        `Tag ${record.tag_id} belongs to zone ${resolvedExpectedZone}, not ${resolvedClaimedZone}`,
        context
      )
    );
  }

  const classification =
    tagDefinition?.signal_type ??
    classifySignal(
      record.tag_id,
      record.alarm_message,
      record.engineering_unit
    ).signal_type;
  const signalRule = classification
    ? context.config.signal_rules?.[record.tag_id] ??
      context.config.signal_rules?.[classification]
    : context.config.signal_rules?.[record.tag_id];
  const allowedUnits =
    signalRule?.allowed_units ??
    (tagDefinition?.engineering_unit
      ? [tagDefinition.engineering_unit]
      : undefined);
  const normalizedAllowedUnits = allowedUnits
    ?.map((unit) => normalizeUnits(unit))
    .filter((unit): unit is string => unit !== null);
  if (
    normalizedAllowedUnits &&
    record.engineering_unit &&
    !normalizedAllowedUnits.includes(record.engineering_unit)
  ) {
    quarantined.push(
      quarantine(
        record,
        "UNIT_SIGNAL_MISMATCH",
        `Unit ${record.engineering_unit} is invalid for ${classification ?? record.tag_id}`,
        context
      )
    );
  }
  if (typeof record.process_value === "number" && signalRule) {
    if (
      (signalRule.min_value !== undefined &&
        record.process_value < signalRule.min_value) ||
      (signalRule.max_value !== undefined &&
        record.process_value > signalRule.max_value)
    ) {
      quarantined.push(
        quarantine(
          record,
          "VALUE_OUT_OF_PHYSICAL_BOUNDS",
          `Value ${record.process_value} violates configured bounds`,
          context
        )
      );
    }
  }

  if (
    Date.parse(record.timestamp_utc) >
    Math.min(
      context.clock.now().getTime(),
      Date.parse(record.received_at_utc)
    ) +
      context.config.max_future_skew_sec * 1000
  ) {
    quarantined.push(
      quarantine(
        record,
        "TIMESTAMP_IMPLAUSIBLE",
        "Event timestamp is more than five minutes in the future",
        context
      )
    );
  }

  if (
    duplicateOf(
      record,
      [...context.previousRecords, ...accepted],
      context.config.duplicate_debounce_window_sec
    )
  ) {
    quarantined.push(
      quarantine(
        record,
        "DUPLICATE_EVENT",
        "An equivalent alarm exists inside the debounce window",
        context,
        "MEDIUM"
      )
    );
  }

  return {
    clean: quarantined.length === 0 ? record : null,
    quarantine: quarantined,
    mapping: mappings,
    warnings
  };
}

function validateEdge(
  input: CanonicalCausalEdgeCandidate,
  context: Gate3Context
): {
  quarantine: QuarantineRecord[];
  mapping: MappingRequest[];
} {
  const record = structuredClone(input);
  const quarantined: QuarantineRecord[] = [];
  const mappings: MappingRequest[] = [];
  for (const [role, tagId] of [
    ["cause", record.cause_tag_id],
    ["effect", record.effect_tag_id]
  ] as const) {
    if (!tagId) {
      continue;
    }
    const resolution = resolveTag(
      tagId,
      context.tags,
      context.config.mapping_confidence_threshold
    );
    if (
      resolution.status !== "RESOLVED" &&
      resolution.status !== "INFERRED_HIGH_CONFIDENCE"
    ) {
      quarantined.push(
        quarantine(
          record,
          "UNKNOWN_TAG",
          `${role === "cause" ? "Cause" : "Effect"} tag ${tagId} is not resolved`,
          context
        )
      );
      mappings.push(
        mappingRequest(
          "UNKNOWN_TAG",
          tagId,
          record,
          suggestTagMatches(tagId, context.tags),
          context
        )
      );
    } else if (role === "cause") {
      record.cause_tag_id = resolution.id;
    } else {
      record.effect_tag_id = resolution.id;
    }
  }
  quarantined.push(
    quarantine(
      record,
      "UNAPPROVED_CAUSAL_EDGE",
      "Causal edges remain proposed until human approval",
      context,
      "MEDIUM"
    )
  );
  return { quarantine: quarantined, mapping: mappings };
}

export function gate3IndustrialTruth(
  records: CanonicalRecord[],
  tags: TagRegistry,
  equipment: EquipmentRegistry,
  zones: ZoneRegistry,
  archetypes: ArchetypeLibrary,
  config: CliffordConfig,
  previousRecords: CanonicalRecord[],
  clock: Clock,
  ids: IdProvider
): Gate3Result {
  const result: Gate3Result = {
    status: "PASS",
    clean_records: [],
    quarantined_records: [],
    mapping_requests: [],
    warnings: []
  };
  const context: Gate3Context = {
    tags,
    equipment,
    zones,
    archetypes,
    config,
    previousRecords,
    clock,
    ids
  };

  for (const record of records) {
    if (record.record_type === "causal_edge_candidate") {
      const validated = validateEdge(record, context);
      result.quarantined_records.push(...validated.quarantine);
      result.mapping_requests.push(...validated.mapping);
      continue;
    }
    const validated = validateAlarm(record, result.clean_records, context);
    if (validated.clean) {
      result.clean_records.push(validated.clean);
    }
    result.quarantined_records.push(...validated.quarantine);
    result.mapping_requests.push(...validated.mapping);
    result.warnings.push(...validated.warnings);
  }

  result.status =
    result.clean_records.length === 0 && result.quarantined_records.length > 0
      ? "FAIL"
      : result.quarantined_records.length > 0 ||
          result.mapping_requests.length > 0
        ? "PARTIAL"
        : "PASS";
  return result;
}
