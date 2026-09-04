# ScholarPath AI 🎓✈️

> **AI-Powered Scholarship Matching & University Discovery Platform for Students**  
> Fill your profile, upload your CV, and discover tailored scholarships and university rankings worldwide — with clear eligibility scoring, automated live web scraping, and Groq-accelerated AI assistance.

🌐 **Live Website:**https://www.scholarpathai.tech/
📂 **GitHub Repository:** [github.com/umairhassan110/ScholarPathAI](https://github.com/umairhassan110/ScholarPathAI)

---

## ✨ Features

- **Profile Builder** — Academic details (FSc/CGPA), IELTS scores, target degree, field of study, and target countries.
- **AI CV Analysis (Groq LPU)** — Extracts education, projects, technical skills, certifications, and publications from uploaded PDF/DOCX CVs.
- **Hybrid Data Merger** — Seamlessly combines manual profile data with extracted CV details for comprehensive evaluation.
- **Real-Time Web Scraper & AI Discovery** — 
  - Live scraping of official scholarship portals across 16+ countries (Japan, Germany, UK, USA, Italy, South Korea, China, Canada, Australia, etc.).
  - Automatic Groq AI fallback discovery when government portals update URLs or experience downtime.
  - Automatic deduplication ensuring zero repeated entries.
- **Auto-Flow Matching** — Saving a target country or degree automatically triggers background live scraping and eligibility calculation.
- **Weighted Eligibility Engine** —
  - **CGPA / FSc** (25%)
  - **Field Compatibility** (25%)
  - **Degree Progression** (20%) — *Fuzzy matching (BS = Bachelor's, MS = Master's) and progression tracking*
  - **IELTS Proficiency** (15%)
  - **Experience & Projects** (10%)
  - **Country Match** (5%)
- **Top 10 University Ranking** — Country-strict compatibility ranking with real-time acceptance percentage calculation.
- **Modern Europass CV Builder** — One-click CV conversion to standardized Europass format with clean PDF export via jsPDF.
- **AI Assistant Chatbot** — Real-time streaming scholarship advisor supporting both English and Roman Urdu.
- **Document Attestation Guides** — Step-by-step verified procedures for HEC, IBCC, and MOFA attestation.
- **Application Tracker** — Organize saved, in-progress, and submitted scholarship applications with deadline alerts.

---

## 🛠️ Tech Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS 3.4 | Responsive SPA, custom design system, real-time streaming |
| **Backend** | Node.js, Express 5.2 | RESTful API, deadline budget controls, serverless architecture |
| **AI Inference** | Groq LPU (`groq-sdk`) | `openai/gpt-oss-20b` (1,000 t/s) & `qwen/qwen3.6-27b` |
| **Database** | Supabase (PostgreSQL) | Profiles, scholarships, matches, universities, and tracking |
| **Storage** | Supabase Storage | Secure cloud bucket for CV uploads |
| **Authentication** | Custom JWT + Bcrypt | Secure token authentication with 7-day expiry |
| **Scraping** | Cheerio, Undici HTTP | Resilient parallel portal fetching with fallback recovery |
| **PDF Engine** | jsPDF | Structured Europass PDF generation |
| **Deployment** | Vercel | Unified monorepo deployment with automated CI/CD |

---

## 📁 Project Structure

```text
ScholarPathAI/
├── aischolarpath-backend-main/
│   └── aischolarpath-backend-main/      # Backend API (Express.js)
│       ├── config/
│       │   ├── ai.js                    # Groq SDK configuration & domain isolation
│       │   ├── env.js                   # Environment validation & configuration
│       │   └── supabase.js              # Supabase client singleton
│       ├── controllers/
│       │   ├── auth.controller.js       # JWT auth & account management
│       │   ├── chat.controller.js       # AI streaming chatbot
│       │   ├── documents.controller.js  # CV conversion & recommendation letters
│       │   ├── profile.controller.js    # Profile management & auto-flow matching
│       │   ├── scholarships.controller.js# Scholarship search & listing
│       │   ├── smartAgent.controller.js # Intelligent matching engine
│       │   └── universities.controller.js# Target-country university rankings
│       ├── services/
│       │   ├── ai.service.js            # Groq completion, streaming & structured JSON
│       │   ├── cv.service.js            # CV parsing & Europass PDF builder
│       │   ├── matching.service.js      # Weighted scoring algorithm
│       │   └── scrape.service.js        # Multi-country live scraper & AI discovery
│       ├── routes/                      # Modular Express domain routes
│       ├── public/                      # Bundled frontend SPA assets
│       ├── api/index.js                 # Vercel serverless entry point
│       └── package.json
│
└── scholarpath-frontend (2)/
    └── scholarpath/                     # Frontend Application (React + Vite)
        ├── src/
        │   ├── components/              # Reusable UI, AuthModal, ChatWidget
        │   ├── pages/                   # ProfileTab, ScholarshipsTab, UniversitiesTab
        │   ├── api.js                   # API client wrapper
        │   └── App.jsx                  # Application routing & auth guards
        ├── vite.config.js               # Development proxy & build config
        └── tailwind.config.js           # Theme colors & responsive design
