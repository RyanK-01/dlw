export type MockIncidentRecord = {
  id: string;
  category: string;
  timestamp: string;
  status: "Active" | "Resolved";
  lat: number;
  lng: number;
};

export const mockIncidents: MockIncidentRecord[] = [
  {
    id: "1",
    category: "fire",
    timestamp: "2026-03-03T14:30:00+08:00",
    status: "Resolved",
    lat: 1.3521,
    lng: 103.8198,
  },
  {
    id: "2",
    category: "medical",
    timestamp: "2026-03-03T13:15:00+08:00",
    status: "Resolved",
    lat: 1.3048,
    lng: 103.8318,
  },
  {
    id: "3",
    category: "accident",
    timestamp: "2026-03-03T15:45:00+08:00",
    status: "Active",
    lat: 1.3347,
    lng: 103.962,
  },
  {
    id: "4",
    category: "security",
    timestamp: "2026-03-02T16:00:00+08:00",
    status: "Active",
    lat: 1.4382,
    lng: 103.789,
  },
  {
    id: "5",
    category: "fire",
    timestamp: "2026-03-02T11:20:00+08:00",
    status: "Resolved",
    lat: 1.2931,
    lng: 103.8558,
  },
];
