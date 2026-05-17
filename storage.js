export const storage = {
  getChat() {
    return JSON.parse(localStorage.getItem('planning_chat_history') || '[]');
  },
  setChat(history) {
    localStorage.setItem('planning_chat_history', JSON.stringify(history.slice(-40)));
  },
  clearChat() {
    localStorage.removeItem('planning_chat_history');
  },
  getKey() {
    return localStorage.getItem('planning_gemini_key') || '';
  },
  setKey(key) {
    localStorage.setItem('planning_gemini_key', key);
  },
  getEquipmentMaster() {
    return localStorage.getItem('planning_equipment_master') || '';
  },
  setEquipmentMaster(text) {
    localStorage.setItem('planning_equipment_master', text);
  },
  clearEquipmentMaster() {
    localStorage.removeItem('planning_equipment_master');
  }
};
