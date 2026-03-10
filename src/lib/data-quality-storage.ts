import type { DataQualityScanResult } from "@/lib/agents/data-quality-agent";

const STORAGE_KEY = "data-quality-scan-results";

function getStorageMap(): Record<string, DataQualityScanResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DataQualityScanResult>;
  } catch {
    return {};
  }
}

function setStorageMap(map: Record<string, DataQualityScanResult>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* localStorage full or unavailable */ }
}

export function saveScanResult(result: DataQualityScanResult): void {
  const map = getStorageMap();
  map[result.datasetId] = result;
  setStorageMap(map);
}

export function getScanResult(datasetId: string): DataQualityScanResult | null {
  const map = getStorageMap();
  return map[datasetId] ?? null;
}

export function removeScanResult(datasetId: string): void {
  const map = getStorageMap();
  delete map[datasetId];
  setStorageMap(map);
}

export function clearAllScanResults(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
