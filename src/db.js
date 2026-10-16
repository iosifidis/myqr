const STORAGE_KEY = 'qrvault_local_items';

// Local Storage helpers
function getLocalItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading localStorage', e);
    return [];
  }
}

function setLocalItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Error saving to localStorage', e);
  }
}

// Helper to generate unique ID
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'qr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

// Detect QR type helper
export function detectType(content) {
  if (!content) return 'text';
  const trimmed = content.trim();
  if (/^https?:\/\//i.test(trimmed)) return 'url';
  if (/^mailto:/i.test(trimmed) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';
  if (/^tel:/i.test(trimmed) || /^\+?[0-9\s-]{7,15}$/.test(trimmed)) return 'phone';
  if (/^WIFI:/i.test(trimmed)) return 'wifi';
  if (/^BEGIN:VCARD/i.test(trimmed)) return 'vcard';
  if (/^geo:/i.test(trimmed)) return 'location';
  return 'text';
}

// Fetch all QR codes sorted by order_index
export async function fetchAllQRs() {
  const localList = getLocalItems();
  return localList.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

// Add a new QR code
export async function addQR({ name, content }) {
  const currentList = getLocalItems();
  const type = detectType(content);
  
  const nextOrderIndex = currentList.length > 0 
    ? Math.max(...currentList.map(item => item.order_index ?? 0)) + 1 
    : 0;

  const newItem = {
    id: generateId(),
    name: name.trim() || 'Χωρίς όνομα',
    content: content.trim(),
    type,
    order_index: nextOrderIndex,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const updatedList = [...currentList, newItem];
  setLocalItems(updatedList);
  return newItem;
}

// Update existing QR code
export async function updateQR(id, { name, content }) {
  const currentList = getLocalItems();
  const type = detectType(content);
  const now = new Date().toISOString();

  const itemIndex = currentList.findIndex(i => i.id === id);
  if (itemIndex === -1) return null;

  const updatedItem = {
    ...currentList[itemIndex],
    name: name.trim() || 'Χωρίς όνομα',
    content: content.trim(),
    type,
    updated_at: now
  };

  currentList[itemIndex] = updatedItem;
  setLocalItems(currentList);
  return updatedItem;
}

// Delete a QR code
export async function deleteQR(id) {
  const currentList = getLocalItems();
  const filtered = currentList.filter(i => i.id !== id);
  setLocalItems(filtered);
  return true;
}

// Clear all QR codes
export async function clearAllQRs() {
  setLocalItems([]);
  return true;
}

// Save reordered items
export async function saveOrder(orderedItems) {
  const itemsWithNewIndex = orderedItems.map((item, index) => ({
    ...item,
    order_index: index,
    updated_at: new Date().toISOString()
  }));

  setLocalItems(itemsWithNewIndex);
  return itemsWithNewIndex;
}

// Export backup data as formatted JSON string
export function exportBackupData() {
  const items = getLocalItems().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: items.length,
    items
  };
}

// Import backup data (supports array or backup object)
export async function importBackupData(rawContent) {
  let parsed;
  if (typeof rawContent === 'string') {
    parsed = JSON.parse(rawContent);
  } else {
    parsed = rawContent;
  }

  const list = Array.isArray(parsed) 
    ? parsed 
    : (parsed.items || parsed.qrCodes || parsed.data || []);

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Το αρχείο δεν περιέχει έγκυρα δεδομένα QR codes.');
  }

  let addedCount = 0;
  for (const item of list) {
    if (!item) continue;
    const name = (item.name || item.title || 'Εισαγόμενο QR').trim();
    const content = (item.content || item.url || item.text || item.value || '').trim();
    if (content) {
      await addQR({ name, content });
      addedCount++;
    }
  }

  if (addedCount === 0) {
    throw new Error('Δεν βρέθηκαν έγκυρα QR codes με περιεχόμενο στο αρχείο.');
  }

  return { success: true, count: addedCount };
}
