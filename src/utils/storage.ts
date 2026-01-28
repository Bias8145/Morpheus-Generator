// Hybrid Storage Utility
import { supabase } from '../lib/supabase';

export interface KeyboxData {
  id: string;
  title: string;
  content: string;
  created_at: string;
  source: 'local' | 'cloud';
}

export const storage = {
  // Local Storage Methods
  getLocalKeyboxes: (): KeyboxData[] => {
    try {
      const data = localStorage.getItem('morpheus_local_keyboxes');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveLocalKeybox: (keybox: Omit<KeyboxData, 'source'>) => {
    const current = storage.getLocalKeyboxes();
    const existingIndex = current.findIndex(k => k.id === keybox.id);
    
    let updated;
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...keybox, source: 'local' };
    } else {
      updated = [{ ...keybox, source: 'local' }, ...current];
    }
    
    localStorage.setItem('morpheus_local_keyboxes', JSON.stringify(updated));
    return updated;
  },

  deleteLocalKeybox: (id: string) => {
    const current = storage.getLocalKeyboxes();
    const updated = current.filter(k => k.id !== id);
    localStorage.setItem('morpheus_local_keyboxes', JSON.stringify(updated));
    return updated;
  },

  // Cloud Storage Methods (Supabase)
  getCloudKeyboxes: async (): Promise<KeyboxData[]> => {
    const { data, error } = await supabase
      .from('saved_keyboxes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return (data || []).map(k => ({ ...k, source: 'cloud' }));
  }
};
