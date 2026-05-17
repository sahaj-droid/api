export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function escapeForJs(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function normalizeText(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function containsAny(text, words) {
  const t = String(text || '').toLowerCase();
  return words.some(word => t.includes(word));
}

export function extractNumber(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

export function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function renderMarkdown(text) {
  const escaped = escapeHtml(text).replace(/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|\s*$/gm, '');
  const withTables = escaped
    .replace(new RegExp(String.fromCharCode(96) + '{3}([\\s\\S]*?)' + String.fromCharCode(96) + '{3}', 'g'), '<pre>$1</pre>')
    .replace(/^\|(.+)\|$/gm, row => {
      const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
      return '<tr>' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
    })
    .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, block => '<table>' + block.replace(/^<tr>/, '<tr class="table-head">') + '</table>');
  return withTables
    .replace(/<tr class="table-head"><td>/g, '<tr><th>')
    .replace(/<tr><th>([\s\S]*?)<\/td><\/tr>/g, row => row.replace(/<\/td><td>/g, '</th><th>').replace(/<\/td><\/tr>/g, '</th></tr>'))
    .replace(new RegExp(String.fromCharCode(96) + '([^' + String.fromCharCode(96) + ']+)' + String.fromCharCode(96), 'g'), '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => '<ul>' + s + '</ul>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

export function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0F6E56;color:#e8f5f0;padding:8px 20px;border-radius:20px;font-size:13px;z-index:999;opacity:1;transition:opacity .4s;';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
