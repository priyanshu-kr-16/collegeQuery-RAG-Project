/**
 * Vercel Serverless Function: POST /api/chat
 * 
 * College Query RAG Assistant Pipeline:
 * 1. Multi-turn context evaluation: optionally rephrase follow-up questions
 * 2. Vector Embedding: Generates 768-dim query embedding using gemini-embedding-001 (with output_dimensionality: 768)
 * 3. Semantic Retrieval: Supabase pgvector RPC `match_knowledge_chunks` with Cosine similarity
 * 4. Grounded Synthesis: Gemini 3.8 Flash / 2.5 Flash with Markdown formatting & citations
 */

const CHAT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
const EMBED_MODELS = ['gemini-embedding-001', 'gemini-embedding-2'];

export default async function handler(req, res) {
  // Set CORS headers for seamless cross-origin and local testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { query, history = [], category = 'ALL' } = req.body || {};
  if (!query || !String(query).trim()) {
    return res.status(400).json({ error: 'Query is required.' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!geminiKey) {
    return res.status(500).json({ 
      error: 'Missing GEMINI_API_KEY in server environment variables. Please configure it in your Vercel Project Settings or .env file.' 
    });
  }

  try {
    const rawQuery = String(query).trim();

    // Step 1: Multi-turn Query Reformulation
    // If user asks a follow-up ("what about hostel fees for that?"), expand with context
    let searchEffectiveQuery = rawQuery;
    const isShortFollowUp = history.length > 0 && (rawQuery.length < 35 || /^(what about|and for|how much|fee|timing|where|who|eligibility|is it)/i.test(rawQuery));
    
    if (isShortFollowUp) {
      try {
        const lastFewTurns = history.slice(-4).map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.text || ''}`).join('\n');
        const reformResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [{
                  text: `Given this conversation between a college student and assistant:\n${lastFewTurns}\n\nStudent follow-up query: "${rawQuery}"\nRewrite this follow-up query into a standalone search query for college knowledge base retrieval. Include relevant subjects/courses if implied. Output ONLY the rewritten search query in 1 concise sentence.`
                }]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
            })
          }
        );
        if (reformResp.ok) {
          const reformData = await reformResp.json();
          const rewritten = reformData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (rewritten && rewritten.length > 5) {
            searchEffectiveQuery = rewritten.replace(/^"|"$/g, '');
          }
        }
      } catch (err) {
        // Fall back gracefully to raw query if reformulation times out
        searchEffectiveQuery = rawQuery;
      }
    }

    // Step 2: Generate 768-dimension Query Embedding
    let queryEmbedding = null;
    let embedError = null;

    for (const embModel of EMBED_MODELS) {
      try {
        const embedResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${embModel}:embedContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: { parts: [{ text: searchEffectiveQuery }] },
              taskType: 'RETRIEVAL_QUERY',
              output_dimensionality: 768
            })
          }
        );

        if (embedResp.ok) {
          const embedData = await embedResp.json();
          queryEmbedding = embedData?.embedding?.values || null;
          if (queryEmbedding && queryEmbedding.length === 768) {
            break;
          }
        } else {
          const errData = await embedResp.json().catch(() => ({}));
          embedError = errData?.error?.message || `HTTP ${embedResp.status}`;
        }
      } catch (err) {
        embedError = err.message;
      }
    }

    // Step 3: Vector Cosine Similarity Search in Supabase pgvector
    let matchedChunks = [];
    if (supabaseUrl && supabaseKey && Array.isArray(queryEmbedding)) {
      try {
        const rpcResp = await fetch(`${supabaseUrl}/rest/v1/rpc/match_knowledge_chunks`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query_embedding: queryEmbedding,
            match_threshold: 0.30, // Balanced threshold to avoid false negatives
            match_count: 5,
            filter_category: category || 'ALL'
          })
        });

        if (rpcResp.ok) {
          matchedChunks = await rpcResp.json();
        }
      } catch (sbErr) {
        console.error('Supabase RPC match error:', sbErr);
      }
    }

    // Step 4: Synthesize Grounded, Conversational Answer with Gemini
    const contextBlock = matchedChunks.length > 0
      ? matchedChunks.map((c, i) =>
          `[Chunk ${i + 1}] Title: ${c.title} | Source: ${c.url} | Category: ${c.category} | Similarity: ${Number(c.similarity || 0).toFixed(3)}\n${c.content}`
        ).join('\n\n---\n\n')
      : 'NO_MATCHING_CHUNKS_FOUND_IN_DATABASE';

    const systemInstruction = `You are the official "SRM College Query Assistant" for SRM Institute of Science and Technology (SRMIST), Delhi-NCR Campus.

RULES:
1. CASUAL GREETINGS & STUDENT BANTER:
   - For greetings (hi, hello, hey), "who are you", light jokes, or casual student queries, reply warmly, naturally, and with light campus humor. Do not output citations for greetings.
2. COLLEGE FACTUAL QUESTIONS (fees, syllabus, hostel, mess, timetable, placements, rules):
   - Answer STRICTLY and ACCURATELY based on the RETRIEVED CHUNKS below.
   - Format all fee breakdowns, deadlines, schedules, or comparisons as clean, well-structured Markdown tables (| Column | Column |).
   - If RETRIEVED CHUNKS states NO_MATCHING_CHUNKS_FOUND_IN_DATABASE or does not contain the answer, politely state that this information is not yet indexed in the college database, and suggest checking the official college portal or asking the admin to crawl that page. Never hallucinate or invent figures.`;

    const contents = history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(m.text || '') }]
    })).filter(m => m.parts[0].text.trim().length > 0);

    contents.push({
      role: 'user',
      parts: [{ text: `RETRIEVED CHUNKS:\n${contextBlock}\n\n---\nSTUDENT QUESTION: ${rawQuery}` }]
    });

    let answerMarkdown = '';
    let lastGenErr = 'Generation failed';

    for (const modelName of CHAT_MODELS) {
      try {
        const genResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              generationConfig: { 
                temperature: 0.3, 
                maxOutputTokens: 1400 
              }
            })
          }
        );

        if (genResp.ok) {
          const genData = await genResp.json();
          answerMarkdown = genData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (answerMarkdown) break;
        } else {
          const errJson = await genResp.json().catch(() => ({}));
          lastGenErr = errJson?.error?.message || `HTTP ${genResp.status}`;
        }
      } catch (netErr) {
        lastGenErr = netErr.message;
      }
    }

    if (!answerMarkdown) {
      throw new Error(lastGenErr || embedError || 'Gemini response generation failed.');
    }

    return res.status(200).json({
      answer: answerMarkdown,
      sources: matchedChunks,
      searchQueryUsed: searchEffectiveQuery
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
