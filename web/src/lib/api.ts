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
  // Live Browser Mode
  async liveOpen(id: string, componentId: string) {
    return json<any>(await fetch(`${base}/discoveries/${encodeURIComponent(id)}/live/open`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ componentId }),
    }));
  },
  async liveFrame(id: string) { return json<{ screenshot: string }>(await fetch(`${base}/discoveries/${encodeURIComponent(id)}/live/frame`)); },
  async liveClose(id: string) { return fetch(`${base}/discoveries/${encodeURIComponent(id)}/live/close`, { method: "POST" }); },
  // Projects (Phase 3)
  async listProjects() { return json<any[]>(await fetch(`${base}/projects`)); },
  async getProject(pid: string) { return json<any>(await fetch(`${base}/projects/${encodeURIComponent(pid)}`)); },
  async getProjectRuns(pid: string) { return json<any[]>(await fetch(`${base}/projects/${encodeURIComponent(pid)}/runs`)); },
  async compare(pid: string, from: string, to: string) { return json<any>(await fetch(`${base}/projects/${encodeURIComponent(pid)}/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)); },
  async stats() { return json<any>(await fetch(`${base}/stats`)); },
  async news(topic: string) { return json<any[]>(await fetch(`${base}/news?topic=${encodeURIComponent(topic)}`)); },
};
