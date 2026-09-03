# ScholarPath AI

> AI-powered scholarship matching platform for students. Fill your profile, upload your CV, and find scholarships you're eligible for — with clear reasons why you qualify or don't.

**Live:** [https://aischolarpath-backend-main.vercel.app](https://aischolarpath-backend-main.vercel.app)

---

## Features

- **Profile Builder** — CNIC, academics (FSc/CGPA), IELTS, target degree/field/country
- **CV Upload + AI Analysis** — Gemini AI extracts academic data from PDF/DOCX CVs
- **Weighted Matching Engine** — Compares profile + CV against all scholarships with scoring:
  - CGPA/FSc (25%), Field (25%), Degree (20%), IELTS (15%), Experience (10%), Country (5%)
- **Eligibility Reasons** — Clear explanations for "Not Eligible" and "Partially Eligible" scholarships
- **Degree Fuzzy Matching** — "BS" = "Bachelor's", "MS" = "Master's", supports degree progression
- **University Directory** — Browse universities by country with scholarship links
- **Document Attestation** — Country-specific attestation guides (HEC, MOFA, etc.)
- **Application Tracker** — Track scholarship applications and deadlines

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS 3.4 |
| Backend | Express 5.2 (single-file `index.js`), CommonJS |
| Database | Supabase PostgreSQL (profiles, scholarships, matches, etc.) |
| Auth | Custom JWT (not Supabase Auth) |
| AI | Google Gemini 3.6 Flash (CV parsing, chat, scraping) |
| Deployment | Vercel (serverless, single URL for frontend + API) |
| Storage | Supabase Storage (CV files) |

## Project Structure

```
ScholarPathAI/
├── aischolarpath-backend-main/    # Backend (Express.js)
│   ├── index.js                   # Single-file API (~2600 lines)
│   ├── api/index.js               # Vercel serverless wrapper
│   ├── package.json
│   ├── vercel.json                # Vercel routing config
│   ├── supabase-schema.sql        # Database schema + migrations
│   └── public/                    # Built frontend (served by Express)
│
└── scholarpath-frontend (2)/      # Frontend (React + Vite)
    └── scholarpath/
        ├── src/
        │   ├── pages/             # ProfileTab, ScholarshipsTab, Dashboard, etc.
        │   ├── components/        # UI, AuthModal, AuthContext, ChatWidget
        │   ├── api.js             # API client (fetch wrapper)
        │   ├── App.jsx            # Router + auth gates
        │   └── main.jsx           # Entry point
        ├── vite.config.js
        └── tailwind.config.js
```

## Local Development

### Prerequisites
- Node.js >= 18
- npm
- Supabase project (URL + anon key + service role key)
- Google Gemini API key
- JWT secret

### Backend Setup

```bash
cd aischolarpath-backend-main/aischolarpath-backend-main

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your Supabase + Gemini + JWT credentials

# Run database migrations in Supabase SQL Editor
# (copy queries from supabase-schema.sql)

# Start server
node index.js
# Server runs on http://localhost:3000
```

### Frontend Setup

```bash
cd "scholarpath-frontend (2)/scholarpath"

# Install dependencies
npm install

# Start dev server
npm run dev
# Frontend runs on http://localhost:5173
```

### Build for Production

```bash
# Build frontend
cd "scholarpath-frontend (2)/scholarpath"
npm run build

# Copy to backend public folder
cp -r dist/* ../aischolarpath-backend-main/aischolarpath-backend-main/public/

# Deploy to Vercel
cd ../aischolarpath-backend-main/aischolarpath-backend-main
npx vercel --prod
```

## API Reference

Base URL: `/api` (same origin when deployed)

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset password |

### Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile/:id` | Get user profile |
| PATCH | `/api/profile` | Update profile fields |
| POST | `/api/profile/:id/upload-cv` | Upload CV file |
| POST | `/api/profile/:id/analyze` | AI extract CV data |
| POST | `/api/profile/:id/match-scholarships` | Run matching engine |
| GET | `/api/profile/:id/matches` | Get match results |

### Scholarships
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scholarships` | List all scholarships |
| GET | `/api/scholarships/:id` | Get single scholarship |
| POST | `/api/scholarships/scrape-country` | Scrape scholarships for country |

### Universities
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/universities` | List universities |
| GET | `/api/universities/:id` | Get single university |

## Matching Engine

The weighted eligibility engine scores each scholarship against the user's profile:

| Criterion | Weight | Logic |
|-----------|--------|-------|
| CGPA / FSc % | 25% | Compare against `min_cgpa` (uses FSc for Bachelor's) |
| Field Match | 25% | Exact or related field match via FIELD_GROUPS |
| Degree Level | 20% | Fuzzy match (BS=Bachelor's, MS=Master's) + progression |
| IELTS Score | 15% | Compare against `min_ielts` |
| Experience | 10% | From CV extraction |
| Country | 5% | Pre-filtered by target country |

**Status Logic:**
- **Eligible** — All criteria pass
- **Partially Eligible** — CGPA/IELTS slightly below minimum or missing data
- **Not Eligible** — Degree mismatch, field mismatch, or expired deadline

## Environment Variables

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth
JWT_SECRET=your-secret-key

# AI
GEMINI_API_KEY=your-gemini-key
```

## Deployment

Deployed on Vercel as a single serverless function:
- Frontend served via `express.static('public')`
- API routes at `/api/*`
- SPA catch-all route for client-side routing
- Vercel config in `vercel.json`

## License

Private project — ScholarPath AI
