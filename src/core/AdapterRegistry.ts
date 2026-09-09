/**
 * Phone Agent - Production-Grade Adapter Registry
 * Central registry managing all platform adapters with strict uniqueness,
 * capability matrix exposure, and structured error boundaries.
 */

import { AppAdapter, AdapterCapabilities } from './adapters/AppAdapter';
import { InstagramAdapter } from './adapters/InstagramAdapter';
import { AmazonAdapter } from './adapters/AmazonAdapter';
import { YouTubeAdapter } from './adapters/YouTubeAdapter';
import { FacebookAdapter } from './adapters/FacebookAdapter';
import { TikTokAdapter } from './adapters/TikTokAdapter';
import { PinterestAdapter } from './adapters/PinterestAdapter';
import { XAdapter } from './adapters/XAdapter';
import { ThreadsAdapter } from './adapters/ThreadsAdapter';
import { LinkedInAdapter } from './adapters/LinkedInAdapter';
import { SafeUiInspector, SafeActionExecutor } from './inspector';

export class DuplicateAdapterError extends Error {
  readonly adapterId: string;
  constructor(adapterId: string) {
    super(`Duplicate adapter registration rejected: Adapter with ID '${adapterId}' is already registered.`);
    this.name = 'DuplicateAdapterError';
    this.adapterId = adapterId;
  }
}

export class UnknownAdapterError extends Error {
  readonly adapterId: string;
  constructor(adapterId: string) {
    super(`Unknown adapter requested: No adapter registered with ID '${adapterId}'.`);
    this.name = 'UnknownAdapterError';
    this.adapterId = adapterId;
  }
}

export interface CapabilityMatrixItem {
  adapterId: string;
  displayName: string;
  packageName: string;
  capabilities: AdapterCapabilities;
}

export class AdapterRegistry {
  private static instance: AdapterRegistry | null = null;
  private adapters: Map<string, AppAdapter> = new Map();

  constructor() {}

  public static createDefaultRegistry(inspectorFactory?: (pkg: string) => SafeUiInspector, executor?: SafeActionExecutor): AdapterRegistry {
    const makeInsp = inspectorFactory || ((pkg: string) => new SafeUiInspector(pkg));
    const exec = executor || new SafeActionExecutor();
    const registry = new AdapterRegistry();

    registry.register(new InstagramAdapter(makeInsp('com.instagram.android'), exec));
    registry.register(new AmazonAdapter(makeInsp('com.amazon.mShop.android.shopping'), exec));
    registry.register(new YouTubeAdapter(makeInsp('com.google.android.youtube'), exec));
    registry.register(new FacebookAdapter(makeInsp('com.facebook.katana'), exec));
    registry.register(new TikTokAdapter(makeInsp('com.zhiliaoapp.musically'), exec));
    registry.register(new PinterestAdapter(makeInsp('com.pinterest'), exec));
    registry.register(new XAdapter(makeInsp('com.twitter.android'), exec));
    registry.register(new ThreadsAdapter(makeInsp('com.instagram.barcelona'), exec));
    registry.register(new LinkedInAdapter(makeInsp('com.linkedin.android'), exec));

    return registry;
  }

  public static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = AdapterRegistry.createDefaultRegistry();
    }
    return AdapterRegistry.instance;
  }

  public static resetInstance(): void {
    AdapterRegistry.instance = null;
  }

  public resetToDefaults(inspectorFactory?: (pkg: string) => SafeUiInspector, executor?: SafeActionExecutor): void {
    this.clear();
    const makeInsp = inspectorFactory || ((pkg: string) => new SafeUiInspector(pkg));
    const exec = executor || new SafeActionExecutor();
    this.register(new InstagramAdapter(makeInsp('com.instagram.android'), exec));
    this.register(new AmazonAdapter(makeInsp('com.amazon.mShop.android.shopping'), exec));
    this.register(new YouTubeAdapter(makeInsp('com.google.android.youtube'), exec));
    this.register(new FacebookAdapter(makeInsp('com.facebook.katana'), exec));
    this.register(new TikTokAdapter(makeInsp('com.zhiliaoapp.musically'), exec));
    this.register(new PinterestAdapter(makeInsp('com.pinterest'), exec));
    this.register(new XAdapter(makeInsp('com.twitter.android'), exec));
    this.register(new ThreadsAdapter(makeInsp('com.instagram.barcelona'), exec));
    this.register(new LinkedInAdapter(makeInsp('com.linkedin.android'), exec));
  }

  /**
   * Registers a platform adapter. Rejects duplicates with DuplicateAdapterError.
   */
  public register(adapter: AppAdapter): void {
    if (!adapter || !adapter.platformId) {
      throw new Error('Invalid adapter: missing platformId.');
    }

    const id = adapter.platformId.toLowerCase().trim();
    if (this.adapters.has(id)) {
      throw new DuplicateAdapterError(id);
    }

    this.adapters.set(id, adapter);
  }

  /**
   * Unregisters an adapter by ID.
   */
  public unregister(adapterId: string): boolean {
    const id = adapterId.toLowerCase().trim();
    return this.adapters.delete(id);
  }

  /**
   * Retrieves an adapter by ID. Throws UnknownAdapterError if not found.
   */
  public get(adapterId: string): AppAdapter {
    const id = adapterId.toLowerCase().trim();
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new UnknownAdapterError(id);
    }
    return adapter;
  }

  /**
   * Non-throwing lookup.
   */
  public find(adapterId: string): AppAdapter | undefined {
    return this.adapters.get(adapterId.toLowerCase().trim());
  }

  /**
   * Checks if an adapter is registered.
   */
  public has(adapterId: string): boolean {
    return this.adapters.has(adapterId.toLowerCase().trim());
  }

  /**
   * Returns all registered adapters.
   */
  public getAll(): AppAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Returns all active/enabled adapters.
   */
  public getEnabled(): AppAdapter[] {
    return this.getAll();
  }

  /**
   * Retrieves declared capabilities for an adapter ID.
   * Throws UnknownAdapterError if adapter is unknown.
   */
  public getCapabilities(adapterId: string): AdapterCapabilities {
    const adapter = this.get(adapterId);
    if (!adapter.capabilities) {
      return {
        supportsVideo: false,
        supportsImage: false,
        supportsTitle: false,
        supportsDescription: false,
        supportsHashtags: false,
        supportsCover: false,
        requiresApproval: true,
      };
    }
    return adapter.capabilities;
  }

  /**
   * Exposes centralized capability matrix suitable for dashboard display.
   */
  public getCapabilityMatrix(): CapabilityMatrixItem[] {
    return this.getAll().map(adapter => ({
      adapterId: adapter.platformId,
      displayName: adapter.displayName,
      packageName: adapter.packageName,
      capabilities: adapter.capabilities || {
        supportsVideo: false,
        supportsImage: false,
        supportsTitle: false,
        supportsDescription: false,
        supportsHashtags: false,
        supportsCover: false,
        requiresApproval: true,
      },
    }));
  }

  /**
   * Clears all registered adapters (for testing).
   */
  public clear(): void {
    this.adapters.clear();
  }

  /**
   * Returns count of registered adapters.
   */
  public size(): number {
    return this.adapters.size;
  }
}
