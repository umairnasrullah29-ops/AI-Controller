import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export interface RollbackSnapshot {
  id: string;
  originalPath: string;
  backupPath?: string;
  actionType: "delete" | "move" | "rename";
  createdAt: string;
}

const snapshots = new Map<string, RollbackSnapshot>();

export class UndoEngine {
  public static async createSnapshot(
    originalPath: string,
    actionType: "delete" | "move" | "rename"
  ): Promise<RollbackSnapshot | null> {
    try {
      const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const backupDir = path.join(os.tmpdir(), "ai-pc-undo");
      await fs.mkdir(backupDir, { recursive: true });

      const backupPath = path.join(backupDir, `${id}-${path.basename(originalPath)}`);

      try {
        await fs.cp(originalPath, backupPath, { recursive: true });
      } catch {
        // File may not exist yet or be locked
      }

      const snapshot: RollbackSnapshot = {
        id,
        originalPath,
        backupPath,
        actionType,
        createdAt: new Date().toISOString(),
      };

      snapshots.set(id, snapshot);
      return snapshot;
    } catch (err) {
      console.warn("Could not create undo snapshot:", err);
      return null;
    }
  }

  public static async rollback(snapshotId: string): Promise<{ success: boolean; message: string }> {
    const snapshot = snapshots.get(snapshotId);
    if (!snapshot) {
      return { success: false, message: "Snapshot ID not found" };
    }

    try {
      if (snapshot.backupPath) {
        await fs.cp(snapshot.backupPath, snapshot.originalPath, { recursive: true });
      }
      snapshots.delete(snapshotId);
      return { success: true, message: `Successfully restored '${snapshot.originalPath}'` };
    } catch (err: any) {
      return { success: false, message: `Rollback failed: ${err?.message || String(err)}` };
    }
  }

  public static listSnapshots(): RollbackSnapshot[] {
    return Array.from(snapshots.values());
  }
}
