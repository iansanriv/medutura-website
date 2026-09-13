CREATE INDEX `idx_order_items_order_id` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_created_at` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_processor_reference` ON `orders` (`processor_reference`);--> statement-breakpoint
CREATE INDEX `idx_products_active_featured_created` ON `products` (`active`,`featured`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
