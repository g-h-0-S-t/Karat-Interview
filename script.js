/* main app script for JS Interview Guide
   - safe marked renderer
   - highlight.js usage
   - mermaid rendering (non-module)
   - search with highlight and scroll
   - copy code buttons
*/

/* ============= README source(s) =============
 Primary: local uploaded file path (toolchain will transform if needed)
 Fallback: GitHub raw URL
*/
const README_SOURCE_PRIMARY = '/mnt/data/user_index_uploaded.html'; // <-- local path you uploaded earlier
const README_SOURCE_FALLBACK = 'https://raw.githubusercontent.com/g-h-0-S-t/JavaScript-Interview/main/README.md';

const contentEl = document.getElementById('content');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const pdfBtn = document.getElementById('pdfBtn');
const themeToggle = document.getElementById('themeToggle');
const mdCssLink = document.getElementById('md-css');
const hljsCssLink = document.getElementById('hljs-css');

/* ---------- theme handling ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (t === 'light') {
    if (mdCssLink) mdCssLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.1.0/github-markdown-light.min.css';
    if (hljsCssLink) hljsCssLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
  } else {
    if (mdCssLink) mdCssLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.1.0/github-markdown-dark.min.css';
    if (hljsCssLink) hljsCssLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
  }
}
const savedTheme = localStorage.getItem('site-theme') || 'dark';
applyTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('site-theme', next);
  applyTheme(next);
});

/* ---------- marked renderer (safe, returns strings only) ---------- */
marked.setOptions({ gfm: true, breaks: true });

function safeHighlight(code, lang) {
  const s = String(code || '');
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(s, { language: lang }).value;
    }
    return hljs.highlightAuto(s).value;
  } catch (e) {
    console.warn('highlight error', e);
    return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
}

const renderer = new marked.Renderer();

renderer.code = function(code, infostring) {
  const lang = (infostring || '').trim().toLowerCase();
  const text = String(code || '');
  if (lang === 'mermaid') {
    // mermaid prefers a div with the raw inner text
    return '<div class="mermaid">' + text + '</div>';
  }
  const highlighted = safeHighlight(text, lang);
  return '<pre><code class="hljs language-' + (lang || '') + '">' + highlighted + '</code></pre>';
};

renderer.codespan = function(text) {
  return '<code>' + String(text) + '</code>';
};
renderer.text = function(text) { return String(text); };
renderer.html = function(html) { return String(html); };

marked.use({ renderer });

/* ---------- render pipeline ---------- */
async function fetchReadme() {
  // Try primary (local uploaded path) first - toolchain can transform this path to an accessible URL
  const sources = [README_SOURCE_PRIMARY, README_SOURCE_FALLBACK];
  for (const src of sources) {
    try {
      const res = await fetch(src, { cache: 'no-store' });
      if (!res.ok) throw new Error('not ok');
      const txt = await res.text();
      return txt;
    } catch (e) {
      // try next source
      // console.debug('readme fetch failed for', src, e);
    }
  }
  throw new Error('All README fetch attempts failed');
}

async function renderReadme() {
  try {
    const md = await fetchReadme();
    window.__FULL_MD__ = md; // keep a copy for search
    contentEl.innerHTML = marked.parse(md);

    // highlight blocks and attach copy buttons (deferred to avoid blocking)
    requestAnimationFrame(() => {
      document.querySelectorAll('pre code').forEach(block => {
        try { hljs.highlightElement(block); } catch (e) {}
      });
      attachCopyButtons();
    });

    // render mermaid after DOM is painted
    requestAnimationFrame(() => {
      try {
        if (window.mermaid && typeof window.mermaid.init === 'function') {
          window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
        } else if (window.mermaid && typeof window.mermaid.run === 'function') {
          window.mermaid.run({ querySelector: '.mermaid' });
        }
      } catch (e) {
        console.warn('mermaid render failed', e);
      }
    });
  } catch (e) {
    console.error(e);
    contentEl.innerHTML = '<p class="muted">Failed to load content. Try reloading the page.</p>';
  }
}

/* ---------- copy buttons ---------- */
function attachCopyButtons() {
  document.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const codeEl = pre.querySelector('code');
      if (!codeEl) return;
      try {
        await navigator.clipboard.writeText(codeEl.innerText);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1200);
      } catch (err) {
        btn.textContent = 'Error';
        setTimeout(() => btn.textContent = 'Copy', 1200);
      }
    });
    pre.appendChild(btn);
  });
}

/* observe changes to attach copy buttons on dynamic updates */
const mo = new MutationObserver(() => attachCopyButtons());
mo.observe(contentEl, { childList: true, subtree: true });

/* ---------- search and highlight ---------- */
function clearMarks(root) {
  root.querySelectorAll('mark.search-hit').forEach(m => {
    const p = m.parentNode;
    p.replaceChild(document.createTextNode(m.textContent), m);
    p.normalize();
  });
}

function highlightMatches(root, query) {
  if (!query) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  let node;
  let first = null;
  const qLower = query.toLowerCase();
  while (node = walker.nextNode()) {
    const parent = node.parentNode;
    if (!parent || parent.closest('pre') || parent.closest('.mermaid')) continue;
    const text = node.nodeValue;
    const low = text.toLowerCase();
    let idx = low.indexOf(qLower);
    if (idx === -1) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (idx !== -1) {
      if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = text.slice(idx, idx + query.length);
      frag.appendChild(mark);
      if (!first) first = mark;
      last = idx + query.length;
      idx = text.toLowerCase().indexOf(qLower, last);
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    parent.replaceChild(frag, node);
  }
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

let searchTimer = null;
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (!window.__FULL_MD__) {
      // if content not available yet, just return
      return;
    }
    if (!q) {
      contentEl.innerHTML = marked.parse(window.__FULL_MD__);
      // re-run mermaid and attach buttons
      try { window.mermaid.init(undefined, contentEl.querySelectorAll('.mermaid')); } catch(e){}
      attachCopyButtons();
      return;
    }
    // simple chunked search: split by blank lines and return matching blocks
    const blocks = window.__FULL_MD__.split(/\n{2,}/).filter(b => b.toLowerCase().includes(q.toLowerCase()));
    const mdOut = blocks.join('\n\n') || `> No results for "${q}"`;
    contentEl.innerHTML = marked.parse(mdOut);
    try { window.mermaid.init(undefined, contentEl.querySelectorAll('.mermaid')); } catch(e){}
    attachCopyButtons();
    clearMarks(contentEl);
    highlightMatches(contentEl, q);
  }, 180);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  }
});
clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
});

/* ---------- PDF / print button ---------- */
pdfBtn.addEventListener('click', () => {
  window.print();
});

/* ---------- initial render ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // make sure highlight.js has default languages registered
  if (window.hljs && typeof hljs.highlightAll === 'function') {
    hljs.configure({ ignoreUnescapedHTML: true });
  }
  renderReadme();
});

/* Optional: register service worker if present */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker && navigator.serviceWorker.register('/sw.js').catch(e => {
      // do not break app if sw registration fails
      console.warn('sw register failed', e);
    });
  });
}
