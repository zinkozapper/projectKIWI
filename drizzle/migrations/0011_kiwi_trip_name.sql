ALTER TABLE public.shopping_list ADD COLUMN name text CHECK (char_length(name) <= 100);
