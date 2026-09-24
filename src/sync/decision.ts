export type SyncDecision =
  "nothing" | "upload" | "restore" | "conflict" | "synced" | "mark-synced";

export function decideSync(options: {
  remoteId: string | null;
  remoteHash: string | null;
  localHash: string;
  localHasContent: boolean;
  previous?: { snapshotId: string; contentHash: string };
}): SyncDecision {
  const { remoteId, remoteHash, localHash, localHasContent, previous } =
    options;
  if (!remoteId) return localHasContent ? "upload" : "nothing";
  if (previous?.snapshotId === remoteId)
    return previous.contentHash === localHash ? "synced" : "upload";
  if (remoteHash === localHash) return "mark-synced";
  // A newer remote snapshot may be a sibling, not a descendant of our last
  // upload. Never replace local records silently when this device has history.
  if (!previous && !localHasContent) return "restore";
  return "conflict";
}
