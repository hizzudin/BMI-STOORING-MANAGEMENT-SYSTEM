import { describe, expect, it } from 'vitest';
import { FileProfile } from '@bmi/shared';
import {
  buildFileBuffer,
  detectContentType,
  readEnvelope,
  type FileEnvelope,
} from './content.js';
import { buildThumbnail, compressForProfile, resizeToLongEdge } from './compression.js';
import { IMAGE_TARGET_MAX_BYTES, THUMBNAIL_LONG_EDGE } from './file-profiles.js';

/**
 * Pure-engine coverage (TASK-116): content sniffing by magic bytes, the
 * device-side compress stub (size / dimension / EXIF-GPS-strip outcome), and the
 * thumbnail model. Validates: AC-FUP-001, AC-FUP-002, AC-FUP-008, AC-FUP-005.
 */

function photo(width: number, height: number, logicalBytes: number, hasExifGps = true): Buffer {
  const env: FileEnvelope = {
    width,
    height,
    logicalBytes,
    hasExifGps,
    capturedAt: '2026-11-11T02:00:00.000Z',
    pageCount: 0,
  };
  return buildFileBuffer('image/jpeg', env);
}

describe('content detection by magic bytes (AC-FUP-002)', () => {
  it('detects a real JPEG/PNG/HEIC/PDF by its leading bytes', () => {
    expect(detectContentType(buildFileBuffer('image/jpeg', envOf()))).toBe('image/jpeg');
    expect(detectContentType(buildFileBuffer('image/png', envOf()))).toBe('image/png');
    expect(detectContentType(buildFileBuffer('image/heic', envOf()))).toBe('image/heic');
    expect(detectContentType(buildFileBuffer('application/pdf', envOf()))).toBe('application/pdf');
  });

  it('detects an MP4 as video even when it carries an ftyp box (renamed .jpg attack)', () => {
    const mp4 = buildFileBuffer('video/mp4', envOf());
    // The name/extension is irrelevant — the content is video.
    expect(detectContentType(mp4)).toBe('video/mp4');
  });

  it('classifies an unrecognised buffer as unknown', () => {
    expect(detectContentType(Buffer.from('not a real file', 'ascii'))).toBe('unknown');
  });

  function envOf(): FileEnvelope {
    return { width: 10, height: 10, logicalBytes: 100, hasExifGps: false, capturedAt: null, pageCount: 1 };
  }
});

describe('resizeToLongEdge', () => {
  it('scales a 4032×3024 photo to a 1600 px long edge keeping the ratio', () => {
    expect(resizeToLongEdge(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('leaves an image already within the cap untouched', () => {
    expect(resizeToLongEdge(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('compressForProfile — device-side stub (AC-FUP-001 / AC-FUP-008)', () => {
  it('a 4.2 MB 4032×3024 photo → 1600×1200 JPEG below 1 MB, EXIF GPS stripped', () => {
    const result = compressForProfile(photo(4032, 3024, 4_200_000, true), FileProfile.Photo);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.storedBytes).toBeLessThan(IMAGE_TARGET_MAX_BYTES);
    expect(result.hasExifGps).toBe(false); // GPS stripped (AC-FUP-001)
    expect(result.capturedAt).toBe('2026-11-11T02:00:00.000Z'); // the only kept EXIF field
    expect(result.outputType).toBe('image/jpeg');
    // The re-encoded output is still a real JPEG + carries no GPS envelope flag.
    expect(detectContentType(result.bytes)).toBe('image/jpeg');
    expect(readEnvelope(result.bytes)?.hasExifGps).toBe(false);
  });

  it('a 14 MB camera photo is driven below 1 MB (AC-FUP-008)', () => {
    const result = compressForProfile(photo(5000, 4000, 14_000_000, true), FileProfile.Photo);
    expect(result.storedBytes).toBeLessThan(IMAGE_TARGET_MAX_BYTES);
    expect(Math.max(result.width, result.height)).toBe(1600);
  });

  it('uses the 2400 px cap for the Document profile', () => {
    const result = compressForProfile(photo(4800, 3600, 6_000_000), FileProfile.Document);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1800);
  });
});

describe('buildThumbnail (AC-FUP-001 / AC-FUP-005)', () => {
  it('makes a 320 px thumbnail for a photo', () => {
    const thumb = buildThumbnail(photo(1600, 1200, 500_000), FileProfile.Photo);
    expect(Math.max(thumb.width, thumb.height)).toBe(THUMBNAIL_LONG_EDGE);
  });

  it('makes a first-page thumbnail for a PDF', () => {
    const pdf = buildFileBuffer('application/pdf', {
      width: 0,
      height: 0,
      logicalBytes: 1_800_000,
      hasExifGps: false,
      capturedAt: null,
      pageCount: 3,
    });
    const thumb = buildThumbnail(pdf, FileProfile.PDF);
    expect(thumb.height).toBe(THUMBNAIL_LONG_EDGE);
    expect(thumb.width).toBeGreaterThan(0);
  });
});
