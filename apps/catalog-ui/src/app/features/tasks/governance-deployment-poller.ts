import { Observable, Subscription } from 'rxjs';

export interface DeploymentState {
  status: string;
}

export class GovernanceDeploymentPoller<T extends DeploymentState> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: Subscription | null = null;
  private active = false;

  constructor(
    private readonly load: () => Observable<T>,
    private readonly onUpdate: (value: T) => void,
    private readonly onTerminal: (value: T) => void,
    private readonly intervalMs = 1000,
  ) {}

  start(): void {
    this.stop();
    this.active = true;
    this.schedule();
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.request?.unsubscribe();
    this.request = null;
  }

  private schedule(): void {
    if (!this.active) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.active) return;
      this.request = this.load().subscribe({
        next: (value) => {
          if (!this.active) return;
          this.onUpdate(value);
          if (value.status === 'approved_deploying') this.schedule();
          else {
            this.active = false;
            this.onTerminal(value);
          }
        },
        error: () => this.schedule(),
      });
    }, this.intervalMs);
  }
}
