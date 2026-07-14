-- ============================================
-- pgvector Migration — Upgrade RAG from in-memory cosine similarity
-- to PostgreSQL-native vector search
-- 
-- Usage:
--   1. Enable pgvector extension on your PostgreSQL (Neon/Supabase):
--      CREATE EXTENSION IF NOT EXISTS vector;
--   2. Run this migration: npx prisma migrate dev --name add-pgvector
--   3. Update rag-service.ts to use Prisma $queryRaw for vector search
-- ============================================

-- Enable pgvector extension (run once per database)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column to MaterialChunk (1536 = DeepSeek embedding dimension)
ALTER TABLE "MaterialChunk" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);

-- Migrate existing JSON embeddings to native vector type
-- This is a one-time migration; for large datasets, batch it
UPDATE "MaterialChunk"
SET "embeddingVector" = REPLACE(REPLACE("embedding", '[', '{'), ']', '}')::vector(1536)
WHERE "embedding" IS NOT NULL AND "embeddingVector" IS NULL;

-- Create IVFFlat index for approximate nearest neighbor search
-- (Run after sufficient data is loaded: >1000 rows recommended)
-- CREATE INDEX ON "MaterialChunk" USING ivfflat ("embeddingVector" vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- Query example (replaces in-memory cosine similarity):
-- 
-- SELECT mc."id", mc."content", mc."materialId",
--        1 - (mc."embeddingVector" <=> $queryVector::vector) AS similarity
-- FROM "MaterialChunk" mc
-- WHERE mc."embeddingVector" IS NOT NULL
-- ORDER BY mc."embeddingVector" <=> $queryVector::vector
-- LIMIT 5;
-- ============================================
