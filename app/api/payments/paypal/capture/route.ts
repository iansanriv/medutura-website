import { env } from "cloudflare:workers";
import { dbBinding } from "@/components/lib/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const origin = url.origin;
  if (!token || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return Response.redirect(`${origin}/?pago=error`, 303);
  const base = env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const auth = await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const authData = await auth.json() as { access_token?: string };
  if (!authData.access_token) return Response.redirect(`${origin}/?pago=error`, 303);
  const capture = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(token)}/capture`, { method: "POST", headers: { Authorization: `Bearer ${authData.access_token}`, "Content-Type": "application/json" }, body: "{}" });
  const data = await capture.json() as { status?: string };
  const db = dbBinding();
  const order = await db.prepare("SELECT id, order_number AS orderNumber FROM orders WHERE processor_reference = ?").bind(token).first<{ id: number; orderNumber: string }>();
  if (capture.ok && data.status === "COMPLETED" && order) {
    await db.prepare("UPDATE orders SET payment_status = 'paid', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), order.id).run();
    return Response.redirect(`${origin}/gracias?orden=${encodeURIComponent(order.orderNumber)}`, 303);
  }
  return Response.redirect(`${origin}/?pago=pendiente`, 303);
}

