import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Copy, Download, Save, RefreshCw, Check, AlertCircle, ArrowLeft, Terminal, ShieldCheck, Wand2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { XMLParser } from 'fast-xml-parser';
import TerminalCard from '../components/TerminalCard';
import { storage } from '../utils/storage';
import { useLanguage } from '../contexts/LanguageContext';

const DEFAULT_TEMPLATE = {
  deviceID: '',
  algorithm: 'ECDSA',
  privateKey: '',
  publicKey: '',
  certificates: [''],
};

export default function Generator() {
  const [formData, setFormData] = useState(DEFAULT_TEMPLATE);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [source, setSource] = useState<'local' | 'cloud'>('local');
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    if (location.state?.keybox) {
      const { id, title, content, source } = location.state.keybox;
      setEditId(id);
      setTitle(title);
      setSource(source);
      parseXMLToForm(content);
    }
  }, [location.state]);

  const parseXMLToForm = (xml: string) => {
    try {
      const parser = new XMLParser();
      const jsonObj = parser.parse(xml);
      const kb = jsonObj?.AndroidAttestation?.Keybox;

      if (kb) {
        const certs = kb.CertificateChain?.Certificate 
          ? (Array.isArray(kb.CertificateChain.Certificate) ? kb.CertificateChain.Certificate : [kb.CertificateChain.Certificate])
          : [''];

        setFormData({
          deviceID: kb.DeviceID || '',
          algorithm: kb.KeyAlgorithm || 'ECDSA',
          privateKey: (kb.PrivateKey || '').trim(),
          publicKey: (kb.PublicKey || '').trim(),
          certificates: certs.map((c: string) => c.trim()),
        });
      }
    } catch (e) {
      console.error("Failed to parse existing XML", e);
    }
  };

  const generateXML = () => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<AndroidAttestation>
    <NumberOfKeyboxes>1</NumberOfKeyboxes>
    <Keybox>
        <KeyAlgorithm>${formData.algorithm}</KeyAlgorithm>
        <DeviceID>${formData.deviceID || 'PLACEHOLDER_DEVICE_ID'}</DeviceID>
        <PrivateKey>
${formData.privateKey || '<!-- Paste Private Key Here -->'}
        </PrivateKey>
        <PublicKey>
${formData.publicKey || '<!-- Paste Public Key Here -->'}
        </PublicKey>
        <CertificateChain>
${formData.certificates.map(cert => `            <Certificate>
${cert || '<!-- Paste Certificate Here -->'}
            </Certificate>`).join('\n')}
        </CertificateChain>
    </Keybox>
</AndroidAttestation>`;
  };

  const validateBeforeSave = () => {
    if (!title) return t('generator.required');
    if (!formData.deviceID || formData.deviceID.length < 5) return "Device ID is invalid or too short.";
    if (!formData.privateKey.includes("PRIVATE KEY")) return "Invalid Private Key format.";
    if (formData.certificates.some(c => c.length < 100)) return "One or more certificates appear invalid.";
    return null;
  };

  const handleSave = async () => {
    const error = validateBeforeSave();
    if (error) {
      setValidationError(error);
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const content = generateXML();
      const timestamp = new Date().toISOString();

      if (session?.user) {
        if (source === 'cloud' || !editId) {
            const payload = { user_id: session.user.id, title, content };
            if (editId) {
                await supabase.from('saved_keyboxes').update({ title, content }).eq('id', editId);
            } else {
                await supabase.from('saved_keyboxes').insert(payload);
            }
        } else {
             const payload = { id: editId, title, content, created_at: timestamp };
             storage.saveLocalKeybox(payload);
        }
      } else {
        const id = editId || crypto.randomUUID();
        const payload = { id, title, content, created_at: timestamp };
        storage.saveLocalKeybox(payload);
      }

      navigate('/');
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateXML());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([generateXML()], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'keybox'}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-20">
      <div className="space-y-6">
        <div>
          <button 
            onClick={() => navigate('/')}
            className="flex items-center text-xs text-slate-400 hover:text-emerald-400 mb-6 transition-colors font-bold uppercase tracking-wider bg-white/5 px-4 py-2 rounded-full w-fit"
          >
            <ArrowLeft className="h-3 w-3 mr-2" />
            {t('generator.back')}
          </button>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
            {editId ? t('generator.update') : t('generator.title')}
          </h1>
          <p className="text-slate-400 mt-1 font-mono text-xs md:text-sm">
            {t('generator.subtitle')}
          </p>
        </div>

        <TerminalCard>
          <div className="space-y-8">
            <div>
              <label className="block text-xs font-bold text-emerald-500 mb-3 uppercase tracking-widest">{t('generator.config_name')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Pixel 5 Config"
                className="w-full px-6 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none text-white placeholder-slate-600 transition-all font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-emerald-500 mb-3 uppercase tracking-widest">{t('generator.algorithm')}</label>
                <div className="relative">
                    <select
                    value={formData.algorithm}
                    onChange={(e) => setFormData({ ...formData, algorithm: e.target.value })}
                    className="w-full px-6 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none text-white font-mono text-sm appearance-none"
                    >
                    <option value="ECDSA">ECDSA (Recommended)</option>
                    <option value="RSA">RSA</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-emerald-500 mb-3 uppercase tracking-widest">{t('generator.device_id')}</label>
                <input
                  type="text"
                  value={formData.deviceID}
                  onChange={(e) => setFormData({ ...formData, deviceID: e.target.value })}
                  placeholder="Unique Device ID"
                  className="w-full px-6 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none text-white placeholder-slate-600 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-500 mb-3 uppercase tracking-widest">{t('generator.private_key')}</label>
              <textarea
                value={formData.privateKey}
                onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                placeholder={t('generator.placeholder_key')}
                className="w-full px-6 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none h-40 font-mono text-[10px] text-slate-300 placeholder-slate-700 resize-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-500 mb-3 uppercase tracking-widest">{t('generator.public_key')}</label>
              <textarea
                value={formData.publicKey}
                onChange={(e) => setFormData({ ...formData, publicKey: e.target.value })}
                placeholder="-----BEGIN PUBLIC KEY-----..."
                className="w-full px-6 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none h-40 font-mono text-[10px] text-slate-300 placeholder-slate-700 resize-none leading-relaxed"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="block text-xs font-bold text-emerald-500 uppercase tracking-widest">{t('generator.cert_chain')}</label>
                <button
                  onClick={() => setFormData({ ...formData, certificates: [...formData.certificates, ''] })}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-bold border border-emerald-500/30 px-3 py-1.5 rounded-full hover:bg-emerald-500/10 transition-colors uppercase tracking-wider flex items-center"
                >
                  <Wand2 className="h-3 w-3 mr-1" />
                  {t('generator.add_cert')}
                </button>
              </div>
              <div className="space-y-4">
                {formData.certificates.map((cert, idx) => (
                  <div key={idx} className="relative group">
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-8 bg-slate-800 rounded-full group-hover:bg-emerald-500/50 transition-colors" />
                    <textarea
                      value={cert}
                      onChange={(e) => {
                        const newCerts = [...formData.certificates];
                        newCerts[idx] = e.target.value;
                        setFormData({ ...formData, certificates: newCerts });
                      }}
                      placeholder={`Certificate ${idx + 1} (PEM)`}
                      className="w-full px-6 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none h-32 font-mono text-[10px] text-slate-300 placeholder-slate-700 resize-none leading-relaxed"
                    />
                    {formData.certificates.length > 1 && (
                      <button
                        onClick={() => {
                          const newCerts = formData.certificates.filter((_, i) => i !== idx);
                          setFormData({ ...formData, certificates: newCerts });
                        }}
                        className="absolute top-3 right-3 text-red-400 hover:text-red-300 bg-slate-900 rounded-xl p-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity border border-red-900/50 hover:bg-red-950/50"
                      >
                        <AlertCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TerminalCard>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Terminal className="h-5 w-5 mr-3 text-emerald-500" />
            {t('generator.preview')}
          </h2>
          <div className="flex space-x-2 w-full md:w-auto">
            <button
              onClick={handleCopy}
              className="flex-1 md:flex-none p-3 text-slate-400 hover:text-white bg-slate-800/50 border border-slate-700 rounded-2xl hover:border-emerald-500/50 transition-all hover:bg-slate-800 flex items-center justify-center"
              title={t('generator.copy')}
            >
              {copied ? <Check className="h-5 w-5 text-emerald-500" /> : <Copy className="h-5 w-5" />}
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 md:flex-none p-3 text-slate-400 hover:text-white bg-slate-800/50 border border-slate-700 rounded-2xl hover:border-emerald-500/50 transition-all hover:bg-slate-800 flex items-center justify-center"
              title={t('generator.download')}
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 font-bold tracking-wide hover:scale-105 active:scale-95"
            >
              {saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              <span>{editId ? t('generator.update') : t('generator.save')}</span>
            </button>
          </div>
        </div>

        {validationError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-2xl flex items-center animate-pulse">
                <AlertCircle className="h-5 w-5 mr-3" />
                <span className="font-bold text-sm">{validationError}</span>
            </div>
        )}

        <div className="bg-slate-950 rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden h-[500px] md:h-[calc(100vh-15rem)] sticky top-6 font-mono text-sm relative group">
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
             <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
             </div>
             <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">keybox.xml</span>
          </div>
          <pre className="p-4 md:p-8 text-emerald-400 overflow-auto h-full pb-24 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent text-xs leading-loose">
            {generateXML()}
          </pre>
          
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pointer-events-none flex flex-col justify-end items-center pb-8">
             <div className="flex items-center space-x-2 text-slate-500 bg-slate-900/80 px-4 py-2 rounded-full backdrop-blur-md border border-slate-800">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Auto-Validation Active</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
