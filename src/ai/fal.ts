// fal.ai nano-banana-2/edit client (BYOK). Used to retexture a known-layout
// "action template" sprite sheet with a new character: pass [templateSheet,
// characterReference] and the model repaints the character into every pose
// while preserving the sheet layout. One call yields a fully consistent sheet.
export type FalResolution = '0.5K' | '1K' | '2K' | '4K';

export interface FalEditOptions {
  falKey: string;
  resolution?: FalResolution;
  outputFormat?: 'png' | 'jpeg' | 'webp';
  seed?: number;
  fetchImpl?: typeof fetch;
  /** Poll status callback: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'. */
  onStatus?: (status: string) => void;
  /** Abort polling/requests. */
  signal?: AbortSignal;
  /** Override the endpoint base (tests). */
  baseUrl?: string;
}

interface SubmitResponse {
  request_id: string;
  status_url?: string;
  response_url?: string;
}
interface StatusResponse {
  status: string;
}
interface EditResult {
  images?: { url: string; width?: number; height?: number; content_type?: string }[];
  description?: string;
}

const ENDPOINT = 'fal-ai/nano-banana-2/edit';

async function blobToDataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return `data:${blob.type || 'image/png'};base64,${base64}`;
}

async function toImageUrl(img: Blob | string): Promise<string> {
  return typeof img === 'string' ? img : blobToDataUri(img);
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });

/**
 * Run nano-banana-2/edit on `images` (Blobs are inlined as base64 data URIs;
 * strings are passed through as URLs). Submits to the queue, polls to
 * completion, and returns the first output image as a Blob.
 */
export async function falEdit(
  images: (Blob | string)[],
  prompt: string,
  options: FalEditOptions,
): Promise<Blob> {
  const doFetch = (options.fetchImpl ?? fetch).bind(globalThis);
  const base = options.baseUrl ?? 'https://queue.fal.run';
  const headers = {
    Authorization: `Key ${options.falKey}`,
    'Content-Type': 'application/json',
  };

  const image_urls = await Promise.all(images.map(toImageUrl));

  const submitRes = await doFetch(`${base}/${ENDPOINT}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      image_urls,
      resolution: options.resolution ?? '2K',
      output_format: options.outputFormat ?? 'png',
      num_images: 1,
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
    }),
    signal: options.signal,
  });
  if (!submitRes.ok) {
    throw new Error(`fal submit failed (${submitRes.status}): ${await submitRes.text()}`);
  }
  const submit = (await submitRes.json()) as SubmitResponse;
  const statusUrl = submit.status_url ?? `${base}/${ENDPOINT}/requests/${submit.request_id}/status`;
  const resultUrl = submit.response_url ?? `${base}/${ENDPOINT}/requests/${submit.request_id}`;

  // Poll to completion.
  for (;;) {
    const sRes = await doFetch(statusUrl, { headers, signal: options.signal });
    if (!sRes.ok) throw new Error(`fal status failed (${sRes.status}): ${await sRes.text()}`);
    const { status } = (await sRes.json()) as StatusResponse;
    options.onStatus?.(status);
    if (status === 'COMPLETED') break;
    if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') {
      throw new Error(`fal returned unexpected status: ${status}`);
    }
    await sleep(1500, options.signal);
  }

  const rRes = await doFetch(resultUrl, { headers, signal: options.signal });
  if (!rRes.ok) throw new Error(`fal result fetch failed (${rRes.status}): ${await rRes.text()}`);
  const result = (await rRes.json()) as EditResult;
  const url = result.images?.[0]?.url;
  if (!url) throw new Error('fal returned no output image');

  const imgRes = await doFetch(url, { signal: options.signal });
  if (!imgRes.ok) throw new Error(`fetching fal output image failed (${imgRes.status})`);
  return imgRes.blob();
}
