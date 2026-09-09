/**
 * Phone Agent - Global Emergency Stop Controller
 * Singleton controller providing instantaneous halt capability across all subsystems.
 */

type EmergencyStopListener = (reason: string, timestamp: number) => void;

export class EmergencyStopManager {
  private static instance: EmergencyStopManager;
  private isTriggered: boolean = false;
  private stopReason: string = '';
  private triggeredAt: number = 0;
  private listeners: EmergencyStopListener[] = [];

  private constructor() {}

  public static getInstance(): EmergencyStopManager {
    if (!EmergencyStopManager.instance) {
      EmergencyStopManager.instance = new EmergencyStopManager();
    }
    return EmergencyStopManager.instance;
  }

  public isActive(): boolean {
    return this.isTriggered;
  }

  public getReason(): string {
    return this.stopReason;
  }

  public getTriggeredAt(): number {
    return this.triggeredAt;
  }

  public trigger(reason: string = 'User pressed Emergency Stop button'): void {
    this.isTriggered = true;
    this.stopReason = reason;
    this.triggeredAt = Date.now();
    console.warn(`[EMERGENCY_STOP_TRIGGERED] Reason: ${reason}`);

    for (const listener of this.listeners) {
      try {
        listener(reason, this.triggeredAt);
      } catch (err) {
        console.error('[EmergencyStop] Error in listener', err);
      }
    }
  }

  public activate(reason: string = 'Emergency Stop activated'): void {
    this.trigger(reason);
  }

  public reset(): void {
    this.isTriggered = false;
    this.stopReason = '';
    this.triggeredAt = 0;
    console.info('[EMERGENCY_STOP_RESET] Automation safety lock released.');
  }

  public addListener(listener: EmergencyStopListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}
