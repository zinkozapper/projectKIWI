## Summary
Kiwi is a mobile app to help those who don't have much time know how to eat healthy. The app displays nutrient information of foods you are already eating and gives recommendations on what to eat. It helps users identify nutritional gaps and makes plans to help close those gaps. This app also helps users to shop for healthier foods. It keeps in mind budget concerns while you eat healthier and live happily. 

## ERD
![ERD](./assets/ERD.png)

## Tech Stack
- Frontend: React, TypeScript, Vite
- Application: TanStack Start and TanStack Router
- UI: Tailwind CSS and Radix UI
- Backend, authentication, and database: Supabase

## How to run

```bash
npm install
```

Create a root `.env` file from the example and add your Supabase values:

```bash
cp .env.example .env
```

Start the app:

```bash
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.


## Verify vertical slice
On home page, fill out account information and select 'Create Account.' The app will send you an email to verify your account. Click on the link in the email and then you will be logged in! You can also select logout in the bottom left hand corner of the screen and log back in using the email and password you provided.
