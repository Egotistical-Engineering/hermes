// Vercel Edge Middleware — serves OG meta tags to social media bots for /read/* URLs
// Uses raw fetch to Supabase REST API (no dependencies)

const BOT_PATTERNS = [
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'telegrambot',
  'whatsapp',
  'googlebot',
  'bingbot',
  'yandexbot',
  'rogerbot',
  'embedly',
  'showyoubot',
  'outbrain',
  'pinterest',
  'quora link preview',
  'vkshare',
  'redditbot',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s+/g, '')       // headings
    .replace(/[*_]{1,3}(.+?)[*_]{1,3}/g, '$1')  // bold/italic
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')          // links
    .replace(/!\[.*?\]\(.+?\)/g, '')              // images
    .replace(/`{1,3}[^`]*`{1,3}/g, '')           // code
    .replace(/>\s+/g, '')             // blockquotes
    .replace(/[-*+]\s+/g, '')         // list markers
    .replace(/\d+\.\s+/g, '')         // ordered lists
    .replace(/---+/g, '')             // hr
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const config = {
  matcher: '/read/:path*',
};

export default async function middleware(request) {
  const userAgent = request.headers.get('user-agent') || '';

  // Only intercept for bots — humans get the SPA
  if (!isBot(userAgent)) return;

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /read/:shortId or /read/:shortId/:slug
  const shortId = parts[1];
  if (!shortId) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return;

  try {
    const apiUrl = `${supabaseUrl}/rest/v1/projects?short_id=eq.${encodeURIComponent(shortId)}&published=eq.true&select=title,author_name,pages,published_tabs,short_id,slug`;
    const res = await fetch(apiUrl, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });

    if (!res.ok) return;

    const rows = await res.json();
    if (!rows || rows.length === 0) return;

    const project = rows[0];
    const title = project.title || 'Untitled';
    const author = project.author_name || '';

    // Build description from first published tab content
    let description = '';
    const tabs = project.published_tabs || [];
    const pages = project.pages || {};
    for (const tab of tabs) {
      if (pages[tab]?.trim()) {
        description = stripMarkdown(pages[tab]).slice(0, 160);
        break;
      }
    }

    const canonicalUrl = `${url.origin}/read/${project.short_id}/${project.slug || 'essay'}`;
    const ogImageUrl = `${url.origin}/api/og?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}${author ? ` — ${escapeHtml(author)}` : ''}</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
</head>
<body></body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    // On any error, fall through to SPA
    return;
  }
}
