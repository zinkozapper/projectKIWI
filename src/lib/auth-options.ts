// Google sign-in needs a Google Cloud OAuth client set up in Supabase (Authentication → Providers).
// The button stays hidden unless the build sets VITE_GOOGLE_SIGN_IN=true (in .env locally;
// deploy.yml sets it for the live site).
export const googleSignInEnabled = import.meta.env['VITE_GOOGLE_SIGN_IN'] === 'true';
