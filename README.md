# S Quantum Engine Data Cleansing

AI-assisted web app for transforming raw tabular data into governed schemas with preview, mapping, and export workflows.

## Front Page Demo Image

The landing page now showcases AI-based mapping using:

![AI determines mapping - front page](public/guides/01-ai-mapping-frontpage.svg)

## How-To Guides (from screenshots)

### 1. Upload mapping and let AI determine it (Image #2)

![Image #2 - Upload mapping and AI determination](public/guides/02-schema-mapping-result.svg)

1. Open or create your schema from `Final Schemas`.
2. Upload your raw file and proceed to mapping.
3. Use AI-assisted mapping and save the mapped schema fields.
4. Reuse this schema for new datasets.

### 2. Select multiple sheets and let AI clean data (Image #3)

![Image #3 - Select multiple sheets](public/guides/03-select-multiple-sheets.svg)

1. In `Upload raw data`, choose all sheets you want to process.
2. Confirm sheet boundaries/header rows for each selected sheet.
3. Continue to mapping so AI can work across all selected sheets.

### 3. Let AI determine the mapping (Image #4)

![Image #4 - AI mapping builder](public/guides/04-ai-mapping-determination.svg)

1. Open `Mapping Builder`.
2. Click `Auto-map with AI`.
3. Review source-to-target links.
4. Confirm mapping for each sheet before moving to preview.

### 4. Export data (Image #5)

![Image #5 - Export options](public/guides/05-data-export.svg)

1. Go to `Export` after mapping/preview is complete.
2. Choose output type (`.xlsx`, `CSV`, BigQuery, Google Sheets, FIS upload).
3. Export/download the cleaned dataset.

## What This Project Does

- Upload CSV/Excel source files.
- Parse and profile source structure.
- Create/manage target schemas.
- Use AI-assisted mapping and chat-driven transformation support.
- Preview transformed data and export clean output.
- Manage authentication and basic schema access control with Supabase.

## Tech Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS + Radix UI primitives
- Supabase (auth + database + RLS)
- LangChain / AI SDK integrations for mapping assistance

## Prerequisites

- Node.js 20+ recommended
- npm 9+ recommended
- Supabase project (URL, anon key, service role key)
- Anthropic API key (for AI-powered flows)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create local environment file:

```bash
cp .env.sample .env.local
```

3. Fill values in `.env.local`:

```env
ANTHROPIC_API_KEY=your-anthropic-key-here
LANGSMITH_TRACING=false
LANGSMITH_ENDPOINT=https://api.langsmith.com
LANGSMITH_API_KEY=your-langsmith-api-key-here
LANGSMITH_PROJECT=your-langsmith-project-name-here
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
```

4. Run the app:

```bash
npm run dev
```

5. Open:

```text
http://localhost:3000
```

## Available Scripts

- `npm run dev`: Start development server
- `npm run build`: Build production bundle
- `npm run start`: Run production server
- `npm run lint`: Run lint checks

## Main Routes

- `/`: Landing page
- `/login`: Login
- `/signup`: Registration
- `/schemas`: Schema list and management
- `/schemas/[id]`: Schema detail
- `/schemas/[id]/edit`: Schema edit redirect/workflow entry
- `/upload`: Source upload and parsing
- `/preview`: Data preview
- `/mapping`: Mapping workflow
- `/export`: Export output
- `/datasets/[id]`: Dataset detail

## API Endpoints (App Router)

- `/api/auth/*`: Login, signup, logout, session
- `/api/schemas/*`: Schema CRUD + grants
- `/api/datasets/*`: Dataset CRUD
- `/api/jobs/*`: Job creation/status
- `/api/auto-map`: Automatic field mapping
- `/api/analyze-raw`: Raw source analysis
- `/api/parse-schema`: Schema parsing support
- `/api/chat`: Chat assistant endpoint

## Database Migrations

Supabase migrations are in:

- `supabase/migrations`

Apply them using your normal Supabase migration workflow (CLI or CI pipeline).

## Branding Assets

- Homepage logo placeholder file:
  - `public/sqe-logo-placeholder.svg`
- WhatsApp button icon:
  - `public/whatsapp-logo.svg`
- Guide screenshot placeholders:
  - `public/guides/01-ai-mapping-frontpage.svg`
  - `public/guides/02-schema-mapping-result.svg`
  - `public/guides/03-select-multiple-sheets.svg`
  - `public/guides/04-ai-mapping-determination.svg`
  - `public/guides/05-data-export.svg`

Replace any placeholder asset with your real file while keeping the same filename to avoid code changes.

## Notes

- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed client-side.
- AI mapping features depend on valid external AI credentials.
