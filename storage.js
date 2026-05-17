const DB_NAME = 'API_Planner_DB';
const STORE_NAME = 'store';
const VERSION = 1;

let cache = {
  chat_history: [],
  gemini_key: '',
  equipment_master: '',
  pv_template: '',
  pv_template_docx: null,
  dynamic_vars: {}
};

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      const keysReq = store.getAllKeys();
      
      tx.oncomplete = () => {
        const values = req.result;
        const keys = keysReq.result;
        
        // Migrate from localStorage if IndexedDB is empty
        if (keys.length === 0) {
           const legacyChat = localStorage.getItem('planning_chat_history');
           if (legacyChat) { cache.chat_history = JSON.parse(legacyChat); saveToDB('chat_history', cache.chat_history); }
           
           const legacyKey = localStorage.getItem('planning_gemini_key');
           if (legacyKey) { cache.gemini_key = legacyKey; saveToDB('gemini_key', legacyKey); }
           
           const legacyEq = localStorage.getItem('api_planner_equipment_master');
           if (legacyEq) { cache.equipment_master = legacyEq; saveToDB('equipment_master', legacyEq); }
           
           const legacyPv = localStorage.getItem('api_planner_pv_template');
           if (legacyPv) { cache.pv_template = legacyPv; saveToDB('pv_template', legacyPv); }
           
           cache.dynamic_vars = {};
           saveToDB('dynamic_vars', {});
        } else {
           for (let i=0; i<keys.length; i++) {
             cache[keys[i]] = values[i];
           }
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function saveToDB(key, value) {
  const request = indexedDB.open(DB_NAME, VERSION);
  request.onsuccess = e => {
    const db = e.target.result;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
  };
}

function deleteFromDB(key) {
  const request = indexedDB.open(DB_NAME, VERSION);
  request.onsuccess = e => {
    const db = e.target.result;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  };
}

export const storage = {
  init: initDB,
  getChat() { return Array.isArray(cache.chat_history) ? cache.chat_history : []; },
  setChat(history) {
    const sliced = history.slice(-40);
    cache.chat_history = sliced;
    saveToDB('chat_history', sliced);
  },
  clearChat() {
    cache.chat_history = [];
    deleteFromDB('chat_history');
  },
  getKey() { return cache.gemini_key || ''; },
  setKey(key) {
    cache.gemini_key = key;
    saveToDB('gemini_key', key);
  },
  getEquipmentMaster() { return cache.equipment_master || ''; },
  setEquipmentMaster(text) {
    cache.equipment_master = text;
    saveToDB('equipment_master', text);
  },
  clearEquipmentMaster() {
    cache.equipment_master = '';
    deleteFromDB('equipment_master');
  },
  getPvTemplate() { return cache.pv_template || ''; },
  setPvTemplate(text) {
    cache.pv_template = text;
    saveToDB('pv_template', text);
  },
  clearPvTemplate() {
    cache.pv_template = '';
    deleteFromDB('pv_template');
    cache.pv_template_docx = null;
    deleteFromDB('pv_template_docx');
  },
  getPvTemplateDocx() { return cache.pv_template_docx || null; },
  setPvTemplateDocx(buffer) {
    cache.pv_template_docx = buffer;
    saveToDB('pv_template_docx', buffer);
  },
  getDynamicVars() { return cache.dynamic_vars || {}; },
  setDynamicVar(key, value) {
    const vars = cache.dynamic_vars || {};
    vars[key] = value;
    cache.dynamic_vars = vars;
    saveToDB('dynamic_vars', vars);
  }
};
