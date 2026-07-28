export class ExecutionQueue {
  private activeRuns = 0;
  private maxConcurrentRuns = 20;
  private runQueue: (() => void)[] = [];

  private activeTerminals = 0;
  private maxConcurrentTerminals = 30;

  // For code running (queues when limit reached)
  async acquireRun(): Promise<() => void> {
    if (this.activeRuns < this.maxConcurrentRuns) {
      this.activeRuns++;
      return () => this.releaseRun();
    }

    return new Promise<() => void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.runQueue.indexOf(notify);
        if (index > -1) {
          this.runQueue.splice(index, 1);
          reject(new Error("Server is under heavy load. Execution request timed out in queue."));
        }
      }, 10000); // 10 second timeout

      const notify = () => {
        clearTimeout(timeout);
        this.activeRuns++;
        resolve(() => this.releaseRun());
      };

      this.runQueue.push(notify);
    });
  }

  private releaseRun() {
    this.activeRuns--;
    if (this.runQueue.length > 0) {
      const next = this.runQueue.shift();
      if (next) next();
    }
  }

  // For interactive terminals (rejects immediately when limit reached)
  acquireTerminal(): boolean {
    if (this.activeTerminals < this.maxConcurrentTerminals) {
      this.activeTerminals++;
      return true;
    }
    return false;
  }

  releaseTerminal() {
    this.activeTerminals = Math.max(0, this.activeTerminals - 1);
  }
}

export const executionQueue = new ExecutionQueue();
