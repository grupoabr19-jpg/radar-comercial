const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const MAX_VISIT_PHOTO_BYTES = 5 * 1024 * 1024;
export const VISIT_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function detectVisitPhotoContentType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
