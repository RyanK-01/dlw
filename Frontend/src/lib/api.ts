export type BackendIncidentStatus =
  | "detected"
  | "notified"
  | "claimed"
  | "attending"
  | "completed"
  | "resolved";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export function getBackendBaseUrl(): string {
  return API_BASE_URL || "(vite-proxy)";
}

export async function getIncident(incidentId: string) {
  return apiRequest<any>(`/api/incidents/${encodeURIComponent(incidentId)}`);
}

export async function claimIncident(incidentId: string, officerId: string) {
  return apiRequest<{ status: BackendIncidentStatus; incident_id: string; officer_id: string }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/claim`,
    {
      method: "POST",
      body: { officer_id: officerId },
    }
  );
}

export async function verifyIncident(
  incidentId: string,
  officerId: string,
  isTruePositive: boolean,
  notes?: string
) {
  return apiRequest<{ incident_id: string; officer_id: string }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/verify`,
    {
      method: "POST",
      body: {
        officer_id: officerId,
        is_true_positive: isTruePositive,
        notes: notes?.trim() || undefined,
      },
    }
  );
}

export async function attendIncident(incidentId: string, officerId: string, notes?: string) {
  return apiRequest<{ incident_id: string; status: BackendIncidentStatus; officer_id: string }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/attend`,
    {
      method: "POST",
      body: {
        officer_id: officerId,
        notes: notes?.trim() || undefined,
      },
    }
  );
}

export async function completeIncident(
  incidentId: string,
  officerId: string,
  resolutionSummary: string,
  notes?: string
) {
  return apiRequest<{ incident_id: string; status: BackendIncidentStatus; officer_id: string; report_id: string }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/complete`,
    {
      method: "POST",
      body: {
        officer_id: officerId,
        resolution_summary: resolutionSummary,
        actions_taken: [],
        notes: notes?.trim() || undefined,
      },
    }
  );
}
