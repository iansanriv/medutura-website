"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera as Instagram, Menu, Minus, Plus, ShoppingBag, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import type { CartItem, Product } from "@/components/lib/types";

const demoProducts: Product[] = [
  { id: -1, name: "Diadema Isla", slug: "diadema-isla", description: "Cómoda, liviana y hecha a mano.", category: "Cabello", priceCents: 2400, inventory: 1, active: true, featured: true, imageKey: null, imageUrl: "/catalogo-muestra.png#top-left", demo: true },
  { id: -2, name: "Mini Bag Vino", slug: "mini-bag-vino", description: "Acolchada con detalles dorados.", category: "Carteras", priceCents: 4200, inventory: 1, active: true, featured: true, imageKey: null, imageUrl: "/catalogo-muestra.png#top-right", demo: true },
  { id: -3, name: "Cosmetiquera Caribe", slug: "cosmetiquera-caribe", description: "Espaciosa, fuerte y fácil de limpiar.", category: "Bolsos", priceCents: 2800, inventory: 1, active: true, featured: false, imageKey: null, imageUrl: "/catalogo-muestra.png#bottom-left", demo: true },
  { id: -4, name: "Scrunchies Dúo", slug: "scrunchies-duo", description: "Suaves con el cabello y con mucho flow.", category: "Cabello", priceCents: 1600, inventory: 1, active: true, featured: false, imageKey: null, imageUrl: "/catalogo-muestra.png#bottom-right", demo: true },
];

const money = (cents: number) => new Intl.NumberFormat("es-PR", { style: "currency", currency: "USD" }).format(cents / 100);

function productPosition(url: string | null) {
  const part = url?.split("#")[1];
  if (part === "top-left") return "22% 18%";
  if (part === "top-right") return "78% 18%";
  if (part === "bottom-left") return "22% 82%";
  if (part === "bottom-right") return "78% 82%";
  return "center";
}

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [usingDemo, setUsingDemo] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("Todo");
  const [deliveryMethod, setDeliveryMethod] = useState("shipping");
  const [storeConfig, setStoreConfig] = useState({ shippingFlatRateCents: 0, salesTaxRate: 0 });

  useEffect(() => {
    fetch("/api/products")
      .then((response) => response.ok ? response.json() : [])
      .then((data: Product[]) => {
        if (data.length) {
          setProducts(data);
          setUsingDemo(false);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/store-config")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setStoreConfig(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool || usingDemo) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "add_medutura_product_to_cart",
      title: "Añadir producto al carrito",
      description: "Añade una cantidad disponible de un producto de Medutura al carrito visible.",
      inputSchema: { type: "object", properties: { productId: { type: "number" }, quantity: { type: "number", minimum: 1, maximum: 20 } }, required: ["productId", "quantity"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { productId?: number; quantity?: number };
        const product = products.find((item) => item.id === value.productId);
        if (!product || !Number.isInteger(value.quantity) || value.quantity! < 1 || value.quantity! > product.inventory) throw new Error("Producto o cantidad no disponible.");
        setCart((current) => {
          const existing = current.find((item) => item.id === product.id);
          return existing ? current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(product.inventory, item.quantity + value.quantity!) } : item) : [...current, { ...product, quantity: value.quantity! }];
        });
        return { productId: product.id, productName: product.name, quantity: value.quantity };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [products, usingDemo]);

  const categories = useMemo(() => ["Todo", ...Array.from(new Set(products.map((item) => item.category)))], [products]);
  const visible = category === "Todo" ? products : products.filter((item) => item.category === category);
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.priceCents * item.quantity, 0);
  const shipping = deliveryMethod === "shipping" ? storeConfig.shippingFlatRateCents : 0;
  const tax = Math.round(subtotal * storeConfig.salesTaxRate);
  const total = subtotal + shipping + tax;

  function add(product: Product) {
    if (product.demo) {
      toast.info("Esta pieza es una muestra visual. Los productos reales se añaden desde el panel.");
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) return current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(product.inventory, item.quantity + 1) } : item);
      return [...current, { ...product, quantity: 1 }];
    });
    toast.success(`${product.name} se añadió al carrito.`);
  }

  function changeQuantity(id: number, difference: number) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, Math.min(item.inventory, item.quantity + difference)) } : item).filter((item) => item.quantity > 0));
  }

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = { cart: cart.map((item) => ({ productId: item.id, quantity: item.quantity })), customer: Object.fromEntries(form.entries()) };
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos procesar la orden.");
      if (data.url) window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos procesar la orden.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbffff] text-[#111827]">
      <Toaster position="top-center" richColors />
      <div className="bg-[#111827] px-4 py-2 text-center text-sm font-medium text-white">Hecho a mano en Puerto Rico · Cada pieza tiene su propia historia</div>
      <header className="sticky top-0 z-40 border-b border-black/8 bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex items-center gap-3" aria-label="Medutura, inicio"><img src="/medutura-symbol-v3.png" alt="" className="h-16 w-16 object-contain" /><span className="brand-word text-2xl font-black tracking-tight">MEDUTURA</span></a>
          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex" aria-label="Navegación principal"><a className="hover:text-[#25aeb5]" href="#coleccion">Colección</a><a className="hover:text-[#25aeb5]" href="#historia">Nuestra historia</a><a className="hover:text-[#25aeb5]" href="https://www.instagram.com/medutura/" target="_blank" rel="noreferrer">Instagram</a></nav>
          <div className="flex items-center gap-2"><Button asChild variant="ghost" size="icon" className="md:hidden" aria-label="Ver Instagram"><a href="https://www.instagram.com/medutura/" target="_blank" rel="noreferrer"><Menu /></a></Button>
            <Sheet open={cartOpen} onOpenChange={setCartOpen}><SheetTrigger asChild><Button className="relative h-11 rounded-full bg-[#111827] px-4 text-white hover:bg-[#25aeb5]" aria-label={`Carrito con ${count} artículos`}><ShoppingBag /> <span className="hidden sm:inline">Carrito</span>{count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#80e3e0] px-1 text-xs font-bold text-[#111827]">{count}</span>}</Button></SheetTrigger><SheetContent className="w-full border-l-black/10 bg-white sm:max-w-md"><SheetHeader className="border-b border-black/8 p-6"><SheetTitle className="brand-word text-2xl">Tu carrito</SheetTitle><SheetDescription>Revisa tus piezas antes de pagar.</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto px-6">{!cart.length ? <div className="grid h-full place-items-center py-16 text-center"><div><ShoppingBag className="mx-auto mb-4 h-10 w-10 text-[#25aeb5]" /><p className="font-semibold">Tu carrito está vacío.</p><p className="mt-1 text-sm text-slate-500">Date una vueltita por la colección.</p></div></div> : <div className="divide-y divide-black/8">{cart.map((item) => <div key={item.id} className="flex gap-4 py-5"><div className="h-24 w-20 overflow-hidden rounded-xl bg-[#dffafa]"><img src={item.imageUrl || "/catalogo-muestra.png"} alt="" className="h-full w-full object-cover" /></div><div className="min-w-0 flex-1"><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-sm font-bold text-[#168a91]">{money(item.priceCents)}</p><div className="mt-3 flex w-fit items-center rounded-full border border-black/10"><button className="p-2" onClick={() => changeQuantity(item.id, -1)} aria-label="Restar uno"><Minus className="h-3.5 w-3.5" /></button><span className="w-7 text-center text-sm font-bold">{item.quantity}</span><button className="p-2" onClick={() => changeQuantity(item.id, 1)} aria-label="Sumar uno"><Plus className="h-3.5 w-3.5" /></button></div></div></div>)}</div>}</div><SheetFooter className="border-t border-black/8 p-6"><div className="mb-2 flex justify-between text-lg font-bold"><span>Subtotal</span><span>{money(subtotal)}</span></div><p className="mb-3 text-xs text-slate-500">Envío o recogido se coordina al completar la orden.</p><Button disabled={!cart.length} onClick={() => { setCartOpen(false); setCheckoutOpen(true); }} className="h-12 rounded-full bg-[#111827] text-base hover:bg-[#25aeb5]">Completar orden</Button></SheetFooter></SheetContent></Sheet>
          </div>
        </div>
      </header>

      <section id="inicio" className="relative mx-auto max-w-[1500px] p-3 sm:p-5"><div className="relative min-h-[600px] overflow-hidden rounded-[2rem] bg-[#111827] sm:min-h-[680px]"><img src="/atelier-hero.png" alt="Artesana cosiendo una pieza tropical a mano" className="absolute inset-0 h-full w-full object-cover object-center opacity-80" /><div className="absolute inset-0 bg-gradient-to-r from-[#07151b]/95 via-[#07151b]/58 to-transparent" /><div className="relative flex min-h-[600px] max-w-2xl flex-col justify-center px-7 py-20 text-white sm:min-h-[680px] sm:px-14 lg:px-20"><span className="mb-5 w-fit rounded-full border border-[#80e3e0]/50 bg-[#80e3e0]/12 px-4 py-2 text-sm font-bold text-[#bdf7f3]">Diseñado y cosido en Puerto Rico</span><h1 className="brand-word text-5xl leading-[.93] font-black tracking-[-.04em] sm:text-7xl lg:text-[5.6rem]">Piezas con alma.<br /><span className="text-[#80e3e0]">Hechas pa’ ti.</span></h1><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/82 sm:text-xl">Accesorios y piezas de moda confeccionadas una a una, con telas que tienen personalidad y terminaciones hechas con cariño.</p><div className="mt-8 flex flex-wrap gap-3"><Button asChild className="h-13 rounded-full bg-[#80e3e0] px-7 text-base font-bold text-[#07151b] hover:bg-white"><a href="#coleccion">Ver la colección</a></Button><Button asChild variant="outline" className="h-13 rounded-full border-white/35 bg-white/8 px-7 text-base text-white hover:bg-white hover:text-[#111827]"><a href="https://www.instagram.com/medutura/" target="_blank" rel="noreferrer"><Instagram /> Síguenos</a></Button></div></div></div></section>

      <section id="coleccion" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"><div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-black uppercase tracking-[.2em] text-[#168a91]">Lo más reciente</p><h2 className="brand-word mt-2 text-4xl font-black tracking-tight sm:text-5xl">Encuentra tu pieza</h2></div><div className="flex max-w-full gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition ${category === item ? "bg-[#111827] text-white" : "border border-black/10 bg-white hover:border-[#25aeb5]"}`}>{item}</button>)}</div></div>{usingDemo && <div className="mt-8 rounded-2xl border border-[#25aeb5]/25 bg-[#eafbfb] px-5 py-4 text-sm text-[#0f6f74]"><strong>Vista de muestra:</strong> estas piezas enseñan cómo se verá la colección. Los productos reales se añaden fácilmente desde el panel administrativo.</div>}<div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{visible.map((product) => <article key={product.id} className="group"><div className="relative aspect-[4/5] overflow-hidden rounded-[1.6rem] bg-[#dffafa]"><img src={(product.imageUrl || "/catalogo-muestra.png").split("#")[0]} alt={product.name} className="h-full w-full scale-[2.08] object-cover transition duration-700 group-hover:scale-[2.18]" style={{ objectPosition: productPosition(product.imageUrl) }} />{product.featured && <span className="absolute left-4 top-4 rounded-full bg-white/92 px-3 py-1.5 text-xs font-black uppercase tracking-wider">Favorita</span>}<Button onClick={() => add(product)} className="absolute bottom-4 left-4 right-4 h-11 translate-y-2 rounded-full bg-[#111827] text-white opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 focus:translate-y-0 focus:opacity-100 hover:bg-[#25aeb5]">{product.demo ? "Pieza de muestra" : "Añadir al carrito"}</Button></div><div className="mt-4 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#168a91]">{product.category}</p><h3 className="mt-1 text-lg font-bold">{product.name}</h3><p className="mt-1 text-sm text-slate-500">{product.description}</p></div><span className="shrink-0 font-black">{money(product.priceCents)}</span></div></article>)}</div></section>

      <section id="historia" className="bg-[#111827] text-white"><div className="mx-auto grid max-w-7xl gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28"><div><span className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-[#80e3e0] text-[#111827]"><Sparkles /></span><h2 className="brand-word text-4xl font-black sm:text-6xl">No es producción en masa.<br /><span className="text-[#80e3e0]">Es hecho con intención.</span></h2></div><div className="flex flex-col justify-center"><p className="text-xl leading-relaxed text-white/78">Cada pieza de Medutura nace entre telas, ideas y muchas puntadas. Como se trabaja en cantidades pequeñas, lo que escoges se siente verdaderamente tuyo.</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-white/12 p-5"><Truck className="mb-3 text-[#80e3e0]" /><h3 className="font-bold">Envíos y recogido</h3><p className="mt-1 text-sm text-white/62">Opciones claras para Puerto Rico.</p></div><div className="rounded-2xl border border-white/12 p-5"><ShoppingBag className="mb-3 text-[#80e3e0]" /><h3 className="font-bold">Compra segura</h3><p className="mt-1 text-sm text-white/62">Tarjeta, PayPal y ATH Móvil.</p></div></div></div></div></section>

      <footer className="bg-[#80e3e0]"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8"><div className="flex items-center gap-3"><img src="/medutura-symbol-v3.png" alt="" className="h-14 w-14 object-contain" /><div><div className="brand-word text-xl font-black">MEDUTURA</div><p className="text-sm text-[#0c5c60]">Cosido con cariño en Puerto Rico.</p></div></div><a href="https://www.instagram.com/medutura/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full bg-[#111827] px-5 py-3 text-sm font-bold text-white"><Instagram className="h-4 w-4" /> @medutura</a></div></footer>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-0 p-0 sm:max-w-xl"><DialogHeader className="border-b border-black/8 p-6 text-left"><DialogTitle className="brand-word text-2xl">Completa tu orden</DialogTitle><DialogDescription>Cuéntanos dónde entregarla y cómo prefieres pagar.</DialogDescription></DialogHeader><form onSubmit={checkout} className="space-y-5 p-6"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="name">Nombre completo</Label><Input id="name" name="name" required className="mt-2 h-11" /></div><div><Label htmlFor="phone">Teléfono</Label><Input id="phone" name="phone" required className="mt-2 h-11" /></div></div><div><Label htmlFor="email">Correo electrónico</Label><Input id="email" name="email" type="email" required className="mt-2 h-11" /></div><div><Label>Método de entrega</Label><RadioGroup name="deliveryMethod" value={deliveryMethod} onValueChange={(value) => setDeliveryMethod(value || "shipping")} className="mt-2 grid grid-cols-2 gap-3"><Label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"><RadioGroupItem value="shipping" /> Envío en PR</Label><Label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"><RadioGroupItem value="pickup" /> Recogido</Label></RadioGroup></div><div><Label htmlFor="address">Dirección o pueblo para coordinar</Label><Input id="address" name="address" required={deliveryMethod === "shipping"} className="mt-2 h-11" placeholder="Ej. Caguas, PR" /></div><div><Label>¿Cómo quieres pagar?</Label><RadioGroup name="paymentMethod" defaultValue="card" className="mt-2 space-y-2"><Label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"><RadioGroupItem value="card" /><span><strong>Tarjeta</strong><small className="block text-slate-500">Procesado de forma segura con Stripe</small></span></Label><Label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"><RadioGroupItem value="paypal" /><span><strong>PayPal</strong><small className="block text-slate-500">Paga con tu cuenta o tarjeta</small></span></Label><Label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"><RadioGroupItem value="ath" /><span><strong>ATH Móvil</strong><small className="block text-slate-500">Recibirás las instrucciones de pago</small></span></Label></RadioGroup></div><div><Label htmlFor="notes">Nota para la artesana <span className="font-normal text-slate-400">(opcional)</span></Label><Input id="notes" name="notes" className="mt-2 h-11" placeholder="Color, medida o detalle especial" /></div><div className="space-y-2 border-t pt-5"><div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>{money(subtotal)}</span></div>{deliveryMethod === "shipping" && <div className="flex justify-between text-sm text-slate-600"><span>Envío</span><span>{money(shipping)}</span></div>}{tax > 0 && <div className="flex justify-between text-sm text-slate-600"><span>Impuesto</span><span>{money(tax)}</span></div>}<div className="flex items-center justify-between pt-2 text-lg font-black"><span>Total</span><span>{money(total)}</span></div></div><Button disabled={busy} className="h-12 w-full rounded-full bg-[#111827] text-base hover:bg-[#25aeb5]">{busy ? "Procesando…" : "Ir a pagar"}</Button></form></DialogContent></Dialog>
    </main>
  );
}
