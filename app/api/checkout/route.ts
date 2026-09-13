import { env } from "cloudflare:workers";
import { dbBinding } from "@/components/lib/server";

type CheckoutBody = {
  cart?: Array<{ productId: number; quantity: number }>;
  customer?: Record<string, FormDataEntryValue>;
};

type ProductRow = { id: number; name: string; priceCents: number; inventory: number };

function orderNumber() {
  return `MED-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function paypalAccessToken() {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error("PayPal todavía no está activado.");
  const base = env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("No pudimos conectar con PayPal.");
  const data = await response.json() as { access_token: string };
  return { token: data.access_token, base };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CheckoutBody;
    const cart = body.cart || [];
    const customer = body.customer || {};
    const paymentMethod = String(customer.paymentMethod || "");
    if (!cart.length || !["card", "paypal", "ath"].includes(paymentMethod)) return Response.json({ error: "El carrito o método de pago no es válido." }, { status: 400 });
    if (!String(customer.name || "").trim() || !String(customer.email || "").includes("@") || !String(customer.phone || "").trim()) return Response.json({ error: "Completa tu información de contacto." }, { status: 400 });
    if (paymentMethod === "card" && !env.STRIPE_SECRET_KEY) return Response.json({ error: "El pago con tarjeta está listo para conectarse, pero aún falta activar la cuenta de Stripe." }, { status: 503 });
    if (paymentMethod === "paypal" && (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET)) return Response.json({ error: "PayPal está listo para conectarse, pero aún faltan las credenciales del negocio." }, { status: 503 });
    if (paymentMethod === "ath" && !env.ATH_MOVIL_BUSINESS) return Response.json({ error: "ATH Móvil está listo para activarse, pero aún falta el usuario de ATH Móvil Business." }, { status: 503 });

    const db = dbBinding();
    const ids = cart.map((item) => Number(item.productId)).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length !== cart.length) return Response.json({ error: "Hay un producto inválido en el carrito." }, { status: 400 });
    const placeholders = ids.map(() => "?").join(",");
    const result = await db.prepare(`SELECT id, name, price_cents AS priceCents, inventory FROM products WHERE active = 1 AND id IN (${placeholders})`).bind(...ids).all<ProductRow>();
    if ((result.results || []).length !== ids.length) return Response.json({ error: "Una de las piezas ya no está disponible." }, { status: 409 });
    const rows = new Map((result.results || []).map((item) => [item.id, item]));
    const items = cart.map((item) => ({ ...rows.get(item.productId)!, quantity: Math.max(1, Math.floor(item.quantity)) }));
    if (items.some((item) => !item || item.quantity > item.inventory)) return Response.json({ error: "La cantidad seleccionada ya no está disponible." }, { status: 409 });
    const totalCents = items.reduce((total, item) => total + item.priceCents * item.quantity, 0);
    const number = orderNumber();
    const now = new Date().toISOString();
    const insert = await db.prepare(`INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, delivery_method, address, payment_method, total_cents, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(number, String(customer.name).trim(), String(customer.email).trim().toLowerCase(), String(customer.phone).trim(), String(customer.deliveryMethod || "shipping"), String(customer.address || "").trim(), paymentMethod, totalCents, String(customer.notes || "").trim(), now, now).run();
    const orderId = Number(insert.meta.last_row_id);
    await db.batch(items.map((item) => db.prepare("INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)").bind(orderId, item.id, item.name, item.quantity, item.priceCents)));
    const origin = new URL(request.url).origin;

    if (paymentMethod === "card") {
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("success_url", `${origin}/api/payments/stripe/confirm?session_id={CHECKOUT_SESSION_ID}`);
      form.set("cancel_url", `${origin}/?pago=cancelado`);
      form.set("customer_email", String(customer.email));
      form.set("metadata[order_id]", String(orderId));
      form.set("metadata[order_number]", number);
      items.forEach((item, index) => {
        form.set(`line_items[${index}][price_data][currency]`, "usd");
        form.set(`line_items[${index}][price_data][unit_amount]`, String(item.priceCents));
        form.set(`line_items[${index}][price_data][product_data][name]`, item.name);
        form.set(`line_items[${index}][quantity]`, String(item.quantity));
      });
      const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      const data = await stripe.json() as { id?: string; url?: string; error?: { message?: string } };
      if (!stripe.ok || !data.url) throw new Error(data.error?.message || "No pudimos iniciar el pago con tarjeta.");
      await db.prepare("UPDATE orders SET processor_reference = ? WHERE id = ?").bind(data.id, orderId).run();
      return Response.json({ url: data.url });
    }

    if (paymentMethod === "paypal") {
      const { token, base } = await paypalAccessToken();
      const paypal = await fetch(`${base}/v2/checkout/orders`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ reference_id: number, custom_id: String(orderId), amount: { currency_code: "USD", value: (totalCents / 100).toFixed(2), breakdown: { item_total: { currency_code: "USD", value: (totalCents / 100).toFixed(2) } } }, items: items.map((item) => ({ name: item.name, quantity: String(item.quantity), unit_amount: { currency_code: "USD", value: (item.priceCents / 100).toFixed(2) } })) }], payment_source: { paypal: { experience_context: { brand_name: "Medutura", locale: "es-PR", user_action: "PAY_NOW", return_url: `${origin}/api/payments/paypal/capture`, cancel_url: `${origin}/?pago=cancelado` } } } }) });
      const data = await paypal.json() as { id?: string; links?: Array<{ rel: string; href: string }>; message?: string };
      const approve = data.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
      if (!paypal.ok || !data.id || !approve) throw new Error(data.message || "No pudimos iniciar PayPal.");
      await db.prepare("UPDATE orders SET processor_reference = ? WHERE id = ?").bind(data.id, orderId).run();
      return Response.json({ url: approve });
    }

    return Response.json({ url: `${origin}/gracias?orden=${encodeURIComponent(number)}&ath=${encodeURIComponent(env.ATH_MOVIL_BUSINESS || "")}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No pudimos procesar la orden." }, { status: 500 });
  }
}

