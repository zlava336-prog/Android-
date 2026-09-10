/**
 * Phone Agent - Step 2M Subtitle and Caption Track
 * Manages timed subtitle segments, timeline ordering, Unicode/emoji preservation, and format export.
 */

export interface SubtitleSegment {
  id: string;
  sequenceIndex: number;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
}

export interface SubtitleTrack {
  trackId: string;
  language: string; // e.g. 'en', 'es'
  segments: SubtitleSegment[];
}

export const MAX_SUBTITLE_SEGMENT_LENGTH = 200;

export class SubtitleTrackValidator {
  public static validateTrack(track?: SubtitleTrack | null): {
    valid: boolean;
    errors: string[];
  } {
    if (!track) {
      // Subtitle track is optional
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    if (!track.trackId || track.trackId.trim().length === 0) {
      errors.push('SubtitleTrack trackId is required.');
    }

    if (!track.language || track.language.trim().length === 0) {
      errors.push('SubtitleTrack language is required (e.g., "en").');
    }

    if (!Array.isArray(track.segments)) {
      errors.push('SubtitleTrack segments must be an array.');
      return { valid: false, errors };
    }

    let lastEndTime = 0;

    track.segments.forEach((seg, index) => {
      if (!seg.id || seg.id.trim().length === 0) {
        errors.push(`Segment #${index}: id is required.`);
      }

      if (seg.sequenceIndex !== index) {
        errors.push(`Segment #${index}: sequenceIndex (${seg.sequenceIndex}) must match index (${index}).`);
      }

      if (!seg.text || seg.text.trim().length === 0) {
        errors.push(`Segment #${index}: text cannot be empty.`);
      }

      if (seg.text && seg.text.length > MAX_SUBTITLE_SEGMENT_LENGTH) {
        errors.push(
          `Segment #${index}: text length (${seg.text.length}) exceeds maximum allowed (${MAX_SUBTITLE_SEGMENT_LENGTH}).`
        );
      }

      if (typeof seg.startTimeMs !== 'number' || seg.startTimeMs < 0) {
        errors.push(`Segment #${index}: startTimeMs must be non-negative.`);
      }

      if (typeof seg.endTimeMs !== 'number' || seg.endTimeMs <= seg.startTimeMs) {
        errors.push(
          `Segment #${index}: endTimeMs (${seg.endTimeMs}) must be strictly greater than startTimeMs (${seg.startTimeMs}).`
        );
      }

      if (seg.startTimeMs < lastEndTime) {
        errors.push(
          `Segment #${index}: startTimeMs (${seg.startTimeMs}ms) overlaps with previous segment end (${lastEndTime}ms). Subtitles must be monotonically ordered.`
        );
      }

      lastEndTime = Math.max(lastEndTime, seg.endTimeMs);
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Exports subtitle track to standard SubRip (.srt) format.
   * Preserves full Unicode and emojis.
   */
  public static toSrt(track: SubtitleTrack): string {
    const formatTime = (ms: number): string => {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const millis = ms % 1000;

      const pad = (n: number, z = 2) => String(n).padStart(z, '0');
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
    };

    return track.segments
      .map((seg, idx) => {
        const start = formatTime(seg.startTimeMs);
        const end = formatTime(seg.endTimeMs);
        return `${idx + 1}\n${start} --> ${end}\n${seg.text.trim()}\n`;
      })
      .join('\n');
  }
}
