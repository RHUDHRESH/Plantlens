# Real equipment models (GLB drop-in)

The 3D plant view (`/ops/3d`) draws every asset with a **parametric model** built in code
(`src/features/plant3d/models/`). Nothing is downloaded, so it works in an offline control room.

If you have the manufacturer's CAD for a piece of equipment, you can use it instead. Put a
`.glb` file in this folder and list it in `manifest.json`. The app reads the manifest once when the
3D view opens. It only requests the GLB files listed there, so it never probes for missing files.
If a GLB fails to load, the view logs a warning and falls back to the parametric model.

## 1. Get a model you are allowed to use

- Download CAD from the manufacturer's product page. Many motor, pump, drive and enclosure
  vendors publish STEP files for free. Other sources are PARTcommunity/TraceParts, or your own
  plant's as-built CAD.
- **Licensing:** only use models you have the rights to redistribute inside your deployment.
  Most vendor CAD is licensed for design use. Check the EULA before shipping it in a build, and
  record the source and licence in the manifest entry (`source`, `license`).

## 2. Convert STEP → glTF binary (.glb)

Pick one of these routes:

**FreeCAD (free, handles STEP well)**
1. `File → Import` the `.step`/`.stp` file.
2. Select the bodies. Use `Part → Convert to mesh` or `Mesh Design → Meshes → Create mesh from shape`,
   with a surface deviation of about 0.5 mm for a motor-sized part.
3. `File → Export → glTF 2.0 (*.glb)`.

**Blender (best for clean-up and materials)**
1. Import STEP with an add-on such as *STEPper* or *CAD Sketcher import*, or bring in an
   OBJ/STL exported from FreeCAD.
2. Decimate (`Modifiers → Decimate`) until you are within budget. Merge small fasteners,
   and delete hidden internals (rotors, windings, PCB detail).
3. Give the model simple PBR materials, for example painted steel (roughness 0.5), cast iron and
   copper. Don't use emissive colours. Status colour is drawn by PlantLens, not the model.
4. `File → Export → glTF 2.0`. Choose format *glTF Binary (.glb)*, **+Y Up**, apply modifiers.

**Compress (recommended)**, using [gltf-transform](https://gltf-transform.dev) on your workstation:

```bash
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp
```

- **Meshopt** works with nothing extra, because the decoder is bundled with the app.
- **Draco** also works, but the decoder must be self-hosted. Copy `draco_decoder.js`/`.wasm`
  (from `three/examples/jsm/libs/draco/`) into `public/models/draco/` and set `"draco": true` on
  the entry. The app never fetches the decoder from a CDN.

## 3. Conventions

| Rule | Value |
|------|-------|
| Units | metres (the app rescales anyway, but correct units keep proportions honest) |
| Up axis | +Y |
| Front | +Z. For a motor, the shaft (drive end) points to +X |
| Origin | anywhere, because the app re-centres on X/Z and puts the lowest point on the floor |
| Budget | ≤ 50k triangles and ≤ 2 MB per asset type (≤ 150k triangles for the whole plant view) |
| Textures | ≤ 1024², webp or jpeg, and none at all where plain colours suffice |
| File name | lowercase, `[a-z0-9_-]`, e.g. `abb_m3bp_160.glb` |

Each imported model is normalised to the footprint of its kind (see `lib/registry.ts`). It is
uniformly scaled to fit the kind's width × depth × height box, centred, and placed on the floor.
You can override the box per entry with `footprint`.

## 4. Register it in `manifest.json`

```json
{
  "version": 1,
  "models": {
    "MTR-301": { "file": "abb_m3bp_160.glb", "source": "ABB product page", "license": "ABB CAD EULA" },
    "motor_simple": { "file": "generic_tefc_motor.glb" },
    "vfd_cabinet": { "file": "rittal_ts8_600.glb", "footprint": [0.6, 0.5, 2.1], "yaw": 180 }
  }
}
```

Keys are matched in this order:

1. **Asset id** (`MTR-301`): this one asset only.
2. **`coords_3d.model` name** from `plant.json` (`motor_simple`, `inverter_box`, `solar_panel`, …).
3. **Model kind** (`induction_motor`, `pump_set`, `fan_blower`, `vfd_cabinet`, `battery_rack`,
   `pv_array`, `dc_distribution`, `charge_controller`, `transformer_dry`, `transformer_oil`,
   `control_valve`, `tank`, `heat_exchanger`, `screw_compressor`, `conveyor`, `luminaire`,
   `plc_cabinet`, `enclosure`, `instrument`): every asset of that kind.

Optional fields:

- `footprint`: `[w, d, h]` in metres.
- `yaw`: degrees about Y, applied before normalising, for exports that face the wrong way.
- `draco`: set to `true` for Draco-compressed files.
- `source`, `license`: provenance notes.

To preview a single model, open `/ops/3d?model=<kind>`. Add `&angle=front|side|rear|top`,
`&zoom=1.5` or `&status=critical` to change the view.
