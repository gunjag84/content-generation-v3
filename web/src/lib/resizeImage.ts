// Resize an image File to maxWidth (preserving aspect ratio) using a canvas.
// Returns the original File as a Blob if it's already narrower than maxWidth.
export async function resizeToMaxWidth(file: File, maxWidth: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width <= maxWidth) {
    bitmap.close();
    return file;
  }
  const ratio = bitmap.height / bitmap.width;
  const targetW = maxWidth;
  const targetH = Math.round(maxWidth * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      0.9,
    );
  });
}
