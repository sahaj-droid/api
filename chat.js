import { storage } from './storage.js';
import { renderMarkdown, showToast } from './utils.js';

const SYSTEM_PROMPT = 'You are an API manufacturing planning assistant. Focus on equipment mapping, production planning, process validation, cleaning validation, cycle-time reduction, bottleneck analysis, batch charging frequency and practical GMP documentation. Avoid drug monograph/regulatory filing sections unless explicitly asked.';

export class ChatController {
  constructor({ messagesEl, memoryEl, inputEl }) {
    this.messagesEl = messagesEl;
    this.memoryEl = memoryEl;
    this.inputEl = inputEl;
    this.history = storage.getChat();
    this.apiKey = storage.getKey();
  }

  init() {
    this.renderMemory();
    if (this.history.length) {
      this.messagesEl.innerHTML = '';
      this.history.slice(-20).forEach(m => this.addMessage(m.role, m.content, { persist: false }));
    }
  }

  setApiKey(key) {
    this.apiKey = key;
    storage.setKey(key);
  }

  addMessage(role, content, options = {}) {
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.remove();
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = role === 'user'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#5DCAA5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="#1D9E75" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = role === 'assistant' ? '<div class="tag">PLANNING ASSISTANT</div>' + content : content;
    div.appendChild(avatar);
    div.appendChild(bubble);
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    if (options.persist !== false) {
      this.history.push({ role, content: role === 'assistant' ? content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : content });
      storage.setChat(this.history);
      this.renderMemory();
    }
  }

  async send(text) {
    if (!text.trim()) return;
    if (!this.apiKey) {
      window.openSettings();
      return;
    }
    this.addMessage('user', text);
    const reply = await this.askGemini(text);
    this.addMessage('assistant', renderMarkdown(reply));
  }

  async askGemini(text) {
    const contents = this.history.slice(-12).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    contents.push({ role: 'user', parts: [{ text }] });
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=' + this.apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, generationConfig: { maxOutputTokens: 1600, temperature: 0.25 } })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
  }

  clear() {
    this.history = [];
    storage.clearChat();
    this.messagesEl.innerHTML = '<p style="text-align:center;color:#4d7a6a;font-size:14px;padding:40px 0;">Chat cleared. Ready for planning work.</p>';
    this.renderMemory();
  }

  renderMemory() {
    if (!this.memoryEl) return;
    const recent = this.history.filter(m => m.role === 'user').slice(-5).reverse();
    if (!recent.length) {
      this.memoryEl.innerHTML = '<div class="side-item"><strong>No saved work yet</strong><span>Your recent prompts are stored locally.</span></div>';
      return;
    }
    this.memoryEl.innerHTML = recent.map(m => '<div class="side-item"><strong>' + m.content.slice(0, 48) + (m.content.length > 48 ? '...' : '') + '</strong><span>Recent prompt</span></div>').join('');
  }
}
