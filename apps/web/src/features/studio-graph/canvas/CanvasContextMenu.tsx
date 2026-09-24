import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Focus,
  Keyboard,
  Maximize,
  Pencil,
  Repeat,
  Scissors,
  SquareDashedMousePointer,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Kbd } from "../../../components/ui/primitives";
import { LOOP_OK_METADATA_KEY } from "../../connection-rules/engine";
import type { XY } from "../model/assemblyOps";
import { useStudioStore } from "../studioStore";
import type { StudioActions } from "./useStudioActions";

export type MenuTarget =
  | { kind: "pane"; at?: XY }
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "selection" };

function Item({ icon, label, kbd, onSelect, disabled, danger }: { icon: ReactNode; label: string; kbd?: string; onSelect: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <ContextMenu.Item className="pl-menu__item" onSelect={onSelect} disabled={disabled ?? false} data-danger={danger || undefined}>
      {icon}
      {label}
      {kbd ? <Kbd>{kbd}</Kbd> : null}
    </ContextMenu.Item>
  );
}

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

export function CanvasContextMenu({
  target,
  readOnly,
  actions,
  onOpenHelp,
  children,
}: {
  target: MenuTarget;
  readOnly: boolean;
  actions: StudioActions;
  onOpenHelp: () => void;
  children: ReactNode;
}) {
  const selection = useStudioStore((s) => s.selection);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);
  const showLagLabels = useStudioStore((s) => s.showLagLabels);
  const loopOk = useStudioStore((s) => {
    const v = s.history.present.metadata?.[LOOP_OK_METADATA_KEY];
    return Array.isArray(v) && target.kind === "edge" ? v.includes(target.id) : false;
  });
  const store = useStudioStore.getState;
  const multi = selection.nodes.length > 1;

  let body: ReactNode;
  if (target.kind === "edge") {
    body = (
      <>
        <ContextMenu.Label className="pl-menu__label">Connection {target.id}</ContextMenu.Label>
        <Item icon={<Focus />} label="Zoom to connection" onSelect={() => actions.focusElement({ kind: "edge", id: target.id })} />
        <ContextMenu.CheckboxItem
          className="pl-menu__item"
          checked={loopOk}
          disabled={readOnly}
          onCheckedChange={(v) => store().setConnectionLoopOk(target.id, v === true)}
        >
          <Repeat />
          Intentional feedback loop
        </ContextMenu.CheckboxItem>
        <ContextMenu.Separator className="pl-menu__sep" />
        <Item icon={<Trash2 />} label="Delete connection" kbd="Del" danger disabled={readOnly} onSelect={() => store().deleteElements([], [target.id])} />
      </>
    );
  } else if (target.kind === "node" || target.kind === "selection") {
    body = (
      <>
        <ContextMenu.Label className="pl-menu__label">
          {multi ? `${selection.nodes.length} components` : target.kind === "node" ? target.id : "Selection"}
        </ContextMenu.Label>
        {!multi && target.kind === "node" ? (
          <Item icon={<Pencil />} label="Rename" kbd="F2" disabled={readOnly} onSelect={() => store().startRename(target.id)} />
        ) : null}
        <Item icon={<CopyPlus />} label="Duplicate" kbd={`${MOD} D`} disabled={readOnly} onSelect={() => store().duplicate()} />
        <Item icon={<Copy />} label="Copy" kbd={`${MOD} C`} onSelect={() => store().copy()} />
        <Item icon={<Scissors />} label="Cut" kbd={`${MOD} X`} disabled={readOnly} onSelect={() => store().cut()} />
        <Item icon={<Focus />} label="Zoom to selection" kbd="⇧ 2" onSelect={() => actions.zoomToSelection()} />
        {multi ? (
          <>
            <ContextMenu.Separator className="pl-menu__sep" />
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="pl-menu__item" disabled={readOnly}>
                <AlignStartVertical />
                Align & distribute
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="pl-menu" sideOffset={4}>
                  <Item icon={<AlignStartVertical />} label="Align left" onSelect={() => actions.align("left")} />
                  <Item icon={<AlignCenterVertical />} label="Align centres (vertical axis)" onSelect={() => actions.align("hcenter")} />
                  <Item icon={<AlignEndVertical />} label="Align right" onSelect={() => actions.align("right")} />
                  <Item icon={<AlignStartHorizontal />} label="Align top" onSelect={() => actions.align("top")} />
                  <Item icon={<AlignCenterHorizontal />} label="Align middles" onSelect={() => actions.align("vcenter")} />
                  <Item icon={<AlignEndHorizontal />} label="Align bottom" onSelect={() => actions.align("bottom")} />
                  <ContextMenu.Separator className="pl-menu__sep" />
                  <Item icon={<AlignCenterVertical />} label="Distribute horizontally" disabled={selection.nodes.length < 3} onSelect={() => actions.distribute("horizontal")} />
                  <Item icon={<AlignCenterHorizontal />} label="Distribute vertically" disabled={selection.nodes.length < 3} onSelect={() => actions.distribute("vertical")} />
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          </>
        ) : null}
        <ContextMenu.Separator className="pl-menu__sep" />
        <Item icon={<Trash2 />} label="Delete" kbd="Del" danger disabled={readOnly} onSelect={() => store().deleteSelection()} />
      </>
    );
  } else {
    const at = target.at;
    body = (
      <>
        <ContextMenu.Label className="pl-menu__label">Canvas</ContextMenu.Label>
        <Item icon={<ClipboardPaste />} label="Paste here" kbd={`${MOD} V`} disabled={readOnly} onSelect={() => store().paste(at)} />
        <Item icon={<SquareDashedMousePointer />} label="Select all" kbd={`${MOD} A`} onSelect={() => store().selectAll()} />
        <Item icon={<Maximize />} label="Fit view" kbd="⇧ 1" onSelect={() => actions.fitView()} />
        <ContextMenu.Separator className="pl-menu__sep" />
        <ContextMenu.CheckboxItem className="pl-menu__item" checked={snapEnabled} onCheckedChange={(v) => store().setSnapEnabled(v === true)}>
          <span className="st-menu-check" aria-hidden>{snapEnabled ? "✓" : ""}</span>
          Snap to grid
          <Kbd>G</Kbd>
        </ContextMenu.CheckboxItem>
        <ContextMenu.CheckboxItem className="pl-menu__item" checked={showLagLabels} onCheckedChange={(v) => store().setShowLagLabels(v === true)}>
          <span className="st-menu-check" aria-hidden>{showLagLabels ? "✓" : ""}</span>
          Show lag windows on connections
        </ContextMenu.CheckboxItem>
        <ContextMenu.Separator className="pl-menu__sep" />
        <Item icon={<Keyboard />} label="Keyboard shortcuts" kbd="?" onSelect={onOpenHelp} />
      </>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="pl-menu st-context-menu" collisionPadding={8}>
          {body}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
