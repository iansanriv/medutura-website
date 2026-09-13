# Medutura — tienda online

Tienda de piezas de costura hecha para trabajar desde un repositorio privado de GitHub, con:

- Next.js para la tienda y el panel administrativo.
- Supabase para productos, órdenes, inventario, usuarios y fotos.
- Vercel para publicación automática desde GitHub.
- Stripe, PayPal y ATH Móvil.
- Confirmaciones opcionales por email mediante Resend.

## 1. Requisitos

- Node.js 22.13 o más reciente.
- Una cuenta de GitHub.
- Un proyecto de Supabase.
- Una cuenta de Vercel.
- pnpm 11.

```powershell
corepack enable
corepack prepare pnpm@11.25.0 --activate
```

## 2. Preparar el proyecto localmente

Descomprime el ZIP y abre en VS Code la carpeta que contiene `package.json`.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
```

Nunca subas `.env.local` a GitHub.

## 3. Crear la base en Supabase

1. Crea un proyecto nuevo en Supabase.
2. Abre **SQL Editor**.
3. Copia todo el contenido de `supabase/migrations/0001_medutura.sql`.
4. Ejecútalo una sola vez.

La migración crea:

- `products`
- `orders`
- `order_items`
- `admins`
- funciones seguras para reservar y devolver inventario
- el bucket privado `product-images`

## 4. Crear la administradora

En Supabase entra a **Authentication → Users → Add user** y crea la cuenta de la dueña con su correo y contraseña.

En `.env.local`, coloca ese mismo correo en `ADMIN_EMAILS`. Puedes autorizar más de uno separándolos por coma:

```env
ADMIN_EMAILS=ian@example.com,duena@example.com
```

El panel está en `/admin`. Una persona puede iniciar sesión en Supabase, pero la API solamente le permitirá administrar la tienda si su correo está en `ADMIN_EMAILS` o en la tabla `admins`.

## 5. Copiar las credenciales de Supabase

En **Project Settings → API**, copia los valores correspondientes:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

La `service role key` es privada. Solamente debe estar en `.env.local` y en las variables protegidas de Vercel.

## 6. Probar localmente

```powershell
pnpm dev
```

Abre:

- Tienda: `http://localhost:3000`
- Administración: `http://localhost:3000/admin`

Desde `/admin` puedes añadir fotos, precios, categorías, inventario y productos destacados. Las fotos permitidas son JPG, PNG o WebP de hasta 8 MB.

Para confirmar que la versión de producción compila:

```powershell
pnpm build
pnpm start
```

## 7. Subir a GitHub

1. Crea un repositorio privado, por ejemplo `medutura-store`.
2. No marques la opción de añadir otro README.
3. Desde la carpeta del proyecto ejecuta:

```powershell
git init
git add .
git commit -m "Initial Medutura store"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/medutura-store.git
git push -u origin main
```

Antes de `git add .`, confirma que `.env.local` no aparece:

```powershell
git status
```

## 8. Publicar con Vercel

1. En Vercel selecciona **Add New → Project**.
2. Importa `medutura-store` desde GitHub.
3. Vercel detectará Next.js automáticamente.
4. Añade todas las variables necesarias desde `.env.local` en **Environment Variables**.
5. Pulsa **Deploy**.

Cada `git push` futuro publicará la nueva versión automáticamente.

## 9. Stripe

Añade primero claves de prueba:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

En Stripe crea un webhook dirigido a:

```text
https://TU_DOMINIO/api/webhooks/stripe
```

Eventos requeridos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Cuando termines las pruebas, cambia a las claves live correspondientes.

## 10. PayPal

Para pruebas:

```env
PAYPAL_CLIENT_ID=TU_CLIENT_ID_SANDBOX
PAYPAL_CLIENT_SECRET=TU_CLIENT_SECRET_SANDBOX
PAYPAL_ENVIRONMENT=sandbox
```

Cuando la cuenta comercial esté lista, usa las credenciales live y cambia:

```env
PAYPAL_ENVIRONMENT=live
```

## 11. ATH Móvil

```env
ATH_MOVIL_BUSINESS=/usuario-del-negocio
```

ATH Móvil funciona como pago manual: la clienta recibe el usuario y su número de orden. La dueña confirma el pago desde `/admin`.

## 12. Entrega e impuesto

La entrega se cotiza y se cobra por separado según la ubicación de la clienta. El checkout cobra los productos y el impuesto configurado; el recogido se coordina en el Área Metro.

La tasa de impuesto se expresa como decimal:

```env
SALES_TAX_RATE=0
```

Ejemplo: `0.115` representa 11.5%. Confirma las obligaciones fiscales antes de cambiar este valor.

## 13. Emails opcionales

Para enviar confirmaciones con Resend:

```env
RESEND_API_KEY=re_...
FROM_EMAIL=Medutura <orders@tudominio.com>
ORDER_NOTIFICATION_EMAIL=correo-del-negocio@example.com
```

El dominio del remitente debe estar verificado. Si estas variables se quedan vacías, las órdenes y pagos siguen funcionando, pero no se envían emails automáticos.

## Flujo del inventario

- La base verifica el precio y el inventario; no confía en el total enviado por el navegador.
- Al crear una orden, Supabase reserva las unidades dentro de una transacción.
- Si una sesión de Stripe expira o falla, el inventario se devuelve.
- Cuando Stripe o PayPal confirman el pago, la orden cambia a `paid`.
- Una orden ATH permanece pendiente hasta que la dueña confirme el pago.
- Cancelar una orden pendiente desde `/admin` devuelve el inventario.

## Seguridad

- No pongas claves privadas en archivos públicos ni en GitHub.
- Mantén el repositorio privado.
- Usa primero Stripe Test y PayPal Sandbox.
- No uses `SUPABASE_SERVICE_ROLE_KEY` en componentes del navegador.
- Cambia las contraseñas y claves inmediatamente si alguna aparece accidentalmente en un commit.
