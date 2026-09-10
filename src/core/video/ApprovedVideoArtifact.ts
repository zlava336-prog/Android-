/**
 * Phone Agent - Step 2M Approved Video Artifact (Downstream Handoff)
 * Safe immutable artifact handed off to MultiPlatformPlanner and publication workflow.
 * INVARIANT: Does NOT contain publishing authorization or API credentials by itself.
 * Downstream publishing still requires human review in the publish approval modal.
 */

import { SupportedPlatform } from '../../types/job';

export interface ApprovedVideoArtifact {
  artifactId: string;
  projectId: string;
  artifactUri: string; // local file:// or content://
  outputFingerprint: string; // opf_<sha256>
  contentFingerprint: string; // cfp_<sha256>
  productFingerprint: string; // pfp_<sha256>
  projectFingerprint: string; // vpf_<sha256>
  approvedPlatformTargets: SupportedPlatform[];
  approvedBy: string;
  approvedAt: number;
  durationMs: number;
  dimensions: {
    width: number;
    height: number;
  };
  notes?: string;
}

export class ApprovedVideoArtifactValidator {
  public static validate(artifact: ApprovedVideoArtifact): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!artifact) {
      return { valid: false, errors: ['Artifact is null or undefined.'] };
    }

    if (!artifact.artifactId || artifact.artifactId.trim().length === 0) {
      errors.push('artifactId is required.');
    }

    if (!artifact.artifactUri || (!artifact.artifactUri.startsWith('content://') && !artifact.artifactUri.startsWith('file://') && !artifact.artifactUri.startsWith('/'))) {
      errors.push(`artifactUri must be a local URI, got: ${artifact.artifactUri}`);
    }

    if (!artifact.outputFingerprint?.startsWith('opf_')) {
      errors.push('outputFingerprint must start with opf_.');
    }

    if (!artifact.contentFingerprint?.startsWith('cfp_')) {
      errors.push('contentFingerprint must start with cfp_.');
    }

    if (!artifact.productFingerprint?.startsWith('pfp_')) {
      errors.push('productFingerprint must start with pfp_.');
    }

    if (!artifact.projectFingerprint?.startsWith('vpf_')) {
      errors.push('projectFingerprint must start with vpf_.');
    }

    if (!Array.isArray(artifact.approvedPlatformTargets) || artifact.approvedPlatformTargets.length === 0) {
      errors.push('approvedPlatformTargets must contain at least one supported platform.');
    }

    // Amazon is strictly a source application, never a publishing destination!
    if (artifact.approvedPlatformTargets.includes('amazon' as any)) {
      errors.push('Amazon is strictly a source application and is forbidden as an approved publishing destination.');
    }

    if (!artifact.approvedBy || artifact.approvedBy.trim().length === 0) {
      errors.push('approvedBy reviewer identity is required.');
    }

    if (typeof artifact.approvedAt !== 'number' || artifact.approvedAt <= 0) {
      errors.push('approvedAt timestamp must be positive.');
    }

    if (typeof artifact.durationMs !== 'number' || artifact.durationMs <= 0) {
      errors.push('durationMs must be positive.');
    }

    if (
      !artifact.dimensions ||
      artifact.dimensions.width <= 0 ||
      artifact.dimensions.height <= 0
    ) {
      errors.push('Valid width and height dimensions are required.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
