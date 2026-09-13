import { env } from "cloudflare:workers";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!env.BUCKET) return new Response("Imagen no disponible", { status: 404 });
  const object = await env.BUCKET.get(decodeURIComponent(key));
  if (!object) return new Response("Imagen no encontrada", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(object.body, { headers });
}

