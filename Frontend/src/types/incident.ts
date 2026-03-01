import type { Timestamp } from "firebase/firestore";

export type IncidentStatus = "NEW" | "CONFIRMED" | "FALSE_ALARM" | "CLOSED";

export interface Incident {
  status: IncidentStatus;
  riskScore: number;
  category: string; // e.g. "suspected_violence"
  lat: number;
  lng: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  notes?: string;

  // optional for CCTV / live view:
  latestFrameJpeg?: string; // base64 dataURL OR storage URL
  previewUrl?: string; // optional: browser-playable link from edge (HLS/WebRTC)
  metadataLabel?: string; // optional: e.g. "man_with_knife"

  // responders who clicked "I'm responding"
  responders?: Record<string, boolean>; // { [uid]: true }
}