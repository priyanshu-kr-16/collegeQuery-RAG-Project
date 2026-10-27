-- ============================================================================
-- SRM College Query Assistant — Supabase pgvector Schema & Hybrid Search RPC
-- Execute this script in the Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ============================================================================

-- 1. Enable the pgvector extension
create extension if not exists vector;

-- 2. Create the knowledge_chunks table (768 dimensions for Gemini gemini-embedding-001)
create table if not exists public.knowledge_chunks (
  id text primary key,
  source_type text not null default 'website',
  title text not null,
  url text not null default 'https://www.srmup.in/',
  category text not null default 'Academics & Timetable',
  academic_year text not null default '2026',
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

-- 3. Create an HNSW index for fast Cosine Similarity vector search
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

-- 4. Row Level Security (RLS) Configuration
alter table public.knowledge_chunks enable row level security;

-- Allow public read access so students can query knowledge chunks
drop policy if exists "Allow public read access" on public.knowledge_chunks;
create policy "Allow public read access"
  on public.knowledge_chunks for select
  using (true);

-- Allow service role and serverless ingestion to insert/update/delete
drop policy if exists "Allow service role full access" on public.knowledge_chunks;
create policy "Allow service role full access"
  on public.knowledge_chunks for all
  using (true)
  with check (true);

-- 5. Cosine Similarity Vector Search RPC Function
create or replace function public.match_knowledge_chunks (
  query_embedding vector(768),
  match_threshold float default 0.30,
  match_count int default 5,
  filter_category text default 'ALL'
)
returns table (
  id text,
  source_type text,
  title text,
  url text,
  category text,
  academic_year text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    kc.id,
    kc.source_type,
    kc.title,
    kc.url,
    kc.category,
    kc.academic_year,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.embedding is not null
    and (filter_category = 'ALL' or kc.category = filter_category)
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
