import { sendOrderConfirmation } from "@/lib/order-email";
import { supabaseRequest, supabaseRpc } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const origin = url.origin;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!token || !clientId || !clientSecret) return Response.redirect(`${origin}/?pago=error`, 303);

  try {
    const base = process.env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    const auth = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const authData = await auth.json() as { access_token?: string };
    if (!authData.access_token) return Response.redirect(`${origin}/?pago=error`, 303);

    const capture = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(token)}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authData.access_token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await capture.json() as { status?: string };
    const orders = await supabaseRequest<Array<{ id: string; order_number: string }>>(
      `/rest/v1/orders?select=id,order_number&processor_reference=eq.${encodeURIComponent(token)}&limit=1`,
    );
    const order = orders[0];
    if (!capture.ok || data.status !== "COMPLETED" || !order) {
      return Response.redirect(`${origin}/?pago=pendiente`, 303);
    }

    const marked = await supabaseRpc<boolean>("mark_store_order_paid", {
      p_order_id: order.id,
      p_processor_reference: token,
    });
    if (!marked) return Response.redirect(`${origin}/?pago=error`, 303);
    await sendOrderConfirmation(order.id).catch(() => undefined);
    return Response.redirect(`${origin}/gracias?orden=${encodeURIComponent(order.order_number)}`, 303);
  } catch {
    return Response.redirect(`${origin}/?pago=error`, 303);
  }
}
