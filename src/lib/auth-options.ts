// Google sign-in needs a Google Cloud OAuth client set up in Supabase (Authentication → Providers).
// Until that is done the button only leads to the error page, so it stays hidden unless the build
// sets VITE_GOOGLE_SIGN_IN=true (in .env locally, or as a repo secret passed in deploy.yml).
export const googleSignInEnabled = import.meta.env['VITE_GOOGLE_SIGN_IN'] === 'true';
