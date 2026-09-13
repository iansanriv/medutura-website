import { sendOrderConfirmation } from "@/lib/order-email";
import { supabaseRpc } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  const origin = new URL(request.url).origin;
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return Response.redirect(`${origin}/?pago=error`, 303);

  try {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const session = await response.json() as {
      payment_status?: string;
      metadata?: { order_id?: string; order_number?: string };
    };
    const orderId = session.metadata?.order_id;
    if (!response.ok || session.payment_status !== "paid" || !orderId) {
      return Response.redirect(`${origin}/?pago=pendiente`, 303);
    }

    const marked = await supabaseRpc<boolean>("mark_store_order_paid", {
      p_order_id: orderId,
      p_processor_reference: sessionId,
    });
    if (!marked) return Response.redirect(`${origin}/?pago=error`, 303);
    await sendOrderConfirmation(orderId).catch(() => undefined);
    return Response.redirect(`${origin}/gracias?orden=${encodeURIComponent(session.metadata?.order_number || "")}`, 303);
  } catch {
    return Response.redirect(`${origin}/?pago=error`, 303);
  }
}
