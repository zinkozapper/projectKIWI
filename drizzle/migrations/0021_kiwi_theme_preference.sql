-- Save dark mode and color scheme on the account so they follow the user to every device.
-- NULL means the user hasn't chosen yet; the app then keeps whatever this browser has saved and uploads it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme text CHECK (theme IS NULL OR theme IN ('light','dark')),
  ADD COLUMN IF NOT EXISTS color_scheme text CHECK (color_scheme IS NULL OR color_scheme IN ('green','neutral','ocean','sunset'));
