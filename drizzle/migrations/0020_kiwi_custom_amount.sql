-- Custom amounts on list rows ("3 lb", "1.5 cups"): price and servings scale from the row's food_package_id.
ALTER TABLE public.shopping_list_item
  ADD COLUMN IF NOT EXISTS custom_amount numeric CHECK (custom_amount IS NULL OR custom_amount > 0),
  ADD COLUMN IF NOT EXISTS custom_unit text CHECK (custom_unit IS NULL OR custom_unit IN ('oz','lb','g','kg','fl oz','cup','ml','l','ct')),
  ADD CONSTRAINT shopping_list_item_custom_pair CHECK ((custom_amount IS NULL) = (custom_unit IS NULL));
