import type { FlightDataset, FlightDatasetMeta } from '../../lib/types';

export async function fetchDatasetList(): Promise<FlightDatasetMeta[]> {
  const res = await fetch('/api/datasets');
  if (!res.ok) throw new Error(`datasets ${res.status}`);
  return (await res.json()) as FlightDatasetMeta[];
}

export async function fetchDataset(id: string): Promise<FlightDataset> {
  const res = await fetch(`/api/datasets/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`dataset ${res.status}`);
  return (await res.json()) as FlightDataset;
}