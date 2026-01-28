import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileCode, Trash2, Download, Calendar, Loader2, Edit2, Cloud, HardDrive, Database, Upload, Layers } from 'lucide-react';
import { storage, KeyboxData } from '../utils/storage';
import TerminalCard from '../components/TerminalCard';
import ConfirmationModal from '../components/ConfirmationModal';
import { useLanguage } from '../contexts/LanguageContext';
import { motion } from 'framer-motion';
import { XMLParser } from 'fast-xml-parser';

export default function Dashboard() {
  const [keyboxes, setKeyboxes] = useState<KeyboxData[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; source: 'local' | 'cloud' | null }>({
    isOpen: false,
    id: null,
    source: null
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);

    const localData = storage.getLocalKeyboxes().map(k => ({ ...k, source: 'local' as const }));
    let allData = [...localData];

    if (session?.user) {
      try {
        const cloudData = await storage.getCloudKeyboxes();
        allData = [...allData, ...cloudData];
      } catch (e) {
        console.error("Cloud fetch error", e);
      }
    }

    allData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setKeyboxes(allData);
    setLoading(false);
  };

  const confirmDelete = (id: string, source: 'local' | 'cloud') => {
    setDeleteModal({ isOpen: true, id, source });
  };

  const handleDelete = async () => {
    const { id, source } = deleteModal;
    if (!id || !source) return;

    try {
      if (source === 'cloud') {
        const { error } = await supabase.from('saved_keyboxes').delete().eq('id', id);
        if (error) throw error;
      } else {
        storage.deleteLocalKeybox(id);
      }
      setKeyboxes(prev => prev.filter(k => k.id !== id));
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const handleEdit = (keybox: KeyboxData) => {
    navigate('/create', { state: { keybox } });
  };

  const handleDownload = (keybox: KeyboxData) => {
    const blob = new Blob([keybox.content], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${keybox.title.replace(/\s+/g, '_')}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const parser = new XMLParser();
        const jsonObj = parser.parse(content);
        if (!jsonObj.AndroidAttestation) throw new Error("Invalid Keybox XML");

        const newKeybox = {
          id: crypto.randomUUID(),
          title: file.name.replace('.xml', ''),
          content: content,
          created_at: new Date().toISOString()
        };
        storage.saveLocalKeybox(newKeybox);
        loadData(); 
      } catch (err) {
        alert("Failed to import: Invalid XML format");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
          <div className="font-mono text-emerald-500 animate-pulse">INITIALIZING SYSTEM...</div>
        </div>
      </div>
    );
  }

  const localCount = keyboxes.filter(k => k.source === 'local').length;
  const cloudCount = keyboxes.filter(k => k.source === 'cloud').length;

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Stats */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
            {user ? t('dashboard.welcome') : t('dashboard.welcome_guest')}
          </h1>
          <p className="text-slate-400 font-mono text-xs md:text-sm mb-6">
            {t('dashboard.subtitle')}
          </p>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl px-4 py-2 flex items-center space-x-3">
              <div className="bg-emerald-500/20 p-1.5 rounded-lg">
                <Layers className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">{t('stats.total')}</div>
                <div className="text-lg font-bold text-white leading-none">{keyboxes.length}</div>
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl px-4 py-2 flex items-center space-x-3">
              <div className="bg-amber-500/20 p-1.5 rounded-lg">
                <HardDrive className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">{t('stats.local')}</div>
                <div className="text-lg font-bold text-white leading-none">{localCount}</div>
              </div>
            </div>
            {user && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl px-4 py-2 flex items-center space-x-3">
                <div className="bg-blue-500/20 p-1.5 rounded-lg">
                  <Cloud className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">{t('stats.cloud')}</div>
                  <div className="text-lg font-bold text-white leading-none">{cloudCount}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full lg:w-auto">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            accept=".xml" 
            className="hidden" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 lg:flex-none group inline-flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 rounded-xl transition-all border border-slate-700 hover:border-slate-600"
          >
            <Upload className="h-5 w-5" />
            <span className="font-bold tracking-wide text-sm">{t('dashboard.import')}</span>
          </button>
          <Link
            to="/create"
            className="flex-1 lg:flex-none group inline-flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40"
          >
            <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
            <span className="font-bold tracking-wide text-sm">{t('dashboard.create_new')}</span>
          </Link>
        </div>
      </div>

      {keyboxes.length === 0 ? (
        <TerminalCard className="py-20 text-center border-dashed border-slate-800">
          <div className="bg-slate-800/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-slate-700">
            <Database className="h-10 w-10 text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{t('dashboard.empty_title')}</h3>
          <p className="text-slate-400 mb-8 font-mono text-sm max-w-md mx-auto">
            {t('dashboard.empty_desc')}
          </p>
        </TerminalCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {keyboxes.map((keybox, idx) => (
            <motion.div
              key={keybox.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <TerminalCard className="h-full flex flex-col hover:border-emerald-500/30 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-2.5 rounded-lg ${
                    keybox.source === 'cloud' 
                      ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' 
                      : 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'
                  }`}>
                    {keybox.source === 'cloud' ? <Cloud className="h-6 w-6" /> : <HardDrive className="h-6 w-6" />}
                  </div>
                  <div className="flex space-x-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(keybox)}
                      className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDownload(keybox)}
                      className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => confirmDelete(keybox.id, keybox.source)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="mb-4 flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      keybox.source === 'cloud' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {keybox.source === 'cloud' ? t('dashboard.cloud_storage') : t('dashboard.local_storage')}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white truncate font-mono">{keybox.title}</h3>
                  <div className="flex items-center text-xs text-slate-500 mt-1 font-mono">
                    <Calendar className="h-3 w-3 mr-1.5" />
                    {new Date(keybox.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="bg-slate-950/50 rounded-lg p-3 font-mono text-[10px] text-slate-500 overflow-hidden h-24 relative border border-slate-800/50">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/90 pointer-events-none" />
                  {keybox.content}
                </div>
              </TerminalCard>
            </motion.div>
          ))}
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
        onConfirm={handleDelete}
        title={t('modal.confirm_title')}
        message={t('modal.confirm_delete')}
        confirmText={t('modal.confirm')}
        cancelText={t('modal.cancel')}
        type="danger"
      />
    </div>
  );
}
