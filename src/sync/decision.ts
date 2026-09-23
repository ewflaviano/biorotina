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
  if (!localHasContent || previous?.contentHash === localHash) return "restore";
  return "conflict";
}
