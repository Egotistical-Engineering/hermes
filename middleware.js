// Vercel Edge Middleware — serves OG meta tags for /read/* URLs.
// Detects social crawlers and OG scrapers, serves them a lightweight HTML
// with article-specific OG tags. Humans get the SPA with default tags.
//
// Strategy: instead of maintaining a bot allowlist (fragile — misses unknown
// scrapers like opengraph.xyz), we detect real browsers and serve the OG HTML
// to everything else. Real browsers identify themselves with a known engine
// token (Chrome, Firefox, Safari, etc). Safari-only UAs get an extra check
// via Sec-Fetch-Dest header, since Apple's link preview fetchers (iMessage,
// Mail, Notes) also use Safari UAs but don't send Sec-Fetch headers.

const BROWSER_ENGINES = [
  'chrome/',
  'firefox/',
  'safari/',
  'edg/',
  'opera/',
  'opr/',
  'vivaldi/',
  'brave/',
  'arc/',
];

function isTwitterInAppBrowser(ua) {
  // iOS and Android X/Twitter in-app browsers include "twitter" in UA.
  // Keep Twitter's crawler out of the browser path.
  return ua.includes('twitter') && !ua.includes('twitterbot');
}

function isRealBrowser(request) {
  const userAgent = request.headers.get('user-agent') || '';
  const ua = userAgent.toLowerCase();

  if (isTwitterInAppBrowser(ua)) return true;

  if (!BROWSER_ENGINES.some((engine) => ua.includes(engine))) return false;

  // Chrome, Firefox, Edge, etc. are definitively real browsers
  const isSafariOnly =
    ua.includes('safari/') &&
    !ua.includes('chrome/') &&
    !ua.includes('firefox/') &&
    !ua.includes('edg/');

  if (!isSafariOnly) return true;

  // Safari-only UAs are ambiguous — Apple's link preview fetchers (iMessage,
  // Mail, Notes) also send Safari UAs. Use Sec-Fetch-Dest as a tiebreaker:
  // real Safari navigation sends "document", scrapers send nothing.
  return request.headers.get('sec-fetch-dest') === 'document';
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
  // Real browsers get the SPA — they can render client-side
  if (isRealBrowser(request)) return;

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /read/:shortId or /read/:shortId/:slug
  const shortId = parts[1];
  if (!shortId) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return;

  try {
    const apiUrl = `${supabaseUrl}/rest/v1/projects?short_id=eq.${encodeURIComponent(shortId)}&published=eq.true&select=title,subtitle,author_name,published_pages,published_tabs,short_id,slug`;
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
    const subtitle = project.subtitle || '';
    const author = project.author_name || '';

    // Build description: prefer subtitle, fall back to first published tab content
    let description = subtitle;
    if (!description) {
      const tabs = project.published_tabs || [];
      const pages = project.published_pages || {};
      for (const tab of tabs) {
        if (pages[tab]?.trim()) {
          description = stripMarkdown(pages[tab]).slice(0, 160);
          break;
        }
      }
    }

    const canonicalUrl = `${url.origin}/read/${project.short_id}/${project.slug || 'essay'}`;
    const ogImageUrl = `${url.origin}/api/og?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
    const shouldRefreshToCanonical = (url.pathname + url.search) !== (`/read/${project.short_id}/${project.slug || 'essay'}` + url.search);
    const refreshTag = shouldRefreshToCanonical
      ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}">`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}${author ? ` — ${escapeHtml(author)}` : ''}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Hermes">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
  ${refreshTag}
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
