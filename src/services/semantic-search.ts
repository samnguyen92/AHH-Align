import { createServerSupabaseClient } from '@/services/supabase-server';
import type { Clinic } from '@/types/database';

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

async function createQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for semantic search.');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: query,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Embedding request failed: ${detail}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  const embedding = payload.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error('Embedding response did not include a vector.');
  }

  return embedding;
}

export interface SemanticClinicResult {
  clinic: Clinic;
  similarity: number;
  matchedContent: string;
}

export async function semanticClinicSearch(
  query: string,
  limit = 10
): Promise<SemanticClinicResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const embedding = await createQueryEmbedding(trimmedQuery);

  const { data: matches, error: matchError } = await supabase.rpc(
    'match_clinic_embeddings',
    {
      query_embedding: embedding,
      match_count: limit,
    }
  );

  if (matchError) {
    throw matchError;
  }

  const rows = (matches ?? []) as Array<{
    clinic_id: string;
    content: string;
    similarity: number;
  }>;

  if (rows.length === 0) {
    return [];
  }

  const clinicIds = rows.map((row) => row.clinic_id);
  const { data: clinics, error: clinicError } = await supabase
    .from('clinics')
    .select('*')
    .in('id', clinicIds);

  if (clinicError) {
    throw clinicError;
  }

  const clinicsById = new Map((clinics ?? []).map((clinic) => [clinic.id, clinic as Clinic]));

  return rows
    .map((row) => {
      const clinic = clinicsById.get(row.clinic_id);
      if (!clinic) {
        return null;
      }

      return {
        clinic,
        similarity: row.similarity,
        matchedContent: row.content,
      };
    })
    .filter((result): result is SemanticClinicResult => Boolean(result));
}
