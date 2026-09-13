import { env } from "cloudflare:workers";
import { dbBinding } from "@/components/lib/server";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  const origin = new URL(request.url).origin;
  if (!sessionId || !env.STRIPE_SECRET_KEY) return Response.redirect(`${origin}/?pago=error`, 303);
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const session = await response.json() as { payment_status?: string; metadata?: { order_id?: string; order_number?: string } };
  if (response.ok && session.payment_status === "paid" && session.metadata?.order_id) {
    const db = dbBinding();
    await db.prepare("UPDATE orders SET payment_status = 'paid', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), Number(session.metadata.order_id)).run();
    const order = await db.prepare("SELECT order_number AS orderNumber FROM orders WHERE id = ?").bind(Number(session.metadata.order_id)).first<{ orderNumber: string }>();
    return Response.redirect(`${origin}/gracias?orden=${encodeURIComponent(order?.orderNumber || session.metadata.order_number || "")}`, 303);
  }
  return Response.redirect(`${origin}/?pago=pendiente`, 303);
}

