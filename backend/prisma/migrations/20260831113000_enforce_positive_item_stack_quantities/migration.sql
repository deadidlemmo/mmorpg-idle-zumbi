ALTER TABLE "inventory_items"
ADD CONSTRAINT "inventory_items_quantity_positive"
CHECK ("quantity" > 0);

ALTER TABLE "bank_items"
ADD CONSTRAINT "bank_items_quantity_positive"
CHECK ("quantity" > 0);
