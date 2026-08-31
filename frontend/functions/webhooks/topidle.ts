const TOP_IDLE_BACKEND_WEBHOOK =
  'https://deadidle-api.botpokeidle.com.br/webhooks/topidle';

const FORWARDED_HEADERS = [
  'content-type',
  'x-topidle-timestamp',
  'x-topidle-signature',
  'x-topidle-vote-id',
  'idempotency-key',
] as const;

type PagesFunctionContext = {
  request: Request;
};

export async function onRequestPost({ request }: PagesFunctionContext) {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(TOP_IDLE_BACKEND_WEBHOOK, {
    method: 'POST',
    headers,
    body: await request.arrayBuffer(),
    redirect: 'manual',
  });

  return new Response(null, {
    status: upstream.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
