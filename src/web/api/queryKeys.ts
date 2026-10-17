export const qk = {
  projects: ["projects"] as const,
  project: (key: string) => ["project", key] as const,
  board: (key: string) => ["board", key] as const,
  ticket: (ticketKey: string) => ["ticket", ticketKey] as const,
  features: (key: string) => ["features", key] as const,
  actors: ["actors"] as const,
};
