import { createClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'qrvault_local_items';
const CONFIG_KEY = 'qrvault_config';

// Default config from Vite env vars if present, otherwise localStorage
function getStoredConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        url: parsed.url || envUrl,
        key: parsed.key || envKey
      };
    }
  } catch (e) {
    console.error('Failed to read config', e);
  }

  return { url: envUrl, key: envKey };
}

let supabaseClient = null;

export function initSupabaseClient() {
  const config = getStoredConfig();
  if (config.url && config.key && config.url.startsWith('http')) {
    try {
      supabaseClient = createClient(config.url, config.key);
      return supabaseClient;
    } catch (err) {
      console.warn('Invalid Supabase configuration:', err);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
  }
  return null;
}

// Initial initialization
initSupabaseClient();

export function isCloudConfigured() {
  const config = getStoredConfig();
  return Boolean(config.url && config.key && config.url.trim() && config.key.trim());
}

export function getConfig() {
  return getStoredConfig();
}

export function saveConfig(url, key) {
  const cleanUrl = url.trim();
  const cleanKey = key.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: cleanUrl, key: cleanKey }));
  initSupabaseClient();
}

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

// Test Supabase connection
export async function testConnection(url, key) {
  if (!url || !key) return { success: false, error: 'Παρακαλώ συμπληρώστε URL και Key' };
  try {
    const client = createClient(url.trim(), key.trim());
    const { data, error } = await client.from('qr_codes').select('id').limit(1);
    if (error) {
      // Check if table missing
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return { 
          success: false, 
          error: 'Ο πίνακας "qr_codes" δεν βρέθηκε στη βάση. Εκτελέστε το SQL script που παρέχεται παρακάτω.' 
        };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Αποτυχία σύνδεσης' };
  }
}

// Get copyable SQL script for user
export function getSupabaseSql() {
  return `-- Δημιουργία πίνακα qr_codes στο Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ενεργοποίηση Row Level Security (RLS) και ελεύθερη πρόσβαση με το Anon Key
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public full access" ON public.qr_codes
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Δημιουργία ευρετηρίου για ταχύτατη ταξινόμηση
CREATE INDEX IF NOT EXISTS qr_codes_order_idx ON public.qr_codes (order_index ASC, created_at DESC);
`;
}

// Cloud & Local DB Operations

export async function fetchAllQRs() {
  let localList = getLocalItems();

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('qr_codes')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetch error, using local fallback:', error);
        return localList;
      }

      if (data) {
        // Update local items with cloud items
        setLocalItems(data);
        return data;
      }
    } catch (e) {
      console.warn('Supabase fetch exception, using local:', e);
    }
  }

  // Sort local items by order_index
  return localList.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

export async function addQR({ name, content }) {
  const currentList = getLocalItems();
  const type = detectType(content);
  // Calculate next order index (bottom of the list or top)
  const nextOrderIndex = currentList.length > 0 
    ? Math.max(...currentList.map(item => item.order_index ?? 0)) + 1 
    : 0;

  const newItem = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'qr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    name: name.trim() || 'Χωρίς όνομα',
    content: content.trim(),
    type,
    order_index: nextOrderIndex,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // 1. Optimistic Local Save
  const updatedList = [...currentList, newItem];
  setLocalItems(updatedList);

  // 2. Cloud Save
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('qr_codes')
        .insert([{
          id: newItem.id,
          name: newItem.name,
          content: newItem.content,
          type: newItem.type,
          order_index: newItem.order_index,
          created_at: newItem.created_at,
          updated_at: newItem.updated_at
        }])
        .select()
        .single();

      if (error) {
        console.error('Supabase add error:', error);
      } else if (data) {
        // Re-sync local with cloud result
        const refreshed = updatedList.map(item => item.id === newItem.id ? data : item);
        setLocalItems(refreshed);
        return data;
      }
    } catch (err) {
      console.error('Supabase insert exception:', err);
    }
  }

  return newItem;
}

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

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('qr_codes')
        .update({
          name: updatedItem.name,
          content: updatedItem.content,
          type: updatedItem.type,
          updated_at: now
        })
        .eq('id', id);

      if (error) {
        console.error('Supabase update error:', error);
      }
    } catch (err) {
      console.error('Supabase update exception:', err);
    }
  }

  return updatedItem;
}

export async function deleteQR(id) {
  const currentList = getLocalItems();
  const filtered = currentList.filter(i => i.id !== id);
  setLocalItems(filtered);

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('qr_codes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase delete error:', error);
      }
    } catch (err) {
      console.error('Supabase delete exception:', err);
    }
  }

  return true;
}

export async function saveOrder(orderedItems) {
  // Update order_index sequentially
  const itemsWithNewIndex = orderedItems.map((item, index) => ({
    ...item,
    order_index: index,
    updated_at: new Date().toISOString()
  }));

  setLocalItems(itemsWithNewIndex);

  if (supabaseClient) {
    try {
      // Upsert order changes to Supabase in background
      const updates = itemsWithNewIndex.map(item => ({
        id: item.id,
        name: item.name,
        content: item.content,
        type: item.type,
        order_index: item.order_index,
        created_at: item.created_at,
        updated_at: item.updated_at
      }));

      const { error } = await supabaseClient
        .from('qr_codes')
        .upsert(updates, { onConflict: 'id' });

      if (error) {
        console.error('Supabase batch order update error:', error);
      }
    } catch (err) {
      console.error('Supabase batch order update exception:', err);
    }
  }

  return itemsWithNewIndex;
}

// Sync local items up to Supabase if Supabase was empty
export async function syncLocalToCloud() {
  if (!supabaseClient) return { success: false, error: 'Δεν έχει ρυθμιστεί το Supabase' };
  try {
    const local = getLocalItems();
    if (local.length === 0) return { success: true, count: 0 };

    const { error } = await supabaseClient
      .from('qr_codes')
      .upsert(local, { onConflict: 'id' });

    if (error) throw error;
    return { success: true, count: local.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
