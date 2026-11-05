import limits from './image-limits.json' with { type: 'json' };

const fail = message => Object.assign(new Error(message), { status: 400 });
const signatures = {
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': bytes => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  'image/gif': bytes => ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')),
  'image/webp': bytes => bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
};

export function readInlineImage(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(limits.maxImageBytes / 3) * 4 + 40) throw fail('Each pasted image must be no larger than 4 MiB.');
  const comma = dataUrl.indexOf(',');
  const mimeType = dataUrl.slice(5, comma - 7);
  if (!limits.mimeTypes.includes(mimeType) || dataUrl.slice(0, comma) !== `data:${mimeType};base64`) throw fail('Paste a PNG, JPEG, GIF or WebP image.');
  const data = dataUrl.slice(comma + 1);
  if (!data || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw fail('The pasted image has invalid base64 data.');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > limits.maxImageBytes || bytes.toString('base64') !== data) throw fail('The pasted image is invalid or larger than 4 MiB.');
  if (!signatures[mimeType](bytes)) throw fail('The pasted image format does not match its content.');
  return { dataUrl, mimeType, byteLength: bytes.length };
}

export function validateImages(value = []) {
  if (!Array.isArray(value) || value.length > limits.maxImages) throw fail('Paste up to four images per message.');
  let total = 0;
  return value.map(value => {
    if (!value || typeof value !== 'object') throw fail('The pasted image is invalid.');
    const image = readInlineImage(value.dataUrl);
    total += image.byteLength;
    if (total > limits.maxTotalImageBytes) throw fail('Pasted images must total no more than 8 MiB per message.');
    return image;
  });
}

export function codexImages(content) {
  const images = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (part.type !== 'image') continue;
    try { images.push(readInlineImage(part.url ?? part.image?.url)); } catch { /* Do not fetch remote URLs or read local paths from history. */ }
  }
  return images;
}

export function imageReferences(agentId, message) {
  const { images, ...record } = message;
  return images?.length ? { ...record, images: images.map((image, index) => ({
    url: `/api/agents/${encodeURIComponent(agentId)}/messages/${encodeURIComponent(message.id)}/images/${index}`,
    mimeType: image.mimeType, label: `Image ${index + 1}`
  })) } : record;
}
