import type { DiscoveryRecord, PortalModel } from "./types";

const base = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  async health() { return json<any>(await fetch(`${base}/health`)); },
  async listDiscoveries() { return json<DiscoveryRecord[]>(await fetch(`${base}/discoveries`)); },
  async getDiscovery(id: string) { return json<DiscoveryRecord>(await fetch(`${base}/discoveries/${encodeURIComponent(id)}`)); },
  async getStatus(id: string) {
    return json<{ id: string; status: string; progress: any; error?: string; record?: DiscoveryRecord }>(
      await fetch(`${base}/discoveries/${encodeURIComponent(id)}/status`),
    );
  },
  async getModel(id: string) { return json<PortalModel>(await fetch(`${base}/discoveries/${encodeURIComponent(id)}/model`)); },
  async discover(url: string, options?: Record<string, unknown>) {
    return json<{ id: string }>(await fetch(`${base}/discover`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, options }),
    }));
  },
  async rerun(id: string) {
    return json<{ id: string }>(await fetch(`${base}/discoveries/${encodeURIComponent(id)}/rerun`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  },
  async remove(id: string) { return json<{ ok: boolean }>(await fetch(`${base}/discoveries/${encodeURIComponent(id)}`, { method: "DELETE" })); },
  eventsUrl(id: string) { return `${base}/discoveries/${encodeURIComponent(id)}/events`; },
  modelExportUrl(id: string) { return `${base}/discoveries/${encodeURIComponent(id)}/export/model.json`; },
};
