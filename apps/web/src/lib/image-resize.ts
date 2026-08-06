/**
 * Client-side downscale + re-encode before upload (TASK-026). Runs before every
 * inventory photo upload: bounds the request size for free, and — because the
 * output is drawn onto a fresh canvas and re-encoded — strips all EXIF,
 * including GPS coordinates phone cameras embed by default, which sellers
 * would otherwise leak without knowing. No server-side resizing/thumbnailing
 * exists; this is the only place image size is bounded.
 *
 * `imageOrientation: 'from-image'` makes the decode respect the EXIF rotation
 * tag before it's discarded, so a portrait phone photo doesn't come out
 * sideways once the metadata that would have fixed it is gone.
 */
const MAX_EDGE_PX = 1600
const JPEG_QUALITY = 0.85

export async function resizeImageForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_unsupported')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  } finally {
    bitmap.close()
  }
}
