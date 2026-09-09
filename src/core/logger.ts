/**
 * Phone Agent - Local Action Logger
 * Logs every automation action, UI inspection, safety check, and result locally.
 */

import { ActionLog, LogSeverity, SupportedPlatform } from '../types/job';

const STORAGE_KEY = 'phone_agent_action_logs';

export class LocalActionLogger {
  private static instance: LocalActionLogger;
  private logs: ActionLog[] = [];
  private listeners: ((log: ActionLog) => void)[] = [];

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): LocalActionLogger {
    if (!LocalActionLogger.instance) {
      LocalActionLogger.instance = new LocalActionLogger();
    }
    return LocalActionLogger.instance;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch {
      this.logs = [];
    }

    // Seed initial system boot log if empty
    if (this.logs.length === 0) {
      this.log({
        action: 'AGENT_INIT',
        details: 'Phone Agent service initialized with zero-trust safety constraints.',
        severity: 'INFO',
        safetyCheckPassed: true,
      });
    }
  }

  public log(entry: {
    jobId?: string;
    platform?: SupportedPlatform;
    action: string;
    details: string;
    nodeId?: string;
    severity?: LogSeverity;
    safetyCheckPassed?: boolean;
  }): ActionLog {
    const newLog: ActionLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      jobId: entry.jobId,
      platform: entry.platform,
      action: entry.action,
      details: entry.details,
      nodeId: entry.nodeId,
      severity: entry.severity || 'INFO',
      safetyCheckPassed: entry.safetyCheckPassed ?? true,
    };

    this.logs.unshift(newLog); // newest first
    if (this.logs.length > 500) {
      this.logs.pop();
    }

    this.persist();

    for (const listener of this.listeners) {
      try {
        listener(newLog);
      } catch (err) {
        console.error('Error notifying log listener:', err);
      }
    }

    return newLog;
  }

  public getLogs(): ActionLog[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.persist();
    this.log({
      action: 'LOGS_CLEARED',
      details: 'Audit log table reset by operator.',
      severity: 'WARN',
      safetyCheckPassed: true,
    });
  }

  public exportJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  public addListener(listener: (log: ActionLog) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch {
      // quota or private browsing fallback
    }
  }
}
