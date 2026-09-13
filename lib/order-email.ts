import { supabaseRequest } from "@/lib/supabase-server";

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_method: string;
  address: string | null;
  payment_method: string;
  payment_status: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  confirmation_sent_at: string | null;
};

type ItemRow = {
  product_name: string;
  quantity: number;
  unit_price_cents: number;
};

const money = (cents: number) => new Intl.NumberFormat("es-PR", { style: "currency", currency: "USD" }).format(cents / 100);

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

export async function sendOrderConfirmation(orderId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "email_not_configured" };

  const [orders, items] = await Promise.all([
    supabaseRequest<OrderRow[]>(`/rest/v1/orders?select=id,order_number,customer_name,customer_email,customer_phone,delivery_method,address,payment_method,payment_status,subtotal_cents,shipping_cents,tax_cents,total_cents,confirmation_sent_at&id=eq.${encodeURIComponent(orderId)}&limit=1`),
    supabaseRequest<ItemRow[]>(`/rest/v1/order_items?select=product_name,quantity,unit_price_cents&order_id=eq.${encodeURIComponent(orderId)}&order=id.asc`),
  ]);
  const order = orders[0];
  if (!order || order.confirmation_sent_at) return { sent: false, reason: "already_sent_or_missing" };

  const paid = order.payment_status === "paid";
  const ath = order.payment_method === "ath";
  const itemRows = items.map((item) => `<tr><td style="padding:8px 0;color:#334155">${escapeHtml(item.product_name)} × ${item.quantity}</td><td style="padding:8px 0;text-align:right;font-weight:700">${money(item.unit_price_cents * item.quantity)}</td></tr>`).join("");
  const athInstructions = ath
    ? `<div style="margin:24px 0;padding:18px;border-radius:16px;background:#dffafa"><strong style="color:#0f6f74">Pago por ATH Móvil</strong><p style="margin:8px 0 0;color:#334155">Envía ${money(order.total_cents)} a <strong>${escapeHtml(process.env.ATH_MOVIL_BUSINESS || "Medutura")}</strong> e incluye ${escapeHtml(order.order_number)} en el mensaje.</p></div>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f3fbfb;font-family:Arial,sans-serif;color:#111827"><div style="max-width:620px;margin:0 auto;padding:32px 16px"><div style="background:#fff;border-radius:24px;padding:32px"><p style="margin:0;color:#168a91;font-weight:800;letter-spacing:.12em">MEDUTURA</p><h1 style="margin:12px 0 8px;font-size:30px">${paid ? "¡Pago confirmado!" : "Recibimos tu orden"}</h1><p style="color:#475569;line-height:1.6">Hola ${escapeHtml(order.customer_name)}, tu orden <strong>${escapeHtml(order.order_number)}</strong> quedó registrada.</p>${athInstructions}<table style="width:100%;border-collapse:collapse;margin-top:20px">${itemRows}<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0;font-weight:800">Total de productos</td><td style="padding:12px 0;border-top:1px solid #e2e8f0;text-align:right;font-size:20px;font-weight:900">${money(order.total_cents)}</td></tr></table><p style="margin-top:24px;color:#64748b;line-height:1.6">${order.delivery_method === "pickup" ? "Coordinaremos contigo el recogido en el Área Metro de Puerto Rico." : `Ubicación de entrega: ${escapeHtml(order.address || "Por confirmar")}. Te informaremos el costo de entrega, que se cobra por separado.`}</p><p style="margin-top:28px;color:#0f6f74;font-weight:700">Medutura · @medutura</p></div></div></body></html>`;

  const notificationEmail = process.env.ORDER_NOTIFICATION_EMAIL?.trim();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [order.customer_email],
      ...(notificationEmail ? { bcc: [notificationEmail] } : {}),
      subject: `${paid ? "Pago confirmado" : "Orden recibida"}: ${order.order_number}`,
      html,
    }),
  });
  if (!response.ok) throw new Error("No se pudo enviar la confirmación de la orden.");

  await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&confirmation_sent_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { confirmation_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  });
  return { sent: true };
}
