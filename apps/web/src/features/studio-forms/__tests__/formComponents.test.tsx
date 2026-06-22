import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getInitialStudioDraftBundle } from "../demoBundleLoader";
import { AssetForm } from "../AssetForm";
import { TagForm } from "../TagForm";
import { AlarmRuleForm } from "../AlarmRuleForm";
import { CausalEdgeForm } from "../CausalEdgeForm";
import { ActionEnvelopeForm } from "../ActionEnvelopeForm";
import {
  selectActions,
  selectAlarmRules,
  selectAssetOptions,
  selectCausalEdges,
  selectAssets,
  selectTagOptions,
  selectTags,
} from "../studioSelectors";
import type { StudioDraftPatch } from "../studioDraftTypes";

const bundle = getInitialStudioDraftBundle();

describe("studio form components", () => {
  it("AssetForm label/type edit emits patch", () => {
    const onPatch = vi.fn();
    const asset = selectAssets(bundle)[0]!;
    render(<AssetForm asset={asset} issues={[]} onPatch={onPatch} />);
    fireEvent.change(screen.getByDisplayValue(String(asset.display_name)), {
      target: { value: "New Label" },
    });
    expect(onPatch).toHaveBeenCalled();
    const patch = onPatch.mock.calls[0]![0] as StudioDraftPatch;
    expect(patch.family).toBe("plant");
    expect(patch.apply(bundle).plant).toBeTruthy();
  });

  it("TagForm asset select emits patch", () => {
    const onPatch = vi.fn();
    const tag = selectTags(bundle)[0]!;
    render(
      <TagForm tag={tag} assetOptions={selectAssetOptions(bundle)} issues={[]} onPatch={onPatch} />,
    );
    fireEvent.change(screen.getByLabelText(/^Asset$/i), { target: { value: "BAT-101" } });
    expect(onPatch).toHaveBeenCalled();
  });

  it("AlarmRuleForm tag select emits patch", () => {
    const onPatch = vi.fn();
    const rule = selectAlarmRules(bundle)[0]!;
    render(
      <AlarmRuleForm
        rule={rule}
        tagOptions={selectTagOptions(bundle)}
        issues={[]}
        onPatch={onPatch}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Tag$/i), { target: { value: "BAT_101_V" } });
    expect(onPatch).toHaveBeenCalled();
  });

  it("CausalEdgeForm from/to change emits patch", () => {
    const onPatch = vi.fn();
    const edge = selectCausalEdges(bundle)[0]!;
    render(
      <CausalEdgeForm
        edge={edge}
        nodeOptions={[{ id: "PV-101", label: "PV" }, { id: "MPPT-101", label: "MPPT" }]}
        issues={[]}
        onPatch={onPatch}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^From$/i), { target: { value: "MPPT-101" } });
    expect(onPatch).toHaveBeenCalled();
  });

  it("ActionEnvelopeForm label change emits patch", () => {
    const onPatch = vi.fn();
    const action = selectActions(bundle)[0]!;
    render(
      <ActionEnvelopeForm
        action={action}
        assetOptions={selectAssetOptions(bundle)}
        issues={[]}
        onPatch={onPatch}
      />,
    );
    fireEvent.change(screen.getByDisplayValue(String(action.label)), {
      target: { value: "Updated label" },
    });
    expect(onPatch).toHaveBeenCalled();
  });

  it("ID fields are disabled with explanation", () => {
    const asset = selectAssets(bundle)[0]!;
    render(<AssetForm asset={asset} issues={[]} onPatch={vi.fn()} />);
    expect(screen.getByDisplayValue(String(asset.id))).toBeDisabled();
    expect(screen.getByText(/ID rename requires cross-reference migration/i)).toBeInTheDocument();
  });
});