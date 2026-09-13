export type Product = {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceCents: number;
  inventory: number;
  active: boolean;
  featured: boolean;
  imageKey: string | null;
  imageUrl: string | null;
  demo?: boolean;
};

export type CartItem = Product & { quantity: number };

export type StoreOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethod: string;
  paymentMethod: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalCents: number;
  createdAt: string;
};

