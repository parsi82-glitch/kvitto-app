// Förminskar foton innan de sparas: ett mobilfoto på 3–5 MB blir ca 200–400 kB,
// fortfarande fullt läsbart. Det sparar lagringsutrymme (viktigt i fas 2).

const MAX_SIDE = 1600;
const QUALITY = 0.8;

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* faller tillbaka till <img> nedan */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file) {
  const source = await decode(file);
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  // JPEG används alltid när det går (t.ex. iPhones HEIC-bilder kan inte visas överallt).
  // Om komprimeringen misslyckas sparas originalet hellre än ingenting.
  return blob || file;
}
