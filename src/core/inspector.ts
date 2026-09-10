/**
 * Phone Agent - Accessibility Automation Safe Abstractions
 * UiInspector, ActionExecutor, GestureExecutor, ScreenVerifier, and Safety Tripwires.
 */

import { UiNode, SecurityTripwireResult } from '../types/job';
import { EmergencyStopManager } from './emergencyStop';

export type { UiNode };

// Prohibited package names (banking, payment, SMS, OTP, password managers)
export const PROHIBITED_PACKAGES = [
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.android.mms',
  'com.google.android.apps.nbu.paisa.user', // Google Pay
  'com.phonepe.app',
  'net.one97.paytm',
  'com.paypal.android.p2pmobile',
  'com.chase.sig.android',
  'com.bankofamerica.activity',
  'com.wellsfargo.mobile',
  'com.citi.citimobile',
  'com.lastpass.lpandroid',
  'com.onepassword.android',
  'com.bitwarden',
  'org.keepassdroid',
  'com.android.settings',
];

// Dangerous screen keywords that MUST abort automation immediately
export const FORBIDDEN_TEXT_KEYWORDS = [
  'otp',
  'otp code',
  'enter otp',
  'one time password',
  'verification code',
  'security code',
  'enter pin',
  'upi pin',
  'cvv',
  'card number',
  'expiry date',
  'captcha',
  'not a robot',
  'enter password',
  'sign in to continue',
  'account suspended',
  'confirm payment',
  'purchase now',
  'pay with',
  'credit card',
  'bank account',
];

export interface UiInspector {
  getRootNode(): Promise<UiNode | null>;
  findNodesByText(text: string, exact?: boolean): Promise<UiNode[]>;
  findNodeByViewId(viewId: string): Promise<UiNode | null>;
  findNodeByContentDescription(desc: string): Promise<UiNode | null>;
  getCurrentPackage(): Promise<string>;
  checkSecurityTripwires(): Promise<SecurityTripwireResult>;
  dumpNodeTree(): Promise<UiNode[]>;
}

export interface ActionExecutor {
  click(node: UiNode): Promise<boolean>;
  clickAt(x: number, y: number): Promise<boolean>;
  typeText(node: UiNode, text: string): Promise<boolean>;
  clearText(node: UiNode): Promise<boolean>;
  scroll(direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): Promise<boolean>;
  copyToClipboard(text: string): Promise<boolean>;
  readClipboard(): Promise<string>;
  pressBack(): Promise<boolean>;
}

export interface ScreenVerifier {
  verifyForegroundPackage(expectedPackage: string): Promise<boolean>;
  verifyPreviewElement(elementDesc: string): Promise<boolean>;
  verifyPublishCompleted(successToken: string): Promise<boolean>;
}

/**
 * Mock / Production-Oriented Implementation of UiInspector
 */
export class SafeUiInspector implements UiInspector {
  private currentPackageName: string = 'com.instagram.android';
  private simulatedNodes: UiNode[] = [];
  private tripwireSimulated: boolean = false;
  private tripwireReason: string = '';
  private static instance: SafeUiInspector | null = null;

  public static getInstance(packageName: string = 'com.instagram.android', nodes?: UiNode[]): SafeUiInspector {
    if (!SafeUiInspector.instance) {
      SafeUiInspector.instance = new SafeUiInspector(packageName, nodes);
    }
    return SafeUiInspector.instance;
  }

  public static resetInstance(): void {
    SafeUiInspector.instance = null;
  }

  constructor(packageName: string = 'com.instagram.android', nodes?: UiNode[]) {
    this.currentPackageName = packageName;
    if (nodes) {
      this.simulatedNodes = nodes;
    }
  }

  public setPackage(packageName: string): void {
    this.currentPackageName = packageName;
  }

  public setNodes(nodes: UiNode[]): void {
    this.simulatedNodes = nodes;
  }

  public simulateSecurityTripwire(reason: string): void {
    this.tripwireSimulated = true;
    this.tripwireReason = reason;
  }

  public clearSecurityTripwire(): void {
    this.tripwireSimulated = false;
    this.tripwireReason = '';
  }

  public inspectCurrentScreen(): UiNode[] {
    return [...this.simulatedNodes];
  }

  public async getRootNode(): Promise<UiNode | null> {
    return this.simulatedNodes[0] || null;
  }

  public async getCurrentPackage(): Promise<string> {
    return this.currentPackageName;
  }

  public async findNodesByText(text: string, exact: boolean = false): Promise<UiNode[]> {
    const query = text.toLowerCase();
    return this.simulatedNodes.filter(n => {
      const nodeText = (n.text || '').toLowerCase();
      return exact ? nodeText === query : nodeText.includes(query);
    });
  }

  public async findNodeByViewId(viewId: string): Promise<UiNode | null> {
    return this.simulatedNodes.find(n => n.id === viewId) || null;
  }

  public async findNodeByContentDescription(desc: string): Promise<UiNode | null> {
    const query = desc.toLowerCase();
    return this.simulatedNodes.find(n => (n.contentDescription || '').toLowerCase().includes(query)) || null;
  }

  public async checkSecurityTripwires(): Promise<SecurityTripwireResult> {
    // 1. Prohibited package check
    if (PROHIBITED_PACKAGES.includes(this.currentPackageName)) {
      return {
        tripped: true,
        reason: `Prohibited package detected: ${this.currentPackageName}. Never inspect banking/SMS/security apps.`,
        detectedElement: this.currentPackageName,
      };
    }

    // 2. Simulated tripwire
    if (this.tripwireSimulated) {
      return {
        tripped: true,
        reason: this.tripwireReason,
        detectedElement: 'Simulated Security Challenge / CAPTCHA',
      };
    }

    // 3. Inspect visible text on current screen for forbidden keywords
    for (const node of this.simulatedNodes) {
      const combined = `${node.text || ''} ${node.contentDescription || ''}`.toLowerCase();
      for (const kw of FORBIDDEN_TEXT_KEYWORDS) {
        if (combined.includes(kw)) {
          return {
            tripped: true,
            reason: `Safety tripwire triggered: Detected sensitive keyword "${kw}". Aborting automation immediately.`,
            detectedElement: `${node.id} ("${node.text || node.contentDescription}")`,
          };
        }
      }
    }

    return { tripped: false };
  }

  public async dumpNodeTree(): Promise<UiNode[]> {
    return [...this.simulatedNodes];
  }
}

/**
 * Mock / Production-Oriented Implementation of ActionExecutor
 */
export class SafeActionExecutor implements ActionExecutor {
  private clipboardValue: string = '';
  private isHalted: boolean = false;
  private actionHistory: Array<{ action: string; target: string; time: number }> = [];

  constructor(_inspector?: UiInspector) {}

  public setHalted(halted: boolean): void {
    this.isHalted = halted;
  }

  public async click(node: UiNode): Promise<boolean> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    this.actionHistory.push({ action: 'click', target: node.id, time: Date.now() });
    return true;
  }

  public async clickAt(x: number, y: number): Promise<boolean> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    this.actionHistory.push({ action: 'clickAt', target: `(${x},${y})`, time: Date.now() });
    return true;
  }

  public async typeText(node: UiNode, text: string): Promise<boolean> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    this.actionHistory.push({ action: 'typeText', target: `${node.id}: "${text.slice(0, 30)}..."`, time: Date.now() });
    return true;
  }

  public async clearText(node: UiNode): Promise<boolean> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    this.actionHistory.push({ action: 'clearText', target: node.id, time: Date.now() });
    return true;
  }

  public async scroll(direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): Promise<boolean> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    this.actionHistory.push({ action: 'scroll', target: direction, time: Date.now() });
    return true;
  }

  public async copyToClipboard(text: string): Promise<boolean> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    this.clipboardValue = text;
    this.actionHistory.push({ action: 'copyToClipboard', target: text, time: Date.now() });
    return true;
  }

  public async readClipboard(): Promise<string> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    return this.clipboardValue;
  }

  public async pressBack(): Promise<boolean> {
    if (this.isHalted || EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency Stop is active. Action aborted.');
    this.actionHistory.push({ action: 'pressBack', target: 'system_back', time: Date.now() });
    return true;
  }

  public getHistory() {
    return [...this.actionHistory];
  }
}

export const UiInspector = SafeUiInspector;
export const ActionExecutor = SafeActionExecutor;

