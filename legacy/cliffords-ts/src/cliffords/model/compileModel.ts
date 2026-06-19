import { join } from "node:path";
import type {
  ArchetypeDefinition,
  ArchetypeLibrary,
  CalmCardDefinition,
  EquipmentDefinition,
  EquipmentRegistry,
  GeometryDefinition,
  ModelPort,
  ModelSignal,
  SignalRule,
  TagDefinition,
  TagRegistry,
  ZoneDefinition,
  ZoneRegistry
} from "../contracts/plantModel.js";
import { normalizeTagId } from "../normalizers/normalizeTagId.js";
import { atomicWrite, stableJson } from "../stores/fileUtils.js";

export type ModelSignalOverride = Partial<
  Pick<
    ModelSignal,
    | "engineering_unit"
    | "normal"
    | "alarm_low"
    | "alarm_high"
    | "physical_bounds"
  >
>;

export type TemplateArchetype = {
  archetype_id: string;
  label?: string;
  facets?: string[];
  ports: ModelPort[];
  signals: ModelSignal[];
  geometry?: GeometryDefinition;
  calm_card?: CalmCardDefinition;
  role_visibility?: Record<string, string[]>;
};

export type ModelTemplates = {
  archetypes: TemplateArchetype[];
};

export type PlantZone = {
  zone_id: string;
  label?: string;
  position?: [number, number, number];
  bounds?: [number, number, number];
  aliases?: string[];
};

export type PlantEquipment = {
  equipment_id: string;
  label?: string;
  archetype: string;
  zone_id: string;
  tag_prefix: string;
  position?: [number, number, number];
  aliases?: string[];
  overrides?: Record<string, ModelSignalOverride>;
};

export type PlantConnection = {
  from: string;
  from_port: string;
  to: string;
  to_port: string;
};

export type PlantModel = {
  plant_id: string;
  zones: PlantZone[];
  equipment: PlantEquipment[];
  connections?: PlantConnection[];
};

export type CompiledTagDefinition = TagDefinition & {
  id: string;
  tag_id: string;
  equipment_id: string;
  zone_id: string;
  signal_type: string;
  facet: string;
  archetype_id: string;
  engineering_unit: string;
};

export type RenderSceneNode = {
  equipment_id: string;
  label: string;
  archetype_id: string;
  zone_id: string;
  position: [number, number, number];
  geometry?: GeometryDefinition;
  tag_ids: string[];
  calm_card?: CalmCardDefinition;
  role_visibility?: Record<string, string[]>;
};

export type RenderAlarmBinding = {
  tag_id: string;
  equipment_id: string;
  signal: string;
  facet: string;
  engineering_unit: string;
  normal?: [number, number];
  alarm_low?: number;
  alarm_high?: number;
  physical_bounds?: [number, number];
  alarm_tags: string[];
};

export type RenderConfig = {
  plant_id: string;
  zones: PlantZone[];
  scene_nodes: RenderSceneNode[];
  connections: PlantConnection[];
  alarm_bindings: Record<string, RenderAlarmBinding>;
  role_views: Record<string, string[]>;
};

export type CompiledModel = {
  plant_id: string;
  tag_registry: TagRegistry;
  equipment_registry: EquipmentRegistry;
  zone_registry: ZoneRegistry;
  archetype_library: ArchetypeLibrary;
  signal_rules: Record<string, SignalRule>;
  tag_list: CompiledTagDefinition[];
  render_config: RenderConfig;
};

function requireUnique(id: string, seen: Set<string>, kind: string): void {
  if (seen.has(id)) {
    throw new Error(`Duplicate ${kind} id: ${id}`);
  }
  seen.add(id);
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function compiledTagId(equipment: PlantEquipment, signal: ModelSignal): string {
  const tagId = normalizeTagId(`${equipment.tag_prefix}_${signal.signal}`);
  if (!tagId) {
    throw new Error(
      `Unable to compile tag for ${equipment.equipment_id}.${signal.signal}`
    );
  }
  return tagId;
}

function alarmTags(tagId: string, signal: ModelSignal): string[] {
  return [
    signal.alarm_low === undefined ? undefined : `${tagId}_LOW`,
    signal.alarm_high === undefined ? undefined : `${tagId}_HIGH`
  ].filter((value): value is string => value !== undefined);
}

function mergeSignal(
  signal: ModelSignal,
  override: ModelSignalOverride | undefined
): ModelSignal {
  return override ? { ...signal, ...override } : { ...signal };
}

function signalRule(signal: ModelSignal): SignalRule {
  const rule: SignalRule = {
    allowed_units: [signal.engineering_unit]
  };
  if (signal.physical_bounds) {
    rule.min_value = signal.physical_bounds[0];
    rule.max_value = signal.physical_bounds[1];
  }
  return rule;
}

function mergeSignalRule(
  rules: Record<string, SignalRule>,
  key: string,
  rule: SignalRule
): void {
  const existing = rules[key];
  if (!existing) {
    rules[key] = structuredClone(rule);
    return;
  }
  existing.allowed_units = unique([
    ...(existing.allowed_units ?? []),
    ...(rule.allowed_units ?? [])
  ]);
  if (rule.min_value !== undefined) {
    existing.min_value =
      existing.min_value === undefined
        ? rule.min_value
        : Math.min(existing.min_value, rule.min_value);
  }
  if (rule.max_value !== undefined) {
    existing.max_value =
      existing.max_value === undefined
        ? rule.max_value
        : Math.max(existing.max_value, rule.max_value);
  }
}

function archetypeDefinition(
  archetype: TemplateArchetype
): ArchetypeDefinition {
  const definition: ArchetypeDefinition = {
    id: archetype.archetype_id,
    signal_types: archetype.signals.map((signal) => signal.signal)
  };
  if (archetype.label) definition.label = archetype.label;
  if (archetype.facets) definition.facets = [...archetype.facets];
  if (archetype.ports) definition.ports = structuredClone(archetype.ports);
  if (archetype.signals) {
    definition.signals = structuredClone(archetype.signals);
  }
  if (archetype.geometry) {
    definition.geometry = structuredClone(archetype.geometry);
  }
  if (archetype.calm_card) {
    definition.calm_card = structuredClone(archetype.calm_card);
  }
  if (archetype.role_visibility) {
    definition.role_visibility = structuredClone(archetype.role_visibility);
  }
  return definition;
}

function zoneDefinition(zone: PlantZone): ZoneDefinition {
  const definition: ZoneDefinition = { id: zone.zone_id };
  if (zone.label) definition.label = zone.label;
  if (zone.position) definition.position = [...zone.position];
  if (zone.bounds) definition.bounds = [...zone.bounds];
  if (zone.aliases) definition.aliases = [...zone.aliases];
  return definition;
}

function equipmentDefinition(
  equipment: PlantEquipment
): EquipmentDefinition {
  const definition: EquipmentDefinition = {
    id: equipment.equipment_id,
    zone_id: equipment.zone_id,
    archetype_id: equipment.archetype,
    tag_prefix: equipment.tag_prefix,
    aliases: unique([
      equipment.label,
      equipment.tag_prefix,
      ...(equipment.aliases ?? [])
    ])
  };
  if (equipment.label) definition.label = equipment.label;
  if (equipment.position) definition.position = [...equipment.position];
  return definition;
}

function compiledTagDefinition(
  equipment: PlantEquipment,
  archetype: TemplateArchetype,
  signal: ModelSignal
): CompiledTagDefinition {
  const tagId = compiledTagId(equipment, signal);
  const tags = alarmTags(tagId, signal);
  const definition: CompiledTagDefinition = {
    id: tagId,
    tag_id: tagId,
    label: `${equipment.label ?? equipment.equipment_id} ${signal.signal}`,
    equipment_id: equipment.equipment_id,
    zone_id: equipment.zone_id,
    signal_type: signal.signal,
    facet: signal.facet,
    archetype_id: archetype.archetype_id,
    archetype: archetype.archetype_id,
    engineering_unit: signal.engineering_unit,
    aliases: unique(tags)
  };
  if (signal.normal) definition.normal = [...signal.normal];
  if (signal.alarm_low !== undefined) definition.alarm_low = signal.alarm_low;
  if (signal.alarm_high !== undefined) {
    definition.alarm_high = signal.alarm_high;
  }
  if (tags[0]) definition.alarm_tag = tags[0];
  if (tags.length > 0) definition.alarm_tags = tags;
  if (signal.physical_bounds) {
    definition.physical_bounds = [...signal.physical_bounds];
  }
  return definition;
}

function renderBinding(
  tag: CompiledTagDefinition,
  signal: ModelSignal
): RenderAlarmBinding {
  const binding: RenderAlarmBinding = {
    tag_id: tag.id,
    equipment_id: tag.equipment_id,
    signal: signal.signal,
    facet: signal.facet,
    engineering_unit: signal.engineering_unit,
    alarm_tags: [...(tag.alarm_tags ?? [])]
  };
  if (signal.normal) binding.normal = [...signal.normal];
  if (signal.alarm_low !== undefined) binding.alarm_low = signal.alarm_low;
  if (signal.alarm_high !== undefined) binding.alarm_high = signal.alarm_high;
  if (signal.physical_bounds) {
    binding.physical_bounds = [...signal.physical_bounds];
  }
  return binding;
}

function validateConnections(
  plant: PlantModel,
  archetypesById: Map<string, TemplateArchetype>
): PlantConnection[] {
  const equipmentById = new Map(
    plant.equipment.map((equipment) => [equipment.equipment_id, equipment])
  );
  return (plant.connections ?? []).map((connection) => {
    const from = equipmentById.get(connection.from);
    const to = equipmentById.get(connection.to);
    if (!from) throw new Error(`Connection references unknown equipment ${connection.from}`);
    if (!to) throw new Error(`Connection references unknown equipment ${connection.to}`);
    const fromArchetype = archetypesById.get(from.archetype);
    const toArchetype = archetypesById.get(to.archetype);
    if (!fromArchetype || !toArchetype) {
      throw new Error(`Connection references equipment with unknown archetype`);
    }
    if (!fromArchetype.ports.some((port) => port.port_id === connection.from_port)) {
      throw new Error(`Connection references unknown port ${connection.from}.${connection.from_port}`);
    }
    if (!toArchetype.ports.some((port) => port.port_id === connection.to_port)) {
      throw new Error(`Connection references unknown port ${connection.to}.${connection.to_port}`);
    }
    return structuredClone(connection);
  });
}

export function compileModel(
  plant: PlantModel,
  templates: ModelTemplates
): CompiledModel {
  const archetypeLibrary: ArchetypeLibrary = {};
  const zoneRegistry: ZoneRegistry = {};
  const equipmentRegistry: EquipmentRegistry = {};
  const tagRegistry: TagRegistry = {};
  const signalRules: Record<string, SignalRule> = {};
  const tagList: CompiledTagDefinition[] = [];
  const sceneNodes: RenderSceneNode[] = [];
  const alarmBindings: Record<string, RenderAlarmBinding> = {};
  const roleViews: Record<string, string[]> = {};

  const archetypeIds = new Set<string>();
  const archetypesById = new Map<string, TemplateArchetype>();
  for (const archetype of templates.archetypes) {
    requireUnique(archetype.archetype_id, archetypeIds, "archetype");
    archetypesById.set(archetype.archetype_id, archetype);
    archetypeLibrary[archetype.archetype_id] = archetypeDefinition(archetype);
  }

  const zoneIds = new Set<string>();
  for (const zone of plant.zones) {
    requireUnique(zone.zone_id, zoneIds, "zone");
    zoneRegistry[zone.zone_id] = zoneDefinition(zone);
  }

  const equipmentIds = new Set<string>();
  for (const equipment of plant.equipment) {
    requireUnique(equipment.equipment_id, equipmentIds, "equipment");
    if (!zoneRegistry[equipment.zone_id]) {
      throw new Error(
        `Equipment ${equipment.equipment_id} references unknown zone ${equipment.zone_id}`
      );
    }
    const archetype = archetypesById.get(equipment.archetype);
    if (!archetype) {
      throw new Error(
        `Equipment ${equipment.equipment_id} references unknown archetype ${equipment.archetype}`
      );
    }
    equipmentRegistry[equipment.equipment_id] = equipmentDefinition(equipment);

    const tagIds: string[] = [];
    for (const sourceSignal of archetype.signals) {
      const signal = mergeSignal(
        sourceSignal,
        equipment.overrides?.[sourceSignal.signal]
      );
      const tag = compiledTagDefinition(equipment, archetype, signal);
      requireUnique(tag.id, new Set(Object.keys(tagRegistry)), "tag");
      tagRegistry[tag.id] = tag;
      tagList.push(tag);
      tagIds.push(tag.id);
      const rule = signalRule(signal);
      signalRules[tag.id] = rule;
      mergeSignalRule(signalRules, signal.signal, rule);
      alarmBindings[tag.id] = renderBinding(tag, signal);
    }

    const sceneNode: RenderSceneNode = {
      equipment_id: equipment.equipment_id,
      label: equipment.label ?? equipment.equipment_id,
      archetype_id: archetype.archetype_id,
      zone_id: equipment.zone_id,
      position: equipment.position ?? [0, 0, 0],
      tag_ids: tagIds
    };
    if (archetype.geometry) {
      sceneNode.geometry = structuredClone(archetype.geometry);
    }
    if (archetype.calm_card) {
      sceneNode.calm_card = structuredClone(archetype.calm_card);
    }
    if (archetype.role_visibility) {
      sceneNode.role_visibility = structuredClone(archetype.role_visibility);
      for (const [role, entries] of Object.entries(archetype.role_visibility)) {
        roleViews[role] = unique([...(roleViews[role] ?? []), ...entries]);
      }
    }
    sceneNodes.push(sceneNode);
  }

  const connections = validateConnections(plant, archetypesById);
  tagList.sort((left, right) => left.id.localeCompare(right.id));

  return {
    plant_id: plant.plant_id,
    tag_registry: sortedRecord(tagRegistry),
    equipment_registry: sortedRecord(equipmentRegistry),
    zone_registry: sortedRecord(zoneRegistry),
    archetype_library: sortedRecord(archetypeLibrary),
    signal_rules: sortedRecord(signalRules),
    tag_list: tagList,
    render_config: {
      plant_id: plant.plant_id,
      zones: structuredClone(plant.zones),
      scene_nodes: sceneNodes.sort((left, right) =>
        left.equipment_id.localeCompare(right.equipment_id)
      ),
      connections,
      alarm_bindings: sortedRecord(alarmBindings),
      role_views: sortedRecord(roleViews)
    }
  };
}

export async function writeCompiledModelArtifacts(
  compiled: CompiledModel,
  dataDirectory = ".cliffords-data"
): Promise<void> {
  const root = join(dataDirectory, "model");
  await Promise.all([
    atomicWrite(join(root, "tag_registry.json"), stableJson(compiled.tag_registry)),
    atomicWrite(
      join(root, "equipment_registry.json"),
      stableJson(compiled.equipment_registry)
    ),
    atomicWrite(join(root, "zone_registry.json"), stableJson(compiled.zone_registry)),
    atomicWrite(
      join(root, "archetype_library.json"),
      stableJson(compiled.archetype_library)
    ),
    atomicWrite(join(root, "signal_rules.json"), stableJson(compiled.signal_rules)),
    atomicWrite(join(root, "tag_list.json"), stableJson(compiled.tag_list)),
    atomicWrite(join(root, "render_config.json"), stableJson(compiled.render_config)),
    atomicWrite(join(root, "compiled_model.json"), stableJson(compiled))
  ]);
}
