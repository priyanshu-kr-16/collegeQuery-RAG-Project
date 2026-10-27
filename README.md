# 🏛️ Autonomous College & University RAG Assistant

An enterprise-grade, zero-hardcoded **Retrieval-Augmented Generation (RAG)** platform designed for university students and administrators. 

Adaptable to **any college or university** in the world — simply input your institution's URL or upload official PDFs to build an AI student query assistant in minutes.

---

## ✨ Features

- 🎓 **Student Query Portal (`/`)**:
  - Conversational AI powered by **Google Gemini** with multi-turn query reformulation (resolves follow-ups like *"Is mess included in that?"*).
  - Grounded answers with strict anti-hallucination guardrails and formatted Markdown tables.
  - Interactive source citation cards linking back to official university web pages.
  - Zero login required for students.

- ⚙️ **Admin Ingestion Portal (`/admin`)**:
  - **Dynamic Recursive Web Crawler**: Ingests university web pages and automatically discovers nested tabs (e.g., `/refund-policy`, `/fee-structure`) without hardcoded URL lists.
  - **Table-Preserving Structural Chunking**: Keeps Markdown and HTML table headers intact so complex tuition fee matrices never lose column headers.
  - **Client-Side PDF Ingestion**: Extracts text from syllabus handbooks, exam circulars, and notifications using Mozilla PDF.js.
  - **Custom Circular Notes**: Quick markdown editor for ad-hoc campus notices.
  - **Granular Database Management**: 1-Click single chunk deletion, page URL purge, category-specific wipes (`All Websites`, `All PDFs`, `All Notes`), and full database reset.
  - **Security Gate**: Session-authenticated with a customizable admin passkey.

- ⚡ **Production-Ready & 100% Free Tier Compatible**:
  - **Database**: Cloud PostgreSQL with **Supabase `pgvector`** and **HNSW Cosine Indexing**.
  - **Embeddings**: **Google `gemini-embedding-001` (768 Dimensions)** with Matryoshka Representation Learning (MRL).
  - **Zero-Dependency Local Server**: Built with native Node.js HTTP (`server.js`) — no heavy frameworks required.

---

## 📁 Repository Structure

```text
├── .env.example              # Blueprint template for environment variables
├── .gitignore                # Protects secrets and credentials from Git
├── package.json              # Project configuration and start scripts
├── server.js                 # Native local Node.js server (zero dependencies)
├── vercel.json               # Vercel deployment configuration
│
├── index.html                # Student Query Portal UI
├── admin.html                # Admin Dashboard & Vector DB Manager UI
│
├── api/
│   ├── chat.js               # Student RAG pipeline (Reformulation + Vector Search + LLM)
│   └── ingest.js             # Admin pipeline (Crawler, Link discovery, Embeddings, Deletions)
│
├── database/
│   ├── supabase_schema.sql   # pgvector schema, HNSW index & search RPC function
│   └── seed_data.sql         # Baseline institutional knowledge chunks
│
├── docs/
│   ├── ARCHITECTURE.md       # Full technical architecture & pipeline documentation
│   └── VIVA_QUESTIONS.md     # Viva voce defense questions & answers
│
└── public/
    └── css/
        └── style.css         # Styles for markdown tables & custom scrollbars
```

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- A free [Google AI Studio API Key](https://aistudio.google.com/)
- A free [Supabase Account](https://supabase.com/)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/college-rag-assistant.git
cd college-rag-assistant
```

---

### Step 2: Configure Environment Variables
Copy `.env.example` to create your `.env` file:
```bash
cp .env.example .env
```

Open `.env` in your text editor and add your credentials:
```env
GEMINI_API_KEY="AIzaSy..."
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
ADMIN_PASSWORD="your_admin_password"
PORT=3000
```

---

### Step 3: Initialize Supabase Vector Database
1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and navigate to **SQL Editor**.
2. Copy and run the SQL code from [`database/supabase_schema.sql`](database/supabase_schema.sql). This enables `pgvector`, creates the `knowledge_chunks` table, creates the **HNSW index**, and registers the similarity search function.
3. *(Optional)* Run [`database/seed_data.sql`](database/seed_data.sql) if you want baseline sample data.

---

### Step 4: Run Locally
Start the server with:
```bash
npm start
```

Open your browser:
* 🎓 **Student Portal:** `http://localhost:3000`
* ⚙️ **Admin Portal:** `http://localhost:3000/admin` *(Passkey: configured in your `.env`)*

---

## 🌐 Adapting for Any College or University

This engine is completely university-agnostic. To deploy for your college:
1. Open `http://localhost:3000/admin`.
2. Enter your university's admissions, fee, or circular URL (e.g. `https://www.yourcollege.edu/admissions`).
3. Select **"Recursive Crawl (Auto-discover sub-tabs & pages)"** and click **Start Crawl**.
4. The system will automatically index all departmental sub-tabs and make them immediately searchable for students!

---

## ☁️ Deployment (Vercel)

This project is pre-configured for **1-click deployment on Vercel**:
1. Push your repository to GitHub.
2. Go to [Vercel](https://vercel.com/) and click **Add New Project** ➔ Import your repository.
3. Under **Environment Variables**, add:
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
4. Click **Deploy**! Your college assistant will be live with an SSL HTTPS domain in under 60 seconds.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
