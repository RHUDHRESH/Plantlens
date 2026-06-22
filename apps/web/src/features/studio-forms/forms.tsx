import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AlarmRule } from "../../app/schemas/alarm";

/** Bridge Zod 4 schemas to @hookform/resolvers until upstream types align. */
function studioFormResolver<T extends z.ZodTypeAny>(schema: T) {
  return zodResolver(schema as never);
}
import type { PlantAsset, TagEntry, CausalEdge, StudioAction } from "../../app/store/studio";

const assetSchema = z.object({
  id: z.string().min(1, "Asset id required"),
  type: z.string().min(1),
  display_name: z.string().min(1, "Display name required"),
  criticality: z.enum(["low", "medium", "high"]).optional(),
  coords_2d_x: z.coerce.number().optional(),
  coords_2d_y: z.coerce.number().optional(),
});

const tagSchema = z.object({
  tag: z.string().min(1),
  asset_id: z.string().min(1),
  source_id: z.string().min(1),
  signal_type: z.string().min(1),
  unit: z.string().min(1),
});

const alarmSchema = z.object({
  id: z.string().min(1),
  tag: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string().min(1),
  op: z.enum(["<", "<=", ">", ">=", "==", "!=", "bool_true", "bool_false"]),
  threshold: z.coerce.number().optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  edge_type: z.string().min(1),
  approved: z.boolean(),
  provenance: z.string().min(1),
});

const roleSchema = z.object({
  roles: z.string().min(1, "Comma-separated roles"),
});

const actionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  action_code: z.coerce.number(),
  risk_level: z.string().min(1),
  allowed_roles: z.string().min(1),
});

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="studio-field">
      <span>{label}</span>
      {children}
      {error ? <em role="alert">{error}</em> : null}
    </label>
  );
}

export function AssetForm({
  asset,
  onSave,
}: {
  asset: PlantAsset;
  onSave: (asset: PlantAsset) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: studioFormResolver(assetSchema),
    defaultValues: {
      id: asset.id,
      type: asset.type,
      display_name: asset.display_name,
      criticality: asset.criticality ?? "medium",
      coords_2d_x: asset.coords_2d?.x ?? 0,
      coords_2d_y: asset.coords_2d?.y ?? 0,
    },
  });

  return (
    <form
      className="studio-form"
      onSubmit={handleSubmit((v) =>
        onSave({
          ...asset,
          id: v.id,
          type: v.type,
          display_name: v.display_name,
          criticality: v.criticality,
          coords_2d: { x: v.coords_2d_x ?? 0, y: v.coords_2d_y ?? 0 },
        }),
      )}
    >
      <Field label="ID" error={errors.id?.message}>
        <input {...register("id")} />
      </Field>
      <Field label="Type" error={errors.type?.message}>
        <input {...register("type")} />
      </Field>
      <Field label="Display name" error={errors.display_name?.message}>
        <input {...register("display_name")} />
      </Field>
      <Field label="Criticality" error={undefined}>
        <select {...register("criticality")}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </Field>
      <Field label="2D X" error={undefined}>
        <input type="number" {...register("coords_2d_x")} />
      </Field>
      <Field label="2D Y" error={undefined}>
        <input type="number" {...register("coords_2d_y")} />
      </Field>
      <button type="submit">Save asset</button>
    </form>
  );
}

export function TagForm({ tag, onSave }: { tag: TagEntry; onSave: (tag: TagEntry) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: studioFormResolver(tagSchema), defaultValues: tag });

  return (
    <form className="studio-form" onSubmit={handleSubmit((v) => onSave(v))}>
      <Field label="Tag" error={errors.tag?.message}>
        <input {...register("tag")} />
      </Field>
      <Field label="Asset ID" error={errors.asset_id?.message}>
        <input {...register("asset_id")} />
      </Field>
      <Field label="Source ID" error={undefined}>
        <input {...register("source_id")} />
      </Field>
      <Field label="Signal type" error={undefined}>
        <input {...register("signal_type")} />
      </Field>
      <Field label="Unit" error={undefined}>
        <input {...register("unit")} />
      </Field>
      <button type="submit">Save tag</button>
    </form>
  );
}

export function AlarmForm({
  rule,
  onSave,
}: {
  rule: AlarmRule;
  onSave: (rule: AlarmRule) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: studioFormResolver(alarmSchema),
    defaultValues: {
      id: rule.id,
      tag: rule.tag,
      severity: rule.severity,
      message: rule.message,
      op: rule.condition.op,
      threshold: rule.condition.threshold ?? undefined,
    },
  });

  return (
    <form
      className="studio-form"
      onSubmit={handleSubmit((v) =>
        onSave({
          ...rule,
          id: v.id,
          tag: v.tag,
          severity: v.severity,
          message: v.message,
          condition: {
            op: v.op,
            ...(v.threshold !== undefined ? { threshold: v.threshold } : {}),
          },
        }),
      )}
    >
      <Field label="Alarm ID" error={errors.id?.message}>
        <input {...register("id")} />
      </Field>
      <Field label="Tag" error={errors.tag?.message}>
        <input {...register("tag")} />
      </Field>
      <Field label="Severity" error={undefined}>
        <select {...register("severity")}>
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
      </Field>
      <Field label="Message" error={undefined}>
        <input {...register("message")} />
      </Field>
      <Field label="Condition op" error={undefined}>
        <select {...register("op")}>
          <option value=">">{">"}</option>
          <option value="<">{"<"}</option>
          <option value="bool_true">bool_true</option>
        </select>
      </Field>
      <Field label="Threshold" error={undefined}>
        <input type="number" step="any" {...register("threshold")} />
      </Field>
      <button type="submit">Save alarm</button>
    </form>
  );
}

export function EdgeForm({
  edge,
  onSave,
}: {
  edge: CausalEdge;
  onSave: (edge: CausalEdge) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: studioFormResolver(edgeSchema),
    defaultValues: {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      edge_type: edge.edge_type,
      approved: edge.approved,
      provenance: edge.provenance,
    },
  });

  return (
    <form
      className="studio-form"
      onSubmit={handleSubmit((v) =>
        onSave({
          ...edge,
          ...v,
          lag_ms: edge.lag_ms ?? [0, 2000],
        }),
      )}
    >
      <Field label="Edge ID" error={errors.id?.message}>
        <input {...register("id")} />
      </Field>
      <Field label="From" error={errors.from?.message}>
        <input {...register("from")} />
      </Field>
      <Field label="To" error={errors.to?.message}>
        <input {...register("to")} />
      </Field>
      <Field label="Type" error={undefined}>
        <input {...register("edge_type")} />
      </Field>
      <Field label="Approved" error={undefined}>
        <input type="checkbox" {...register("approved")} />
      </Field>
      <Field label="Provenance" error={undefined}>
        <input {...register("provenance")} />
      </Field>
      <button type="submit">Save edge</button>
    </form>
  );
}

export function RoleForm({
  roles,
  onSave,
}: {
  roles: string[];
  onSave: (roles: string[]) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: studioFormResolver(roleSchema),
    defaultValues: { roles: roles.join(", ") },
  });

  return (
    <form
      className="studio-form"
      onSubmit={handleSubmit((v) =>
        onSave(
          v.roles
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean),
        ),
      )}
    >
      <Field label="Roles (comma-separated)" error={errors.roles?.message}>
        <input {...register("roles")} />
      </Field>
      <button type="submit">Save roles</button>
    </form>
  );
}

export function ActionForm({
  action,
  onSave,
}: {
  action: StudioAction;
  onSave: (action: StudioAction) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: studioFormResolver(actionSchema),
    defaultValues: {
      id: action.id,
      label: action.label,
      action_code: action.action_code,
      risk_level: action.risk_level,
      allowed_roles: action.allowed_roles.join(", "),
    },
  });

  return (
    <form
      className="studio-form"
      onSubmit={handleSubmit((v) =>
        onSave({
          ...action,
          id: v.id,
          label: v.label,
          action_code: v.action_code,
          risk_level: v.risk_level,
          allowed_roles: v.allowed_roles.split(",").map((r) => r.trim()),
        }),
      )}
    >
      <Field label="Action ID" error={errors.id?.message}>
        <input {...register("id")} />
      </Field>
      <Field label="Label" error={undefined}>
        <input {...register("label")} />
      </Field>
      <Field label="Action code" error={undefined}>
        <input type="number" {...register("action_code")} />
      </Field>
      <Field label="Risk level" error={undefined}>
        <input {...register("risk_level")} />
      </Field>
      <Field label="Allowed roles" error={undefined}>
        <input {...register("allowed_roles")} />
      </Field>
      <button type="submit">Save action</button>
    </form>
  );
}