import { sendOrderConfirmation } from "@/lib/order-email";
import { supabaseRequest, supabaseRpc } from "@/lib/supabase-server";

type CheckoutBody = {
  cart?: Array<{ productId: number; quantity: number }>;
  customer?: Record<string, string>;
};

type CreatedOrder = {
  id: string;
  order_number: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  items: Array<{ product_id: number; name: string; quantity: number; unit_price_cents: number }>;
};

async function paypalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal todavía no está activado.");
  const base = process.env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("No pudimos conectar con PayPal.");
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("PayPal no devolvió una sesión válida.");
  return { token: data.access_token, base };
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function POST(request: Request) {
  let createdOrder: CreatedOrder | null = null;
  try {
    const body = await request.json() as CheckoutBody;
    const cart = body.cart || [];
    const customer = body.customer || {};
    const paymentMethod = String(customer.paymentMethod || "");
    const deliveryMethod = String(customer.deliveryMethod || "shipping");

    if (!cart.length || !["card", "paypal", "ath"].includes(paymentMethod)) {
      return Response.json({ error: "El carrito o método de pago no es válido." }, { status: 400 });
    }
    if (!String(customer.name || "").trim() || !String(customer.email || "").includes("@") || !String(customer.phone || "").trim()) {
      return Response.json({ error: "Completa tu información de contacto." }, { status: 400 });
    }
    if (deliveryMethod === "shipping" && !String(customer.address || "").trim()) {
      return Response.json({ error: "Añade la dirección para el envío." }, { status: 400 });
    }
    if (paymentMethod === "card" && !process.env.STRIPE_SECRET_KEY) {
      return Response.json({ error: "El pago con tarjeta todavía no está activado." }, { status: 503 });
    }
    if (paymentMethod === "paypal" && (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)) {
      return Response.json({ error: "PayPal todavía no está activado." }, { status: 503 });
    }
    if (paymentMethod === "ath" && !process.env.ATH_MOVIL_BUSINESS) {
      return Response.json({ error: "ATH Móvil todavía no está activado." }, { status: 503 });
    }

    const normalizedItems = cart.map((item) => ({
      product_id: Number(item.productId),
      quantity: Math.floor(Number(item.quantity)),
    }));
    if (normalizedItems.some((item) => !Number.isInteger(item.product_id) || item.product_id < 1 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) {
      return Response.json({ error: "Hay un producto o cantidad inválida en el carrito." }, { status: 400 });
    }

    // Delivery is quoted after the order based on the customer's location.
    // Online checkout charges the products only; pickup is available in the Metro Area.
    const shippingCents = 0;
    const configuredTaxRate = Number(process.env.SALES_TAX_RATE || 0);
    const taxRate = Number.isFinite(configuredTaxRate) ? Math.max(0, Math.min(1, configuredTaxRate)) : 0;
    createdOrder = await supabaseRpc<CreatedOrder>("create_store_order", {
      p_customer_name: String(customer.name).trim(),
      p_customer_email: String(customer.email).trim().toLowerCase(),
      p_customer_phone: String(customer.phone).trim(),
      p_delivery_method: deliveryMethod,
      p_address: String(customer.address || "").trim(),
      p_payment_method: paymentMethod,
      p_notes: String(customer.notes || "").trim(),
      p_items: normalizedItems,
      p_shipping_cents: shippingCents,
      p_tax_rate: taxRate,
    });

    const origin = new URL(request.url).origin;

    if (paymentMethod === "card") {
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("success_url", `${origin}/api/payments/stripe/confirm?session_id={CHECKOUT_SESSION_ID}`);
      form.set("cancel_url", `${origin}/?pago=cancelado`);
      form.set("customer_email", String(customer.email));
      form.set("metadata[order_id]", createdOrder.id);
      form.set("metadata[order_number]", createdOrder.order_number);
      form.set("expires_at", String(Math.floor(Date.now() / 1000) + 31 * 60));
      form.set("phone_number_collection[enabled]", "true");

      let lineIndex = 0;
      for (const item of createdOrder.items) {
        form.set(`line_items[${lineIndex}][price_data][currency]`, "usd");
        form.set(`line_items[${lineIndex}][price_data][unit_amount]`, String(item.unit_price_cents));
        form.set(`line_items[${lineIndex}][price_data][product_data][name]`, item.name);
        form.set(`line_items[${lineIndex}][quantity]`, String(item.quantity));
        lineIndex += 1;
      }
      for (const extra of [
        { name: "Envío", amount: createdOrder.shipping_cents },
        { name: "Impuesto", amount: createdOrder.tax_cents },
      ]) {
        if (extra.amount > 0) {
          form.set(`line_items[${lineIndex}][price_data][currency]`, "usd");
          form.set(`line_items[${lineIndex}][price_data][unit_amount]`, String(extra.amount));
          form.set(`line_items[${lineIndex}][price_data][product_data][name]`, extra.name);
          form.set(`line_items[${lineIndex}][quantity]`, "1");
          lineIndex += 1;
        }
      }

      const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const data = await stripe.json() as { id?: string; url?: string; error?: { message?: string } };
      if (!stripe.ok || !data.id || !data.url) throw new Error(data.error?.message || "No pudimos iniciar el pago con tarjeta.");
      await supabaseRequest(`/rest/v1/orders?id=eq.${createdOrder.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { processor_reference: data.id, updated_at: new Date().toISOString() },
      });
      return Response.json({ url: data.url, orderNumber: createdOrder.order_number });
    }

    if (paymentMethod === "paypal") {
      const { token, base } = await paypalAccessToken();
      const breakdown: Record<string, { currency_code: string; value: string }> = {
        item_total: { currency_code: "USD", value: money(createdOrder.subtotal_cents) },
      };
      if (createdOrder.shipping_cents > 0) breakdown.shipping = { currency_code: "USD", value: money(createdOrder.shipping_cents) };
      if (createdOrder.tax_cents > 0) breakdown.tax_total = { currency_code: "USD", value: money(createdOrder.tax_cents) };

      const paypal = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: createdOrder.order_number,
            custom_id: createdOrder.id,
            amount: { currency_code: "USD", value: money(createdOrder.total_cents), breakdown },
            items: createdOrder.items.map((item) => ({
              name: item.name,
              quantity: String(item.quantity),
              unit_amount: { currency_code: "USD", value: money(item.unit_price_cents) },
            })),
          }],
          payment_source: { paypal: { experience_context: {
            brand_name: "Medutura",
            locale: "es-PR",
            user_action: "PAY_NOW",
            return_url: `${origin}/api/payments/paypal/capture`,
            cancel_url: `${origin}/?pago=cancelado`,
          } } },
        }),
      });
      const data = await paypal.json() as { id?: string; links?: Array<{ rel: string; href: string }>; message?: string };
      const approve = data.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
      if (!paypal.ok || !data.id || !approve) throw new Error(data.message || "No pudimos iniciar PayPal.");
      await supabaseRequest(`/rest/v1/orders?id=eq.${createdOrder.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { processor_reference: data.id, updated_at: new Date().toISOString() },
      });
      return Response.json({ url: approve, orderNumber: createdOrder.order_number });
    }

    await sendOrderConfirmation(createdOrder.id).catch(() => undefined);
    return Response.json({
      url: `${origin}/gracias?orden=${encodeURIComponent(createdOrder.order_number)}&ath=${encodeURIComponent(process.env.ATH_MOVIL_BUSINESS || "")}`,
      orderNumber: createdOrder.order_number,
    });
  } catch (error) {
    if (createdOrder?.id) {
      await supabaseRpc("cancel_store_order", { p_order_id: createdOrder.id }).catch(() => undefined);
    }
    return Response.json({ error: error instanceof Error ? error.message : "No pudimos procesar la orden." }, { status: 500 });
  }
}
