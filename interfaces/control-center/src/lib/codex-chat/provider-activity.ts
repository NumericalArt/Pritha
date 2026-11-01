import type { TaskChatBackendDriver, TaskChatBackend } from "./driver-types";
type Activity = Awaited<ReturnType<TaskChatBackend["activity"]>>;

/** Each backend cursor is independent. A fast provider cannot hide a slower one. */
export class ProviderActivity {
  private readonly epoch = Date.now() * 1000;
  private cursor = this.epoch;
  private positions = new Map<string, number>();
  private changes: Array<{ sequence: number; chatId: string }> = [];
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly drivers: TaskChatBackendDriver[]) {}
  read(after = 0): Promise<Activity> {
    const work = this.pending.then(async () => {
      let reset = after < this.epoch || after > this.cursor || (this.changes.length > 0 && after < this.changes[0].sequence - 1);
      let snapshots = await Promise.all(this.drivers.map(driver => driver.backend.activity(reset ? 0 : this.positions.get(driver.connectorId) || 0)));
      if (!reset && snapshots.some(snapshot => snapshot.reset)) {
        reset = true;
        snapshots = await Promise.all(this.drivers.map(driver => driver.backend.activity(0)));
      }
      // Commit cursors only after every provider answered. A failed sibling must
      // not make a successful provider's unseen events disappear on retry.
      this.drivers.forEach((driver, index) => this.positions.set(driver.connectorId, snapshots[index].cursor));
      for (const chatId of new Set(snapshots.flatMap(snapshot => snapshot.changed))) this.changes.push({ sequence: ++this.cursor, chatId });
      this.changes = this.changes.slice(-10_000);
      const changed = [...new Set(this.changes.filter(change => reset || change.sequence > after).map(change => change.chatId))];
      return {
        cursor: this.cursor, reset, changed,
        admissionEnabled: snapshots.every(snapshot => snapshot.admissionEnabled),
        active: [...new Map(snapshots.flatMap(snapshot => snapshot.active).sort((a,b)=>a.revision-b.revision).map(row=>[row.chatId,row])).values()], capacity: snapshots.reduce((sum, snapshot) => sum + snapshot.capacity, 0),
        counts: { active: 0, queued: 0, waitingForOperator: 0, unknown: 0, ...Object.fromEntries(["active", "queued", "waitingForOperator", "unknown"].map(key => [key, snapshots.reduce((sum, snapshot) => sum + snapshot.counts[key as keyof Activity["counts"]], 0)])) },
      };
    });
    this.pending = work.catch(() => undefined);
    return work;
  }
}
