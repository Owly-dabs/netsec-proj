const pptxgen = require("pptxgenjs");
const { applyTheme } = require("/home/owly/.claude/skills/synced/d641d1a7-d030-4ea7-823f-a89302a9b4ac_c1d8b5c4-99df-4ec1-ac6b-3881f1098b24/pptx/scripts/apply_theme.js");

const OUT = process.argv[2] || "interim.pptx";

const THEME = {
  name: "SWaT Water",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "142228",   // ink
    lt1: "FFFFFF",
    dk2: "0B3C47",   // deep water
    lt2: "EAF2F4",   // pale water
    accent1: "0B6E83", // teal
    accent2: "C2410C", // alarm
    accent3: "9A7400", // planned / amber
    accent4: "2F7D4F", // ok
    accent5: "56676E", // slate muted
    accent6: "9CC7D1", // light teal
    hlink: "0B6E83",
    folHlink: "56676E",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "SWaT Attack Detection: Interim Presentation";
pres.subject = "50.020 Network Security project";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const W = 13.333, H = 7.5, MX = 0.6;

// ---------- Layouts ----------
pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 1.45, w: 12.1, h: 1.8, fontSize: 40, bold: true, color: C.background1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MX, y: 3.6, w: 10, h: 1.2, fontSize: 18, color: C.accent6, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.45, w: W - 2 * MX, h: 0.75, fontSize: 32, bold: true, color: C.text1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { text: { text: "SWaT attack detection · interim", options: { x: MX, y: H - 0.45, w: 6, h: 0.3, fontSize: 10, color: C.accent5, margin: 0 } } },
  ],
  slideNumber: { x: W - MX - 0.6, y: H - 0.45, w: 0.6, h: 0.3, fontSize: 10, color: C.accent5, align: "right" },
});

let objN = 0;
const nm = (s) => `${s}-${++objN}`;

function eyebrow(slide, text) {
  slide.addText(text.toUpperCase(), { x: MX, y: 0.18, w: 8, h: 0.27, fontSize: 11, bold: true, color: C.accent1, charSpacing: 2, margin: 0, isTextBox: true, objectName: nm("eyebrow") });
}
let lastSection = null;
function ensureSection(t) { if (t !== lastSection) { pres.addSection({ title: t }); lastSection = t; } }
function contentSlide(section, eyebrowText, title) {
  ensureSection(section);
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  eyebrow(s, eyebrowText);
  s.addText(title, { placeholder: "title" });
  return s;
}
function pill(slide, x, y, text, kind) {
  const fill = { done: C.accent1, rejected: C.accent2, planned: C.accent3 }[kind];
  slide.addText(text, { shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.08, x, y, w: 1.3, h: 0.32, fontSize: 11, bold: true, color: C.background1, fill: { color: fill }, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm("pill") });
}
// Motif: stage chip "P1".."P6" tiles, a teal rounded square with the stage number.
function stageStrip(slide, x, y, w, onDark) {
  const stages = [["P1", "Raw water"], ["P2", "Chemical dosing"], ["P3", "Ultrafiltration"], ["P4", "Dechlorination"], ["P5", "Reverse osmosis"], ["P6", "Permeate / backwash"]];
  const gap = 0.15, cw = (w - gap * 5) / 6;
  stages.forEach(([p, label], i) => {
    const cx = x + i * (cw + gap);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y, w: cw, h: 0.95, rectRadius: 0.06, fill: { color: onDark ? C.accent1 : C.background2 }, line: { color: onDark ? C.accent6 : C.accent6, width: 1 }, objectName: nm("stage") });
    slide.addText(p, { x: cx + 0.15, y: y + 0.08, w: cw - 0.3, h: 0.45, fontSize: 22, bold: true, fontFace: THEME.headFontFace, color: onDark ? C.background1 : C.accent1, margin: 0, isTextBox: true, objectName: nm("stage-n") });
    slide.addText(label, { x: cx + 0.15, y: y + 0.52, w: cw - 0.3, h: 0.35, fontSize: 12, color: onDark ? C.background1 : C.text1, margin: 0, isTextBox: true, objectName: nm("stage-l") });
  });
}
function bullets(items, opts = {}) {
  return items.map((t, i) => {
    const runs = Array.isArray(t) ? t : [{ text: t }];
    return runs.map((r, j) => ({
      text: r.text,
      options: { bold: r.bold, color: r.color, bullet: j === 0 ? { indent: 15 } : undefined, breakLine: j === runs.length - 1 && i < items.length - 1, paraSpaceAfter: opts.space ?? 8 },
    }));
  }).flat();
}
const TBL_HEAD = (t) => ({ text: t, options: { bold: true, fontSize: 12, color: C.background1, fill: { color: C.text2 } } });
const TBL_BORDER = { type: "solid", pt: 0.75, color: HEX.accent6 };

// ---------- 1. Title ----------
{
  ensureSection("Introduction");
  const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addText("50.020 NETWORK SECURITY · INTERIM PRESENTATION", { x: MX, y: 0.9, w: 10, h: 0.35, fontSize: 13, bold: true, color: C.accent6, charSpacing: 2, margin: 0, isTextBox: true, objectName: nm("kicker") });
  s.addText("Detecting attacks on a water treatment plant from its sensor data", { placeholder: "title" });
  s.addText("Reproducing USAD and GDN on SWaT 2015, evaluating them more strictly, and testing transfer to WADI", { placeholder: "body" });
  stageStrip(s, MX, 5.6, W - 2 * MX, true);
  s.addNotes("Project: ML-based attack detection on the iTrust SWaT testbed. This interim covers design, implementation plan and demo plan. No results yet; anything numeric is a dataset fact or a published value.");
}

// ---------- 2. Problem ----------
{
  const s = contentSlide("Introduction", "Problem", "Spoofed sensors and forced actuators");
  s.addText(bullets([
    [{ text: "Brief: ", bold: true }, { text: "design and evaluate an ML attack/anomaly detector; reproduce published mechanisms; stretch with original modifications" }],
    [{ text: "Threat model: ", bold: true }, { text: "an attacker on the control network spoofs sensor readings or forces actuators, for example opening MV101 to overflow a tank while the HMI shows a normal level" }],
    [{ text: "Paradigm: ", bold: true }, { text: "semi-supervised. Train on normal operation only; labels are used only to evaluate" }],
  ], { space: 14 }), { x: MX, y: 1.6, w: 6.4, h: 4.6, fontSize: 16, color: C.text1, valign: "top", isTextBox: true, objectName: nm("body") });

  // Right: attack categories (SWaT 2015 taxonomy) as a 2x2 grid
  const gx = 7.5, gy = 1.75, cw = 2.55, ch = 1.85, g = 0.25;
  const cats = [["SSSP", "Single stage, single point"], ["SSMP", "Single stage, multi point"], ["MSSP", "Multi stage, single point"], ["MSMP", "Multi stage, multi point"]];
  cats.forEach(([k, d], i) => {
    const x = gx + (i % 2) * (cw + g), y = gy + Math.floor(i / 2) * (ch + g);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.accent6, width: 1 }, objectName: nm("cat") });
    s.addText(k, { x: x + 0.2, y: y + 0.25, w: cw - 0.4, h: 0.6, fontSize: 28, bold: true, fontFace: THEME.headFontFace, color: C.accent2, margin: 0, isTextBox: true, objectName: nm("cat-k") });
    s.addText(d, { x: x + 0.2, y: y + 0.95, w: cw - 0.4, h: 0.7, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: nm("cat-d") });
  });
  s.addText("SWaT 2015 attack categories", { x: gx, y: gy + 2 * ch + g + 0.1, w: 2 * cw + g, h: 0.3, fontSize: 11, color: C.accent5, italic: true, margin: 0, isTextBox: true, objectName: nm("caption") });
  s.addNotes("The SWaT attacks are process-level: they change values, not traffic volume. That shapes the choice to detect from process data.");
}

// ---------- 3. Dataset choice ----------
{
  const s = contentSlide("Data", "Dataset choice", "Why SWaT, with WADI as the transfer target");
  const cards = [
    ["EPIC", "rejected", "All 8 released scenarios are normal operating configurations. The dataset paper has a section titled \"Lack of Attack Scenarios on the Process\"."],
    ["IoT honeypot", "rejected", "81.5M Zeek logs, nearly all hostile, no benign class. Ground truth is Suricata alerts only. 91% of sessions are SSH brute force on the forwarding VMs."],
    ["SWaT + WADI", "done", "Real testbeds with labelled attack periods, reported in nearly every major time-series anomaly detection paper. Published numbers exist to reproduce."],
  ];
  const cw = (W - 2 * MX - 2 * 0.35) / 3;
  cards.forEach(([t, kind, body], i) => {
    const x = MX + i * (cw + 0.35), y = 1.65;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: 3.9, rectRadius: 0.06, fill: { color: kind === "done" ? C.background2 : C.background1 }, line: { color: C.accent6, width: 1 }, objectName: nm("card") });
    s.addText(t, { x: x + 0.3, y: y + 0.3, w: cw - 0.6, h: 0.55, fontSize: 24, bold: true, fontFace: THEME.headFontFace, color: C.text1, margin: 0, isTextBox: true, objectName: nm("card-t") });
    pill(s, x + 0.3, y + 0.95, kind === "done" ? "chosen" : "rejected", kind);
    s.addText(body, { x: x + 0.3, y: y + 1.5, w: cw - 0.6, h: 2.9, fontSize: 15, color: C.text1, valign: "top", margin: 0, isTextBox: true, objectName: nm("card-b") });
  });
  s.addNotes("EPIC: Ahmed & Kandasamy 2021. IoT: Aung et al., ICSS 2020. Both rejected for the same reason: no clean normal-vs-attack ground truth.");
}

// ---------- 4. Data facts ----------
{
  const s = contentSlide("Data", "The data", "The data at a glance");
  const stats = [["495,000", "SWaT train rows, 7 days"], ["449,919", "SWaT test rows (4 days)"], ["51", "SWaT signals"], ["12.1%", "SWaT test rows under attack"]];
  stats.forEach(([v, l], i) => {
    const x = MX + (i % 2) * 2.85, y = 1.65 + Math.floor(i / 2) * 1.7;
    s.addText(v, { x, y, w: 2.7, h: 0.8, fontSize: 40, bold: true, fontFace: THEME.headFontFace, color: C.accent1, margin: 0, isTextBox: true, objectName: nm("stat-v") });
    s.addText(l, { x, y: y + 0.8, w: 2.7, h: 0.6, fontSize: 13, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: nm("stat-l") });
  });
  s.addText("All counts and attack fractions measured from the converted files.", { x: MX, y: 5.2, w: 5.5, h: 0.6, fontSize: 11, italic: true, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: nm("caption") });

  const rows = [
    [TBL_HEAD(""), TBL_HEAD("SWaT (Dec 2015)"), TBL_HEAD("WADI (A2, Nov 2019)")],
    ["Plant", "Treatment, 6 coupled stages", "Distribution network"],
    ["Normal / attack days", "7 / 4", "≈9 / 2"],
    ["Signals", "51", "127"],
    ["Attack rows", "12.1%", "5.8%"],
    ["Cleaning effort", "Low: drop start-up", "High: NaN, dead sensors"],
    ["Published GDN F1", "0.81", "0.57 (2017 release)"],
  ];
  s.addTable(rows, { x: 6.6, y: 1.65, w: W - MX - 6.6, colW: [1.9, 2.1, 2.133], fontSize: 13, color: C.text1, border: TBL_BORDER, rowH: 0.48, valign: "middle", objectName: nm("table") });
  s.addNotes("SWaT normal v1 removes 30 minutes of tank drain from v0. WADI 2019 has labels in the file (-1 = attack).");
}

// ---------- 5. Related work ----------
{
  const s = contentSlide("Background", "Related work", "What we reproduce and build on");
  const rows = [
    [TBL_HEAD("Work"), TBL_HEAD("Idea"), TBL_HEAD("Role here")],
    ["GDN · Deng & Hooi, AAAI 2021", "Learned sensor graph + attention forecaster; max normalised deviation, which also names the sensor", "Main reproduction. SWaT F1 0.81"],
    ["USAD · Audibert et al., KDD 2020", "Two autoencoders, shared encoder, adversarial training", "Second reproduction"],
    ["Goh et al., HASE 2017", "LSTM forecaster + CUSUM on SWaT", "Context"],
    ["Inoue et al., ICDMW 2017", "Deep neural network vs one-class SVM on SWaT", "Context; PCA and iForest baselines"],
    ["Kim et al., AAAI 2022", "Point-adjust inflates F1; random scores look competitive", "Motivates strict evaluation"],
    ["Garg et al., IEEE TNNLS 2021", "Composite F1: point precision + event recall", "Headline metric"],
  ];
  s.addTable(rows, { x: MX, y: 1.6, w: W - 2 * MX, colW: [3.6, 5.6, 2.933], fontSize: 13, color: C.text1, border: TBL_BORDER, rowH: 0.62, valign: "middle", objectName: nm("table") });
}

// ---------- 6. Network / fusion check ----------
{
  const s = contentSlide("Background", "Network data", "Why we detect from process data");
  const items = [
    ["Berge & Li, NIKT 2024", "Fused Zeek conn.log + cip.log with process data (SWaT A6, 2019), supervised classifiers. Fusion improved recall; results only as histograms; \"proof of concept\"."],
    ["Mieden & Beltman, OS3 2020", "Neural networks on the 2015 network CSVs, payload dropped. Best F1 ≈ 0.73 on single-stage single-point attacks; other types ≈ 0.01–0.15."],
    ["arXiv 2205.08953 (thesis)", "Convolutional GRU autoencoder on raw industrial traffic. Representations did not improve intrusion detection."],
  ];
  items.forEach(([t, d], i) => {
    const y = 1.65 + i * 1.3;
    s.addShape(pres.shapes.OVAL, { x: MX, y: y + 0.05, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: nm("dot") });
    s.addText(String(i + 1), { x: MX, y: y + 0.05, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm("dot-n") });
    s.addText(t, { x: MX + 0.75, y, w: 6.6, h: 0.4, fontSize: 16, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: nm("item-t") });
    s.addText(d, { x: MX + 0.75, y: y + 0.4, w: 6.6, h: 0.8, fontSize: 13, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: nm("item-d") });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.4, y: 1.65, w: W - MX - 8.4, h: 3.9, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.accent6, width: 1 }, objectName: nm("callout") });
  s.addText([
    { text: "Takeaway", options: { bold: true, fontSize: 18, color: C.accent1, breakLine: true, paraSpaceAfter: 10 } },
    { text: "SWaT attacks change the values inside packets, not traffic volume or timing. Flow features show little.", options: { fontSize: 15, color: C.text1, breakLine: true, paraSpaceAfter: 10 } },
    { text: "Main project: process data. Network fusion stays an optional stretch goal.", options: { fontSize: 15, bold: true, color: C.text1 } },
  ], { x: 8.65, y: 1.9, w: W - MX - 8.9, h: 3.4, valign: "top", margin: 0, isTextBox: true, objectName: nm("callout-t") });
  s.addNotes("Literature search was three web searches and four sources read; paywalled work may exist. Check Google Scholar before claiming novelty for fusion.");
}

// ---------- 7. Pipeline ----------
{
  const s = contentSlide("Design", "System design", "One pipeline, four interchangeable detectors");
  const box = (x, y, w, h, title, sub, kind) => {
    const fill = kind === "accent" ? C.background2 : kind === "alarm" ? C.background1 : C.background1;
    const line = kind === "accent" ? C.accent1 : kind === "alarm" ? C.accent2 : C.accent6;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: fill }, line: { color: line, width: kind ? 2 : 1 }, objectName: nm("box") });
    s.addText([
      { text: title, options: { bold: true, fontSize: 15, color: C.text1, breakLine: true } },
      { text: sub, options: { fontSize: 12, color: C.accent5 } },
    ], { x: x + 0.1, y: y + 0.1, w: w - 0.2, h: h - 0.2, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm("box-t") });
  };
  const arrow = (x1, y1, x2, y2) => s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipH: x2 < x1, line: { color: C.accent5, width: 1.5, endArrowType: "triangle" }, objectName: nm("arrow") });
  const bw = 2.15, gap = (W - 2 * MX - 5 * bw) / 4, y1 = 1.85, bh = 1.25;
  const top = [["Raw files", "xlsx / csv"], ["Parquet", "signals + label"], ["Preprocess", "median ÷10, drop 6 h, min–max, 10% val"], ["Detector", "PCA · iForest · USAD · GDN"], ["Score", "(T,) + per sensor"]];
  top.forEach(([t, d], i) => {
    const x = MX + i * (bw + gap);
    box(x, y1, bw, bh, t, d, i === 3 ? "accent" : null);
    if (i < 4) arrow(x + bw, y1 + bh / 2, x + bw + gap, y1 + bh / 2);
  });
  const y2 = 4.15, bw2 = 2.8, gap2 = (W - 2 * MX - 4 * bw2) / 3;
  const bottom = [["Report + demo", "tables, score replay"], ["Metrics", "point · PA · event · composite F1 · TTD"], ["Alarm logic", "global or stage-wise P1–P6, k-of-n"], ["Threshold", "best-F1 oracle · val-max · val q99.9"]];
  bottom.forEach(([t, d], i) => {
    const x = MX + i * (bw2 + gap2);
    box(x, y2, bw2, bh, t, d, i === 2 ? "alarm" : null);
    if (i > 0) arrow(x, y2 + bh / 2, x - gap2, y2 + bh / 2);
  });
  // down arrow from Score to Threshold
  const sx = MX + 4 * (bw + gap) + bw / 2;
  const tx = MX + 3 * (bw2 + gap2) + bw2 / 2;
  arrow(sx, y1 + bh, sx, y2 - 0.02);
  s.addText("Every detector implements fit(train, val) and score(x) → (T,). Labels enter only at metrics, and in the best-F1 oracle, which is always reported under that name.", { x: MX, y: 5.85, w: W - 2 * MX, h: 0.6, fontSize: 13, italic: true, color: C.accent5, margin: 0, isTextBox: true, objectName: nm("caption") });
  void tx;
}

// ---------- 8. Models ----------
{
  const s = contentSlide("Design", "Models", "Baselines and published deep models");
  const rows = [
    [TBL_HEAD("ID"), TBL_HEAD("Source"), TBL_HEAD("Anomaly score"), TBL_HEAD("Key settings")],
    ["pca", "Shyu et al. 2003", "Squared reconstruction error", "95% variance kept"],
    ["iforest", "Liu et al. 2008", "Negative isolation score", "200 trees, fixed seed"],
    ["usad", "Audibert et al. 2020", "α‖W−AE1‖² + β‖W−AE2(AE1)‖²", "Window 12, latent 40, α = β = 0.5, 70 epochs"],
    ["gdn", "Deng & Hooi 2021", "Max over sensors of robust-normalised forecast error, 3-step average", "Window 5; embed 64/128; top-k 15/30 (SWaT/WADI); 50 epochs, patience 10"],
  ];
  s.addTable(rows, { x: MX, y: 1.6, w: 8.6, colW: [1.0, 1.9, 2.9, 2.8], fontSize: 13, color: C.text1, border: TBL_BORDER, rowH: 0.7, valign: "middle", objectName: nm("table") });
  // Published targets
  const px = 9.6;
  s.addText("PUBLISHED GDN TARGETS", { x: px, y: 1.6, w: W - MX - px, h: 0.3, fontSize: 11, bold: true, color: C.accent1, charSpacing: 2, margin: 0, isTextBox: true, objectName: nm("label") });
  [["0.81", "SWaT F1 (P 99.35, R 68.12)"], ["0.57", "WADI F1, 2017 release (P 97.50, R 40.19)"]].forEach(([v, l], i) => {
    const y = 2.05 + i * 1.6;
    s.addText(v, { x: px, y, w: W - MX - px, h: 0.8, fontSize: 44, bold: true, fontFace: THEME.headFontFace, color: C.accent1, margin: 0, isTextBox: true, objectName: nm("stat-v") });
    s.addText(l, { x: px, y: y + 0.8, w: W - MX - px, h: 0.6, fontSize: 13, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: nm("stat-l") });
  });
  s.addText("Our one deliberate change to GDN: normalise errors with validation median and IQR. The official code uses test-set statistics.", { x: MX, y: 5.45, w: 8.6, h: 0.6, fontSize: 13, italic: true, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: nm("caption") });
}

// ---------- 9. Evaluation ----------
{
  const s = contentSlide("Evaluation", "Evaluation protocol", "Point-adjust inflates detection scores");
  // PA grid
  const labels = [0, 0, 1, 1, 1, 0, 0, 1, 1, 0];
  const pred = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0];
  const pa = [0, 0, 1, 1, 1, 0, 1, 0, 0, 0];
  const gx = MX + 1.35, cell = 0.44, cg = 0.06;
  const rowsDef = [["Attack", labels, C.accent1], ["Alarm", pred, C.accent2], ["After PA", pa, C.accent3]];
  rowsDef.forEach(([name, arr, col], r) => {
    const y = 1.75 + r * 0.72;
    s.addText(name, { x: MX, y, w: 1.25, h: cell, fontSize: 14, bold: true, color: C.text1, valign: "middle", margin: 0, isTextBox: true, objectName: nm("row-l") });
    arr.forEach((v, i) => {
      let fill = v ? col : C.background2;
      if (r === 2 && v && pred[i]) fill = C.accent2;
      s.addShape(pres.shapes.RECTANGLE, { x: gx + i * (cell + cg), y, w: cell, h: cell, fill: { color: fill }, line: { color: C.accent6, width: 0.75 }, objectName: nm("cell") });
    });
  });
  s.addText(bullets([
    "Point-wise recall 1/5",
    "After point-adjust 3/5",
    "Event recall 1/2: attack 2 is missed entirely",
  ], { space: 4 }), { x: MX, y: 4.0, w: 6.0, h: 1.3, fontSize: 14, color: C.text1, valign: "top", isTextBox: true, objectName: nm("pa-notes") });

  // Matrix
  const rows = [
    [TBL_HEAD("Threshold rule"), TBL_HEAD("Labels"), TBL_HEAD("Reported metrics")],
    ["best_f1 (oracle, most papers)", "Yes", "Point P/R/F1, point-adjust F1, event P/R, composite F1, time to detect"],
    ["val_max (GDN rule)", "No", "Same set"],
    ["val_q99.9", "No", "Same set"],
  ];
  s.addTable(rows, { x: 7.3, y: 1.75, w: W - MX - 7.3, colW: [2.0, 1.05, 2.383], fontSize: 13, color: C.text1, border: TBL_BORDER, rowH: 0.7, valign: "middle", objectName: nm("table") });
  s.addText("Plus ROC-AUC and PR-AUC per model. Mean ± std over seeds 0, 1, 2.", { x: 7.3, y: 4.85, w: W - MX - 7.3, h: 0.5, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true, objectName: nm("caption") });
  s.addNotes("This is the unit-test example from the implementation plan: ten 10-second steps, two attacks. All cells in the reporting matrix are planned; nothing measured yet.");
}

// ---------- 10. Original contributions ----------
{
  const s = contentSlide("Contribution", "Original modifications", "Four stretch goals, in priority order");
  const items = [
    ["Rigorous re-evaluation", "Show how far published-style numbers fall when the threshold is chosen without labels and recall is counted per step or per event."],
    ["Plant-aware alarms", "Group GDN's per-sensor errors by stage P1–P6, set a threshold per stage, and require k of the last n steps. Measure false alarms and time to detect; the operator sees which stage alarmed."],
    ["Transfer to WADI", "Apply the SWaT-tuned configuration to WADI without re-tuning: a larger, messier plant."],
    ["Network + process fusion (optional)", "Only if network CSVs for a few attack windows are obtained: do network features catch attacks the process model misses, or sooner?"],
  ];
  const cw = (W - 2 * MX - 0.35) / 2, ch = 2.05;
  items.forEach(([t, d], i) => {
    const x = MX + (i % 2) * (cw + 0.35), y = 1.6 + Math.floor(i / 2) * (ch + 0.3);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.06, fill: { color: i === 3 ? C.background1 : C.background2 }, line: { color: C.accent6, width: 1 }, objectName: nm("card") });
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.25, w: 0.55, h: 0.55, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: nm("dot") });
    s.addText(String(i + 1), { x: x + 0.25, y: y + 0.25, w: 0.55, h: 0.55, fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm("dot-n") });
    s.addText(t, { x: x + 1.0, y: y + 0.27, w: cw - 1.25, h: 0.5, fontSize: 18, bold: true, color: C.text1, valign: "middle", margin: 0, isTextBox: true, objectName: nm("card-t") });
    s.addText(d, { x: x + 1.0, y: y + 0.85, w: cw - 1.25, h: ch - 1.0, fontSize: 14, color: C.text1, valign: "top", margin: 0, isTextBox: true, objectName: nm("card-d") });
  });
}

// ---------- 11. Demo plan ----------
{
  const s = contentSlide("Demo", "Demo plan", "Replay the attack days, watch alarms fire");
  // Wireframe frame
  const fx = MX, fy = 1.6, fw = 7.6, fh = 4.6;
  s.addShape(pres.shapes.RECTANGLE, { x: fx, y: fy, w: fw, h: fh, fill: { color: C.background2 }, line: { color: C.accent6, width: 1 }, objectName: nm("frame") });
  // Score trace panel
  s.addShape(pres.shapes.RECTANGLE, { x: fx + 0.25, y: fy + 0.25, w: fw - 0.5, h: 1.9, fill: { color: C.background1 }, line: { color: C.accent6, width: 0.75 }, objectName: nm("panel") });
  [[1.4, 0.5], [3.6, 0.35], [5.4, 0.7]].forEach(([ox, ww]) => s.addShape(pres.shapes.RECTANGLE, { x: fx + 0.25 + ox, y: fy + 0.3, w: ww, h: 1.8, fill: { color: C.accent2, transparency: 80 }, line: { color: C.accent2, width: 0, transparency: 100 }, objectName: nm("shade") }));
  s.addShape(pres.shapes.LINE, { x: fx + 0.35, y: fy + 0.85, w: fw - 0.7, h: 0, line: { color: C.accent3, width: 1.25, dashType: "dash" }, objectName: nm("thr") });
  s.addText("Anomaly score over time · attack windows shaded · threshold dashed", { x: fx + 0.4, y: fy + 1.75, w: fw - 0.8, h: 0.3, fontSize: 11, color: C.accent5, margin: 0, isTextBox: true, objectName: nm("panel-l") });
  // Stage heatmap panel
  const hx = fx + 0.25, hy = fy + 2.35, hw = 4.4, hh = 2.0;
  s.addShape(pres.shapes.RECTANGLE, { x: hx, y: hy, w: hw, h: hh, fill: { color: C.background1 }, line: { color: C.accent6, width: 0.75 }, objectName: nm("panel") });
  for (let r = 0; r < 6; r++) {
    s.addText(`P${r + 1}`, { x: hx + 0.1, y: hy + 0.12 + r * 0.24, w: 0.4, h: 0.22, fontSize: 9, color: C.accent5, margin: 0, isTextBox: true, objectName: nm("hm-l") });
    s.addShape(pres.shapes.RECTANGLE, { x: hx + 0.55, y: hy + 0.14 + r * 0.24, w: hw - 0.75, h: 0.18, fill: { color: C.background2 }, line: { color: C.accent6, width: 0.5 }, objectName: nm("hm-row") });
  }
  s.addText("Stage alarm panel P1–P6", { x: hx + 0.1, y: hy + hh - 0.4, w: hw - 0.2, h: 0.3, fontSize: 11, color: C.accent5, margin: 0, isTextBox: true, objectName: nm("panel-l") });
  // Metric bars panel
  const bx = hx + hw + 0.2, bw = fw - 0.25 - (bx - fx) - 0.0 - 0.25;
  s.addShape(pres.shapes.RECTANGLE, { x: bx, y: hy, w: bw, h: hh, fill: { color: C.background1 }, line: { color: C.accent6, width: 0.75 }, objectName: nm("panel") });
  s.addText("PA vs point-wise vs composite F1 per model", { x: bx + 0.1, y: hy + hh - 0.6, w: bw - 0.2, h: 0.5, fontSize: 11, color: C.accent5, margin: 0, valign: "top", isTextBox: true, objectName: nm("panel-l") });
  s.addText("Layout sketch only. No results yet.", { x: fx, y: fy + fh + 0.08, w: fw, h: 0.3, fontSize: 11, italic: true, color: C.accent3, margin: 0, isTextBox: true, objectName: nm("caption") });

  s.addText(bullets([
    [{ text: "Score replay: ", bold: true }, { text: "SWaT test set with attack shading and alarms as they fire" }],
    [{ text: "Stage panel: ", bold: true }, { text: "which stage alarmed, and the top-ranked sensor vs the attacked component" }],
    [{ text: "Metric bars: ", bold: true }, { text: "point-adjusted vs strict F1 per model, beside published values" }],
    [{ text: "Time to detect: ", bold: true }, { text: "histogram per model, in seconds" }],
  ], { space: 12 }), { x: 8.6, y: 1.6, w: W - MX - 8.6, h: 4.6, fontSize: 14, color: C.text1, valign: "top", isTextBox: true, objectName: nm("body") });
}

// ---------- 12. Timeline ----------
{
  const s = contentSlide("Plan", "Timeline", "Six weeks from data to demo");
  const weeks = [
    ["Week 1", "Data conversion, preprocessing, metrics, classical baselines", true],
    ["Week 2", "USAD, first SWaT runs", false],
    ["Week 3", "GDN; checkpoint: SWaT point-wise F1 ≥ 0.70 (published 0.81)", false],
    ["Week 4", "Seeds 0–2, full evaluation matrix, report script", false],
    ["Week 5", "Stage-wise alarms with k-of-n, WADI transfer", false],
    ["Week 6", "Demo replay, final presentation and report", false],
  ];
  const ly = 3.2, cw = (W - 2 * MX) / 6;
  s.addShape(pres.shapes.LINE, { x: MX + cw / 2, y: ly, w: W - 2 * MX - cw, h: 0, line: { color: C.accent6, width: 2 }, objectName: nm("tl-line") });
  weeks.forEach(([wk, d, now], i) => {
    const cx = MX + i * cw + cw / 2;
    s.addShape(pres.shapes.OVAL, { x: cx - 0.17, y: ly - 0.17, w: 0.34, h: 0.34, fill: { color: now ? C.accent1 : C.background1 }, line: { color: C.accent1, width: 2 }, objectName: nm("tl-dot") });
    s.addText(wk, { x: cx - cw / 2 + 0.1, y: 2.35, w: cw - 0.2, h: 0.45, fontSize: 18, bold: true, fontFace: THEME.headFontFace, color: now ? C.accent1 : C.text1, align: "center", margin: 0, isTextBox: true, objectName: nm("tl-wk") });
    s.addText(d, { x: cx - cw / 2 + 0.12, y: 3.65, w: cw - 0.24, h: 1.6, fontSize: 14, color: C.text1, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: nm("tl-d") });
  });
  pill(s, MX + cw / 2 - 0.65, 5.35, "in progress", "done");
}

// ---------- 13. Risks ----------
{
  const s = contentSlide("Plan", "Risks", "Risks and mitigations");
  const rows = [
    [TBL_HEAD("Risk"), TBL_HEAD("Mitigation")],
    ["CPU-only training (no GPU, 14 GB RAM)", "Downsampling ÷10 gives about 50k SWaT training windows. Time GDN and USAD early; cut epochs if a run exceeds 1 h; Colab as fallback"],
    ["WADI data quality", "Drop constant or empty columns; guard min–max against division by zero; unit tests for both"],
    ["Reproduction gap vs published numbers", "Match GDN preprocessing exactly and record every protocol difference; a documented gap is still a finding"],
    ["Labels and scores misaligned by windowing", "One score per step with explicit padding; a unit test pins a known spike to its index"],
    ["WADI release differs from GDN's (2019 vs 2017)", "Treat WADI comparison with published numbers as indicative only"],
  ];
  s.addTable(rows, { x: MX, y: 1.6, w: W - 2 * MX, colW: [4.0, 8.133], fontSize: 14, color: C.text1, border: TBL_BORDER, rowH: 0.72, valign: "middle", objectName: nm("table") });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
