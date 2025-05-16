# 💸 Paise Guru - AI-Based Personal Finance Platform

**Paise Guru** is a full-stack AI-powered personal finance management platform designed to help users track, analyze, and optimize their spending habits. Using advanced features like receipt scanning, AI insights, and budget alerts, it offers a complete financial planning experience.

---

## ⚙️ Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS, Shadcn UI
- **Backend**: Node.js, Prisma ORM
- **AI Integration**: Gemini API
- **Auth**: Clerk
- **Background Tasks**: Inngest
- **Email Service**: Resend
- **Security**: Arcjet
- **Deployment**: Vercel


## 🚀 Features

- 📸 **Receipt Scanning**: Upload receipts and let AI auto-categorize expenses.
- 📊 **Category-Wise Transaction Management**: View spending by Food, Travel, Bills, etc.
- 📈 **Monthly AI Insights**: Gemini API provides summaries and recommendations.
- ⏰ **Budget Alerts**: Get notified when crossing budget limits in a category.
- 🔒 **Authentication & Security**: Clerk integration with Arcjet for bot protection.
- 📬 **Email Notifications**: Triggered using Resend API.
- ⏱ **Background Jobs**: Scheduled via Inngest for insights and budget reports.
- ☁️ **Fully Deployed on Vercel**: Scalable and performant.


### Make sure to create a `.env` file with following variables -

```
DATABASE_URL=
DIRECT_URL=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/onboarding
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

GEMINI_API_KEY=

RESEND_API_KEY=

ARCJET_KEY=
```
