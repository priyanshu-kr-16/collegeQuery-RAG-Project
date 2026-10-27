/**
 * Vercel Serverless Function: POST /api/ingest
 * 
 * Ingestion Pipeline:
 * 1. Takes target URL (crawls via Jina Reader r.jina.ai) or customChunks (from PDF/notes)
 * 2. Splits structurally into sections & tables
 * 3. Vectorizes each chunk with gemini-embedding-001 with strict 768 dimensions (output_dimensionality: 768)
 * 4. Upserts to Supabase pgvector table `knowledge_chunks`
 */

const EMBED_MODELS = ['gemini-embedding-001', 'gemini-embedding-2'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  // Handle GET: Fetch all existing chunks from Supabase for Admin Dashboard
  if (req.method === 'GET') {
    try {
      if (supabaseUrl && supabaseKey) {
        const sbResp = await fetch(`${supabaseUrl}/rest/v1/knowledge_chunks?select=id,source_type,title,url,category,academic_year,content&order=created_at.desc&limit=500`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        if (sbResp.ok) {
          const rows = await sbResp.json();
          return res.status(200).json({ chunks: rows });
        }
      }
      return res.status(200).json({ chunks: [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Handle DELETE: Delete a specific chunk by id, purge by url, purge by sourceType, or wipe all chunks
  if (req.method === 'DELETE') {
    const { id, url, sourceType, clearAll, adminPassword } = req.body || {};
    const expectedPassword = process.env.ADMIN_PASSWORD || 'pk1607';

    if (adminPassword !== expectedPassword) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password.' });
    }

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured in environment.' });
    }

    try {
      let endpoint = '';
      if (clearAll) {
        endpoint = `${supabaseUrl}/rest/v1/knowledge_chunks?id=not.is.null`;
      } else if (sourceType) {
        endpoint = `${supabaseUrl}/rest/v1/knowledge_chunks?source_type=eq.${encodeURIComponent(sourceType)}`;
      } else if (id) {
        endpoint = `${supabaseUrl}/rest/v1/knowledge_chunks?id=eq.${encodeURIComponent(id)}`;
      } else if (url) {
        const cleanUrl = url.trim().replace(/\/+$/, '');
        endpoint = `${supabaseUrl}/rest/v1/knowledge_chunks?url=ilike.*${encodeURIComponent(cleanUrl)}*`;
      } else {
        return res.status(400).json({ error: 'Provide either "id", "url", "sourceType", or "clearAll" to delete.' });
      }

      const sbDelResp = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation'
        }
      });

      if (!sbDelResp.ok) {
        const errText = await sbDelResp.text();
        return res.status(500).json({ error: 'Failed to delete from Supabase: ' + errText });
      }

      const deletedItems = await sbDelResp.json().catch(() => []);
      return res.status(200).json({
        status: 'ok',
        deletedCount: Array.isArray(deletedItems) ? deletedItems.length : 1
      });
    } catch (err) {
      return res.status(500).json({ error: 'Delete failed: ' + err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET, POST, or DELETE.' });
  }

  const { url, adminPassword, customChunks, discoverLinksOnly } = req.body || {};
  const expectedPassword = process.env.ADMIN_PASSWORD || 'pk1607';

  if (adminPassword !== expectedPassword) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password.' });
  }

  // Feature: True Recursive Link Discovery (Finds sub-tabs, circulars, and internal pages)
  if (discoverLinksOnly && url) {
    try {
      const cleanUrl = url.trim().replace(/\/+$/, '');
      const parsedUrl = new URL(cleanUrl);
      const host = parsedUrl.hostname;

      const pageResp = await fetch(cleanUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (!pageResp.ok) {
        return res.status(200).json({ status: 'ok', links: [] });
      }

      const html = await pageResp.text();
      const re = /href=["']([^"'#\s?]+)["']/g;
      let match;
      const discovered = new Set();

      while ((match = re.exec(html)) !== null) {
        let rawLink = match[1].trim();
        if (!rawLink || rawLink.startsWith('javascript:') || rawLink.startsWith('mailto:') || rawLink.startsWith('tel:')) continue;

        let fullUrl = '';
        if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) {
          try {
            const lUrl = new URL(rawLink);
            if (lUrl.hostname === host || lUrl.hostname.endsWith('.' + host)) {
              fullUrl = lUrl.origin + lUrl.pathname.replace(/\/+$/, '');
            }
          } catch (e) {}
        } else if (rawLink.startsWith('/')) {
          fullUrl = parsedUrl.origin + rawLink.replace(/\/+$/, '');
        }

        // Filter out static assets (images, css, js) and root home
        if (fullUrl && fullUrl !== cleanUrl && !/\.(png|jpg|jpeg|webp|gif|svg|css|js|ico|woff2?)$/i.test(fullUrl)) {
          // Prioritize relevant sub-paths (e.g. if on /admissions, prioritize /admissions/*)
          discovered.add(fullUrl);
        }
      }

      // Prioritize sibling and child links under the same section/directory (e.g. /admissions/*)
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      const parentPrefix = pathParts.length > 0 ? '/' + pathParts[0] : '';

      const prioritized = Array.from(discovered).sort((a, b) => {
        const aInPrefix = parentPrefix && a.includes(parentPrefix) ? 1 : 0;
        const bInPrefix = parentPrefix && b.includes(parentPrefix) ? 1 : 0;
        return bInPrefix - aInPrefix;
      });

      return res.status(200).json({
        status: 'ok',
        parentUrl: cleanUrl,
        totalFound: prioritized.length,
        links: prioritized.slice(0, 15) // Top 15 discovered sub-pages
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to discover links: ' + err.message });
    }
  }

  if (!geminiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY in server environment variables.' });
  }

  try {
    let chunksToProcess = [];

    if (Array.isArray(customChunks) && customChunks.length > 0) {
      chunksToProcess = customChunks;
    } else if (url) {
      const cleanUrl = url.trim().replace(/\/+$/, '');
      const jinaResp = await fetch(`https://r.jina.ai/${cleanUrl}`, {
        headers: { 'Accept': 'text/plain' }
      });
      if (!jinaResp.ok) {
        throw new Error(`Failed to fetch URL via r.jina.ai (HTTP ${jinaResp.status})`);
      }
      const rawMd = await jinaResp.text();
      chunksToProcess = splitMarkdownStructurally(rawMd, cleanUrl);
    } else {
      return res.status(400).json({ error: 'Provide either a target "url" or "customChunks".' });
    }

    if (chunksToProcess.length === 0) {
      return res.status(200).json({ status: 'ok', chunksIndexed: 0, message: 'No content sections found to index.' });
    }

    // Step 2: Vectorize with 768 dimensions using Gemini embedding models
    let embeddings = [];
    const BATCH_SIZE = 20;

    for (const embModel of EMBED_MODELS) {
      try {
        let allBatchEmbeddings = [];
        let modelSuccess = true;

        for (let i = 0; i < chunksToProcess.length; i += BATCH_SIZE) {
          const slice = chunksToProcess.slice(i, i + BATCH_SIZE);
          const requests = slice.map(c => ({
            model: `models/${embModel}`,
            content: { parts: [{ text: `[Source: ${c.title} | URL: ${c.url}]\n${c.content}`.slice(0, 2500) }] },
            taskType: 'RETRIEVAL_DOCUMENT',
            output_dimensionality: 768
          }));

          const embedResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${embModel}:batchEmbedContents?key=${encodeURIComponent(geminiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requests })
            }
          );

          if (embedResp.ok) {
            const embedData = await embedResp.json();
            const batchResults = embedData.embeddings || [];
            allBatchEmbeddings.push(...batchResults);
          } else {
            modelSuccess = false;
            break;
          }
        }

        if (modelSuccess && allBatchEmbeddings.length === chunksToProcess.length) {
          embeddings = allBatchEmbeddings;
          break;
        }
      } catch (err) {
        console.warn(`Model ${embModel} batch embed error:`, err);
      }
    }

    const vectorizedChunks = chunksToProcess.map((c, idx) => ({
      id: c.id || `chunk-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      source_type: c.source_type || 'website',
      title: c.title,
      url: c.url,
      category: c.category || 'Academics & Timetable',
      academic_year: c.academic_year || '2026',
      content: c.content,
      embedding: embeddings[idx]?.values || null
    }));

    // Step 3: Upsert to Supabase
    if (supabaseUrl && supabaseKey) {
      const sbHeaders = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      };

      if (url) {
        const cleanUrl = url.trim().replace(/\/+$/, '');
        await fetch(`${supabaseUrl}/rest/v1/knowledge_chunks?url=eq.${encodeURIComponent(cleanUrl)}`, {
          method: 'DELETE',
          headers: sbHeaders
        });
      }

      const sbResp = await fetch(`${supabaseUrl}/rest/v1/knowledge_chunks`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify(vectorizedChunks)
      });

      if (!sbResp.ok) {
        const sbErr = await sbResp.text();
        throw new Error(`Supabase insert failed: ${sbErr}`);
      }
    }

    return res.status(200).json({
      status: 'ok',
      chunksIndexed: vectorizedChunks.length,
      chunks: vectorizedChunks
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function isTableDelimiterLine(line) {
  const t = String(line || '').trim();
  return t.startsWith('|') && t.endsWith('|') && /^\|[\s:|-]+\|$/.test(t) && t.includes('-');
}

function isShortCaptionLine(line) {
  const t = String(line || '').trim().replace(/^[*_#\s]+|[*_#\s]+$/g, '');
  if (!t || t.length < 3 || t.length > 85) return false;
  if (t.startsWith('|') || t.startsWith('http') || t.startsWith('[')) return false;
  if (/[.!?]$/.test(t)) return false;
  return true;
}

function splitMarkdownStructurally(rawMarkdown, sourceUrl) {
  const lines = String(rawMarkdown || '').split('\n');
  let pageTitle = sourceUrl.replace(/^https?:\/\/(www\.)?/, '');
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const m = lines[i].match(/^Title:\s*(.+)$/i);
    if (m && m[1].trim()) { pageTitle = m[1].trim(); break; }
  }

  const sections = [];
  let heading = 'Overview';
  let buf = [];
  let inTable = false;

  function flush() {
    const body = buf.join('\n').trim();
    if (body.length >= 25) {
      sections.push({
        id: `web-${Date.now()}-${sections.length}`,
        source_type: 'website',
        title: `${pageTitle} — ${heading}`,
        url: sourceUrl,
        category: inferCategory(heading, body),
        academic_year: '2026',
        content: body.slice(0, 2200)
      });
    }
    buf = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (/^(URL Source:|Markdown Content:|Published Time:)/i.test(trimmed)) continue;

    const hm = trimmed.match(/^(#{1,5})\s+(.+)$/);
    if (hm) {
      flush();
      heading = hm[2].replace(/[#*`]/g, '').trim();
      continue;
    }

    const nextTrimmed = (lines[i + 1] || '').trim();
    const startsNewTable = trimmed.startsWith('|') && trimmed.endsWith('|') && isTableDelimiterLine(nextTrimmed);

    if (startsNewTable && !inTable) {
      const captionLines = [];
      while (buf.length > 0 && captionLines.length < 2) {
        const lastLine = buf[buf.length - 1].trim();
        if (!lastLine) {
          buf.pop();
          continue;
        }
        if (isShortCaptionLine(lastLine)) {
          captionLines.unshift(buf.pop().trim().replace(/^[*_]+|[*_]+$/g, ''));
        } else {
          break;
        }
      }
      if (buf.join('\n').trim().length >= 25) {
        flush();
      }
      if (captionLines.length > 0) {
        heading = captionLines.join(' — ');
      }
      inTable = true;
    } else if (inTable && !trimmed.startsWith('|') && trimmed.length > 0) {
      inTable = false;
    }

    buf.push(rawLine);
  }
  flush();
  return sections;
}

function inferCategory(heading, content) {
  const combined = `${heading} ${content}`.toLowerCase();
  if (combined.includes('fee') || combined.includes('scholarship') || combined.includes('tuition')) return 'Fees & Scholarships';
  if (combined.includes('hostel') || combined.includes('mess') || combined.includes('room') || combined.includes('bus') || combined.includes('transport')) return 'Hostel & Campus Rules';
  if (combined.includes('placement') || combined.includes('package') || combined.includes('recruiter') || combined.includes('internship')) return 'Placements & Careers';
  if (combined.includes('exam') || combined.includes('curriculum') || combined.includes('syllabus') || combined.includes('course') || combined.includes('library')) return 'Academics & Timetable';
  if (combined.includes('event') || combined.includes('calendar') || combined.includes('fest') || combined.includes('holiday')) return 'Events & Calendar';
  return 'Academics & Timetable';
}
