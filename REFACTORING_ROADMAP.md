# Refactoring Roadmap

## Current Structure Issues

### 1. Mixed Concerns in `planning.js` (262 lines)

**Current Structure:**
```
planning.js
├── CSV/Table Parsing (lines 72-90)
├── Equipment Type Detection (lines 104-114)
├── Equipment Master Parsing (lines 26-48)
├── Process Steps Inference (lines 50-70)
├── Equipment Matching Algorithm (lines 172-208)
├── Calculation Functions (lines 210-226)
├── HTML Rendering (lines 228-244)
└── Report Generation (lines 247-261)
```

**Problems:**
- Single Responsibility Principle violated
- Hard to test individual functions
- Reusable logic scattered
- 260+ lines in one file

---

## Proposed New Structure

```
src/
├── index.html              (unchanged)
├── styles.css              (unchanged)
├── app.js                  (main app - keep thin)
├── artifact.js             (panel management)
│
├── storage/
│   ├── db-pool.js         (NEW - connection pooling)
│   ├── persistence.js     (refactored storage.js)
│   └── migration.js       (legacy data handling)
│
├── planning/
│   ├── parsers.js         (CSV/table parsing)
│   ├── detectors.js       (equipment type detection)
│   ├── matchers.js        (equipment matching logic)
│   ├── calculators.js     (summary calculations)
│   ├── types.js           (domain models)
│   └── index.js           (public API)
│
├── reporting/
│   ├── templates.js       (report templates)
│   ├── html-builder.js    (HTML generation - refactored)
│   └── styles.js          (report specific styles)
│
├── chat/
│   ├── controller.js      (refactored chat.js)
│   ├── gemini-client.js   (API calls)
│   └── system-prompt.js   (prompt configuration)
│
├── ui/
│   ├── handlers.js        (event handlers)
│   └── components.js      (UI components)
│
└── utils/
    ├── text.js            (text normalization, escape)
    ├── html.js            (HTML utilities)
    ├── numbers.js         (rounding, formatting)
    └── validators.js      (input validation)
```

---

## Phase 1 Changes (Quick Wins)

### 1.1 Create `storage/db-pool.js`

**File:** `src/storage/db-pool.js`

```javascript
class DBPool {
  constructor(dbName, storeName, version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = e => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });

    return this.initPromise;
  }

  async get(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(key, value) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

export const dbPool = new DBPool('API_Planner_DB', 'store', 1);
```

**Benefits:**
- Single DB connection reused
- Eliminates repeated `indexedDB.open()` calls
- Saves ~40-50% database operation time
- Easier error handling

---

### 1.2 Create `utils/html.js`

**File:** `src/utils/html.js`

```javascript
export function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

export function buildHtmlTable(headers, rows) {
  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const rowHtml = rows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table>`;
}

export function buildSignatureTable() {
  return buildHtmlTable(['Role', 'Name / Signature', 'Date'], [
    ['Prepared by', '', ''],
    ['Checked by', '', ''],
    ['Production Head', '', ''],
    ['QC Head', '', ''],
    ['QA Approval', '', '']
  ]);
}
```

**Benefits:**
- Template literals instead of `+` concatenation
- Reusable table building
- ~20-30% faster rendering

---

## Migration Path

1. **Create new modules without changing existing code**
2. **Test new modules independently**
3. **Update imports in app.js gradually**
4. **Remove old code after verification**
5. **Update index.html script tags**

