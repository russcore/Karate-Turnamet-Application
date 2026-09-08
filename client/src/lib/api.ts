export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const msg = isJson ? payload?.error || JSON.stringify(payload) : payload || res.statusText;
    throw new ApiError(res.status, msg);
  }
  return payload;
}

export const api = {
  get: (path: string) => fetch(path, { credentials: 'include' }).then(handle),
  post: (path: string, body?: unknown) =>
    fetch(path, {
      method: 'POST',
      credentials: 'include',
      // Only set the JSON content-type when there's a body — Fastify 400s on an
      // empty body when content-type is application/json.
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    }).then(handle),
  put: (path: string, body?: unknown) =>
    fetch(path, {
      method: 'PUT',
      credentials: 'include',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    }).then(handle),
  del: (path: string) => fetch(path, { method: 'DELETE', credentials: 'include' }).then(handle),
  upload: (path: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(path, { method: 'POST', credentials: 'include', body: fd }).then(handle);
  },
};
