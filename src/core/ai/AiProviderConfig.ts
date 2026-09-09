/**
 * Phone Agent - Step 2L AI Provider Configuration
 * Secure in-memory configuration abstraction for AI providers (Groq-first).
 * CRITICAL SECURITY INVARIANTS:
 * - Never stores or returns plaintext API keys in logs, audit events, or persistent storage.
 * - Never serializes API keys into ProductData, ContentPackage, or UI states.
 * - Masks secrets for UI display (e.g. "gsk_...****").
 * - Returns clean AI_PROVIDER_UNAVAILABLE when no key is configured.
 */

export interface AiProviderSettings {
  providerName: string; // e.g. 'groq'
  model: string; // e.g. 'llama-3.3-70b-versatile'
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class AiProviderConfig {
  private static instance: AiProviderConfig | null = null;
  private apiKey: string | null = null;
  private settings: AiProviderSettings;

  private constructor() {
    this.settings = {
      providerName: 'groq',
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      maxTokens: 1500,
      baseUrl: 'https://api.groq.com/openai/v1',
      timeoutMs: 15000,
      maxRetries: 2,
    };

    // Safely check environment at runtime without throwing if missing
    try {
      if (typeof process !== 'undefined' && process.env && process.env.GROQ_API_KEY) {
        this.apiKey = process.env.GROQ_API_KEY.trim();
      } else if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_GROQ_API_KEY) {
        this.apiKey = String((import.meta as any).env.VITE_GROQ_API_KEY).trim();
      }
    } catch {
      // Sandboxed or browser context
    }
  }

  public static getInstance(): AiProviderConfig {
    if (!AiProviderConfig.instance) {
      AiProviderConfig.instance = new AiProviderConfig();
    }
    return AiProviderConfig.instance;
  }

  public static resetInstance(): void {
    AiProviderConfig.instance = null;
  }

  /**
   * Sets runtime in-memory API key. Never persisted to disk.
   */
  public setApiKey(key: string | null): void {
    if (!key || key.trim().length === 0) {
      this.apiKey = null;
    } else {
      this.apiKey = key.trim();
    }
  }

  /**
   * Returns whether a valid API key is present.
   */
  public hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  /**
   * Internal retrieval for live HTTP calls only.
   * NEVER pass this result to loggers, serializers, or UI components.
   */
  public getApiKeyInternal(): string | null {
    return this.apiKey;
  }

  /**
   * Clears in-memory API key immediately.
   */
  public clearApiKey(): void {
    this.apiKey = null;
  }

  /**
   * Safe masked key representation for UI display only (e.g. "gsk_...****").
   */
  public getMaskedApiKey(): string {
    if (!this.apiKey) return 'NOT_CONFIGURED';
    if (this.apiKey.length <= 8) return '****';
    const prefix = this.apiKey.slice(0, 4);
    return `${prefix}...****`;
  }

  public getSettings(): Readonly<AiProviderSettings> {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AiProviderSettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
      maxRetries: Math.min(2, Math.max(0, partial.maxRetries ?? this.settings.maxRetries ?? 2)), // Bound retries strictly to max 2
    };
  }
}
