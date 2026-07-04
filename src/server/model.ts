/**
 * Loads a run's artifacts and builds the PortalModel the frontend renders.
 * Screenshot paths are rewritten to API URLs so the browser can fetch them.
 */

import { FILENAMES } from "../core/constants.js";
import { buildScreenshotMap } from "../cli/pipeline.js";
import { buildPortalModel, type PortalModel } from "../portal/model.js";
import type { ReportInputs } from "../builders/report.js";
import type { RawCapture } from "../core/raw-capture.js";
import type { DiscoveryStore } from "./store.js";

export async function loadPortalModel(store: DiscoveryStore, id: string, runId: string): Promise<PortalModel> {
  const load = <T>(f: string) => store.repo.loadJson<T>(runId, f);
  const [model, overview, inventory, featureTree, featureRel, qaMap, checklist, summary, manualReview, validation, raw] =
    await Promise.all([
      load<any>(FILENAMES.discoveryModelJson),
      load<any>(FILENAMES.applicationOverviewJson),
      load<any>(FILENAMES.qaInventoryJson),
      load<any>(FILENAMES.featureTreeJson),
      load<any>(FILENAMES.featureRelationshipsJson),
      load<any>(FILENAMES.qaMapJson),
      load<any>(FILENAMES.qaChecklistJson),
      load<any>(FILENAMES.discoverySummaryJson),
      load<any>(FILENAMES.manualReviewJson),
      load<any>(FILENAMES.discoveryValidationJson),
      load<RawCapture>(FILENAMES.rawCapture),
    ]);

  const inputs: ReportInputs = { model, overview, inventory, featureTree, featureRel, qaMap, checklist, summary, manualReview, validation };
  const screenshots = buildScreenshotMap(raw);

  // rewrite relative capture paths to API URLs the frontend can fetch
  const base = `/api/discoveries/${encodeURIComponent(id)}/file/`;
  for (const key of Object.keys(screenshots)) {
    const s = screenshots[key];
    for (const k of ["desktop", "tablet", "mobile"] as const) {
      if (s[k]) s[k] = base + s[k];
    }
  }

  return buildPortalModel(inputs, raw, screenshots);
}
