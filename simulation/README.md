# SWaT simulation

Use Node.js 20.10 or later.

```sh
cd simulation
npm ci
npm run build
npm start
```

Open http://localhost:3000.

- Drag to rotate. Shift-drag or right-drag to pan. Scroll to zoom.
- On touch screens, drag with one finger to rotate. Use two fingers to pan and zoom.
- Click a component to start its attack. Click it again to stop. Several components and stages can remain under attack at once.
- With the canvas focused, use left and right arrow keys to select equipment. Enter or Space toggles its attack.

The initial view is orthographic and isometric. The camera reserves space for eight desktop log rows. The canvas still covers the full page, so zoomed equipment does not stop at an artificial scene boundary. An 18-pixel gradient joins the scene to the log. The history fades remain separate and follow the scroll position.

The plant uses neutral off-white materials. Added parts include motor cooling fins, flange bolts, valve handles, pressure dials, lifting eyes, cabinet hinges and vents, membrane saddles, and mounted lamps. The lamp bases have a ray-tested contact with the actual equipment meshes. Tank lifting eyes sit on the lids, including on the shorter dosing tanks.

Water remains blue (#0070f3). Soft light-blue bands move through each pipe. Clear inline sight chambers also contain rotors that show local flow. The rotors slow for intermittent trips, stop for stalls, and recover gradually. The water and fittings share the scene camera and depth buffer. This is an illustrative flow display, not a hydraulic model. Small rotors require zoom on a phone.

Monitoring starts at page load, including when no attacks are selected. Each check takes 2–3 seconds; the next check starts three seconds after the result. Each injection starts a separate request for its new attack. Earlier batches continue with their original targets. Whole-plant checks and each missed attack have independent timers. Results apply only to the attack IDs captured by their batch. The startup log identifies the dummy detector and simulated attacks and repairs. Later rows use short component IDs and results.

The dummy has a 0.001 probability of a false alarm per whole-plant check, independent of its 0.8 detection probability for each attack. At most one healthy stage receives such an alarm in a check. This is a demo setting, not a measured model rate. The project evaluates precision/recall and uses normal-validation thresholds with 3-of-5 persistence; its 0.999 threshold quantile does not establish a false-positive rate. `createDetection` accepts a separate `falseAlarmRandom` function for deterministic tests. No training artifacts or readings are generated.

A healthy-stage alarm produces an orange controller indication and a VERIFY row. Verification compares the prediction with demo ground truth. After 1.4 seconds, DISMISSED identifies the confirmed false positive. This path never creates an attack or repairs a component. New attacks cancel obsolete verification for their stage.

MONITORING is muted grey. NORMAL uses dark neutral text only after a completed check with no alarm and no unresolved attack. Idle lamps are neutral. Repeated clean checks and repeated misses add no log rows. Red means active/missed attack; orange means detection/verification; green means completed repair. Logs use neutral surfaces and colored state labels. The palette comes from the official [Geist colors](https://vercel.com/geist/colors). Shared semantic tokens also supply the model colors.

Each detected attack instance enters simulated repair for 1.4 seconds, then flashes green and returns to normal. Missed instances remain active and are checked again after three seconds. Only a positive result for the same attack ID starts its repair. Cached misses, stale-response guards, and independent repair timers remain in place. Stage-level predictions cannot authorize component repairs.

The log keeps the full session history, newest first. It spans the page width with text padding and no bottom gap. The desktop viewport holds eight 36-pixel rows. Phone rows can wrap. The upper history fade appears only when newer rows are above the viewport; the lower fade appears only when older rows remain below it. Neither appears when all rows fit.

Reduced motion stops flow bands, flow rotors, pump rotors, gauge motion, valve motion, and steam. State indications remain readable. Animation pauses offscreen and when the page is hidden.

## Data boundary

The format was checked against `src/swatad/convert.py`, `data.py`, `models/base.py`, `models/baselines.py`, `models/gdn.py`, `alarms.py`, and `run.py` in this checkout. Local raw data, processed Parquet, and trained model artifacts are absent.

The converter strips signal-column names and removes Timestamp. It stores attack truth in a separate integer `label` column. The loader removes `label`, preserves signal-column order, median-downsamples by ten, removes the train startup transient, and scales with training min/max. Detector input has shape `(T,N)`: rows are time steps; columns are signals. Tests expect 51 SWaT signals. The complete feature order must come from the actual training artifact or processed dataset, not the 3D component order.

PCA currently returns one plant-wide score per time step. GDN also returns `(T,N)` signal scores. `stage_alarms` groups signals by the first digit in each tag and returns `(T,n_stages)` alarms plus the stage IDs. It supports several simultaneous stage alarms. A physical unit such as a tank or UF rack is not itself a dataset feature. The current code does not prove component-level attribution.

`POST /api/attacks` accepts:

```json
{
  "targets": [
    {"componentId": "T101", "attackId": "unique-attack-1"},
    {"componentId": "P101", "attackId": "unique-attack-2"}
  ],
  "modelInput": null,
  "recheck": false
}
```

`targets` contains only the attack instances checked by this batch. Optional `plantTargets` supplies the full active-attack snapshot, including attacks in other batches. It is ground truth context, not model input. Context-only attacks reuse cached outcomes and cannot be rerolled or repaired by this batch. Healthy-stage false alarms exclude all attacks in that snapshot.

The server validates component IDs, derives stages from its catalog, and requires a unique `attackId` for each attack instance. The dummy detector independently detects each instance with probability 0.8 and returns after 2000–2999 ms. It caches the result by attack ID for the server session. Ordinary target-list changes reuse those results. Only an explicit `recheck: true` may reroll a previously missed instance. A positive detection stays positive. Stopping and restarting a component creates a new attack ID.

`targetResults` contains `{attackId, componentId, stage, detected}` for each requested instance. The UI validates all identities and repairs only the instance whose own result is positive. Missing, mismatched, duplicate, or stage-only results cannot trigger component repairs. Each repair has its own timer, guarded by the attack identity. A replacement attack cannot be cleared by an old timer.

The result also contains `targets`, `attackedStages`, `predictedStages`, `stageIds`, `stageAlarms`, `correct`, `stageCorrect`, `simulated`, `detector`, `delayMs`, and `scores: null`. Stage alarms are the OR of the simulated positive component results. They align with `stageIds: [1,2,3,4,5,6]`. `correct` means all attacked instances were detected; `stageCorrect` compares the stage sets. A correct stage alarm does not imply that all components in that stage were detected.

Per-component results are a dummy-adapter feature. The checked-in real model currently provides stage alarms, not verified physical-component attribution. Its adapter must supply an attribution policy before stage-only output can authorize component repairs. The UI deliberately rejects stage-only responses for automatic repair.

An optional `modelInput` object can carry `columns` and `values`, where `values` is finite numeric `(T,N)` data. The API validates shape and signal-name syntax. This is an integration boundary, not live inference: the dummy ignores these values. The caller must preserve the fitted feature order and preprocessing. No sensor readings or model scores are fabricated. Ground truth remains in `targets`, outside `modelInput`. The UI matches per-attack results to its own snapshot and does not use the aggregate `correct` field to authorize repairs.

## Geometry

Equipment groups follow the [official SWaT process image](https://www.sutd.edu.sg/itrust/wp-content/uploads/sites/15/2025/10/Block-Diagram-of-SWaT-Physical-Process.png). The [layout and plant photo](https://www.sutd.edu.sg/itrust/swat/) inform the tanks, skids, cabinets, and membrane racks.

P1 has raw water storage and pumping. P2 has three chemical dosing systems and a static mixer. P3 has UF feed, pumping, and membranes. P4 has RO feed, pumping, UV treatment, and NaHSO3 dosing. P5 has a cartridge filter, pump, and horizontal RO membrane housings. P6 has permeate, backwash, and CIP tanks with pumps.

Twenty-four connections run between explicit equipment ports. The router avoids equipment bounds and previously used pipe lattice points. Straight-run collars, rounded elbows, terminal flanges, and pipe supports connect the geometry. The route audit checks endpoints and equipment clearance. A separate Three.js ray check checks all 28 lamp mounts. It is not the anatomy SVG audit and does not prove all internal fittings or support clearances. The model remains an illustration: dimensions, housing counts, and pipe routes are not surveyed plant geometry. It does not simulate fluid physics.

Run `npm test` for 30 checks of monitoring, false alarms, repair isolation, cached misses, stale results, replacement attacks, input validation, API timing, routing, and local flow response. Browser checks covered desktop and phone layouts, close views, motion samples, reduced-motion state, camera input, log masks, controlled false alarms, and later repair. These checks are not the anatomy SVG audit. Full CAD fidelity, all solid-to-solid clearances, and a physical-device frame rate are not verified.
