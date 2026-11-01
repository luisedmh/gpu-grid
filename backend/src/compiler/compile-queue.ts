/**
 * In-memory work queue that runs at most `concurrency` tasks at the same time.
 * Compiling is CPU-heavy, so jobs wait here instead of all starting at once.
 */
export class CompileQueue {
  private readonly waiting: string[] = [];
  private running = 0;

  constructor(
    private readonly concurrency: number,
    private readonly handler: (jobId: string) => Promise<void>,
  ) {}

  add(jobId: string): void {
    this.waiting.push(jobId);
    this.next();
  }

  /** Number of jobs waiting plus running; useful for monitoring and tests. */
  get size(): number {
    return this.waiting.length + this.running;
  }

  private next(): void {
    while (this.running < this.concurrency) {
      const jobId = this.waiting.shift();
      if (jobId === undefined) return;

      this.running++;
      this.handler(jobId)
        .catch((err) => console.error(`Compilation of job ${jobId} failed unexpectedly:`, err))
        .finally(() => {
          this.running--;
          this.next();
        });
    }
  }
}
