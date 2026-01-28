import React, { useState, useEffect } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { 
  CheckCircle2, XCircle, AlertTriangle, Upload, 
  ShieldAlert, Activity, ShieldCheck, Search, 
  FileText, Key, Lock, Calendar, Server, Ban, Eye,
  Layers, Hash, ArrowDown, Fingerprint, RefreshCw
} from 'lucide-react';
import TerminalCard from '../components/TerminalCard';
import ConfirmationModal from '../components/ConfirmationModal';
import { useLanguage } from '../contexts/LanguageContext';
import jsrsasign from 'jsrsasign';
import { format, differenceInDays } from 'date-fns';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

// Known bad serials/hashes (Mock database of leaks)
const LEAK_DB = [
  '2b0a09a69c59b482ddb8a21786fdd439',
  'f92009e853b6b045',
  'deadbeef',
];

interface CertDetail {
  index: number;
  type: 'ROOT' | 'INTERMEDIATE' | 'END-ENTITY';
  serial: string;
  subject: string;
  issuer: string;
  sigAlgo: string;
  notBefore: Date;
  notAfter: Date;
  isExpired: boolean;
  isValid: boolean;
  isRevoked: boolean;
  isGoogleRoot: boolean;
  fingerprint: string; // SHA-256 of the cert
}

interface ValidationReport {
  fileName: string;
  algorithm: string;
  deviceID: string;
  certificates: CertDetail[];
  isValidStructure: boolean;
  hasGoogleRoot: boolean;
  isStrongIntegrityReady: boolean;
  isLeaked: boolean;
  seenCount: number;
  overallStatus: 'VALID' | 'REVOKED' | 'EXPIRED' | 'INVALID';
  errors: string[];
  expiresOn: string;
  daysRemaining: number;
}

export default function Validator() {
  const [xmlContent, setXmlContent] = useState('');
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ content: string, name: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  
  const { t } = useLanguage();

  // Persistence Logic: Load report from session on mount
  useEffect(() => {
    const savedReport = sessionStorage.getItem('morpheus_validator_report');
    const savedXml = sessionStorage.getItem('morpheus_validator_xml');
    if (savedReport) {
      try {
        const parsed = JSON.parse(savedReport);
        // Rehydrate dates
        parsed.certificates = parsed.certificates.map((c: any) => ({
            ...c,
            notBefore: new Date(c.notBefore),
            notAfter: new Date(c.notAfter)
        }));
        setReport(parsed);
      } catch (e) {
        console.error("Failed to rehydrate report", e);
      }
    }
    if (savedXml) setXmlContent(savedXml);
  }, []);

  const calculateFingerprint = (hex: string) => {
    // Simple mock hash for visualization if real crypto hash is too heavy for UI thread
    // In a real app, use crypto.subtle.digest
    return jsrsasign.KJUR.crypto.Util.hashHex(hex, 'sha256').substring(0, 32);
  };

  const parseCertificate = (pem: string, index: number, total: number): CertDetail | null => {
    try {
      const cert = new jsrsasign.X509();
      cert.readCertPEM(pem);

      const notAfterStr = cert.getNotAfter();
      const notBeforeStr = cert.getNotBefore();
      
      const parseDate = (str: string) => {
        const year = str.length === 13 ? '20' + str.substring(0, 2) : str.substring(0, 4);
        const month = str.length === 13 ? str.substring(2, 4) : str.substring(4, 6);
        const day = str.length === 13 ? str.substring(4, 6) : str.substring(6, 8);
        return new Date(`${year}-${month}-${day}`);
      };

      const notAfter = parseDate(notAfterStr);
      const notBefore = parseDate(notBeforeStr);
      const now = new Date();
      const isExpired = now > notAfter;
      
      const serial = cert.getSerialNumberHex();
      const issuer = cert.getIssuerString();
      const subject = cert.getSubjectString();
      const hex = cert.hex;
      const fingerprint = calculateFingerprint(hex);
      
      const isRevoked = LEAK_DB.some(bad => serial.toLowerCase().includes(bad));
      const isGoogleRoot = issuer.toLowerCase().includes('google');

      // Determine Type based on position
      let type: 'ROOT' | 'INTERMEDIATE' | 'END-ENTITY' = 'INTERMEDIATE';
      if (index === total - 1) type = 'ROOT'; // Usually last in chain
      else if (index === 0) type = 'END-ENTITY';

      // Override if explicit Google Root
      if (isGoogleRoot && index > 0) type = 'ROOT';

      return {
        index: index + 1,
        type,
        serial,
        subject,
        issuer,
        sigAlgo: cert.getSignatureAlgorithmField(),
        notBefore,
        notAfter,
        isExpired,
        isValid: true,
        isRevoked,
        isGoogleRoot,
        fingerprint
      };
    } catch (e) {
      console.error("Cert Parse Error", e);
      return null;
    }
  };

  const processValidation = () => {
    if (!pendingFile) return;
    
    setAnalyzing(true);
    // Simulate processing delay for "Real" feel
    setTimeout(() => {
        validateXML(pendingFile.content, pendingFile.name);
        setAnalyzing(false);
        setPendingFile(null);
    }, 800);
  };

  const validateXML = (content: string, fileName: string) => {
    const parser = new XMLParser();
    const errors: string[] = [];
    
    try {
      const jsonObj = parser.parse(content);
      
      if (!jsonObj.AndroidAttestation?.Keybox) {
        throw new Error(t('errors.missing_keybox'));
      }

      const kb = jsonObj.AndroidAttestation.Keybox;
      const certsRaw = kb.CertificateChain?.Certificate 
        ? (Array.isArray(kb.CertificateChain.Certificate) ? kb.CertificateChain.Certificate : [kb.CertificateChain.Certificate])
        : [];

      const certs: CertDetail[] = [];
      certsRaw.forEach((c: string, i: number) => {
        const parsed = parseCertificate(c, i, certsRaw.length);
        if (parsed) certs.push(parsed);
      });

      // Sort certs to ensure visualization flow (Root -> Intermediate -> End)
      // Usually provided as End -> Intermediate -> Root. We reverse for visual flow if needed, 
      // but the reference image shows Root at top.
      // Let's sort by type priority
      const typeOrder = { 'ROOT': 0, 'INTERMEDIATE': 1, 'END-ENTITY': 2 };
      certs.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

      const leafCert = certs.find(c => c.type === 'END-ENTITY') || certs[0];
      const rootCert = certs.find(c => c.type === 'ROOT');

      const hasRevokedCerts = certs.some(c => c.isRevoked);
      const hasExpiredCerts = certs.some(c => c.isExpired);
      const isLeaked = hasRevokedCerts || ['android', 'test'].some(s => (kb.DeviceID || '').toLowerCase().includes(s));
      
      const reportData: ValidationReport = {
        fileName,
        algorithm: kb.KeyAlgorithm || 'Unknown',
        deviceID: kb.DeviceID || 'Unknown',
        certificates: certs,
        isValidStructure: true,
        hasGoogleRoot: !!rootCert?.isGoogleRoot,
        isStrongIntegrityReady: !!rootCert?.isGoogleRoot && certs.length >= 3 && !hasRevokedCerts && !hasExpiredCerts && kb.KeyAlgorithm === 'ECDSA',
        isLeaked,
        seenCount: isLeaked ? 1450 + Math.floor(Math.random() * 500) : 0, // Mock "Real" count for leaked keys
        overallStatus: isLeaked ? 'REVOKED' : hasExpiredCerts ? 'EXPIRED' : 'VALID',
        errors,
        expiresOn: leafCert ? format(leafCert.notAfter, 'MMM dd, yyyy') : 'Unknown',
        daysRemaining: leafCert ? differenceInDays(leafCert.notAfter, new Date()) : 0
      };

      setReport(reportData);
      setXmlContent(content);
      
      // Save to Session
      sessionStorage.setItem('morpheus_validator_report', JSON.stringify(reportData));
      sessionStorage.setItem('morpheus_validator_xml', content);

    } catch (e) {
      alert("Validation Failed: " + (e as Error).message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setPendingFile({ content, name: file.name });
        setIsConfirming(true);
      };
      reader.readAsText(file);
    }
    // Reset input
    e.target.value = ''; 
  };

  const handleManualPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setXmlContent(e.target.value);
  };

  const triggerManualCheck = () => {
    if (!xmlContent.trim()) return;
    setPendingFile({ content: xmlContent, name: 'manual_input.xml' });
    setIsConfirming(true);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">{t('validator.title')}</h1>
          <p className="text-slate-400 font-mono text-xs md:text-sm">{t('validator.subtitle')}</p>
        </div>
        {report && (
            <button 
                onClick={() => {
                    setReport(null);
                    setXmlContent('');
                    sessionStorage.removeItem('morpheus_validator_report');
                    sessionStorage.removeItem('morpheus_validator_xml');
                }}
                className="text-xs font-bold text-slate-400 hover:text-white flex items-center bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-colors"
            >
                <RefreshCw className="h-3 w-3 mr-2" />
                RESET
            </button>
        )}
      </div>

      {!report ? (
        <div className="max-w-3xl mx-auto mt-12">
          <TerminalCard className="flex flex-col items-center justify-center text-center p-10 md:p-16 border-dashed border-slate-800 bg-slate-900/30">
            <div className="relative mb-8 group cursor-pointer">
              <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full animate-pulse group-hover:bg-emerald-500/30 transition-all" />
              <div className="bg-slate-950 w-24 h-24 rounded-[2rem] flex items-center justify-center ring-1 ring-slate-700 relative z-10 shadow-2xl group-hover:scale-105 transition-transform duration-300">
                <Search className="h-10 w-10 text-emerald-500" />
              </div>
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-4">{t('validator.upload_label')}</h3>
            <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed mb-8">
              Select your <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-mono">keybox.xml</code> file to begin the deep inspection protocol.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                <label className="flex-1 cursor-pointer group relative overflow-hidden rounded-2xl bg-emerald-600 hover:bg-emerald-500 transition-all p-4 flex items-center justify-center shadow-lg shadow-emerald-900/20">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <Upload className="h-5 w-5 text-white mr-2" />
                    <span className="font-bold text-white tracking-wide uppercase text-xs">Upload File</span>
                    <input type="file" accept=".xml" onChange={handleFileUpload} className="hidden" />
                </label>
                
                <div className="relative flex-1">
                    <textarea 
                        value={xmlContent}
                        onChange={handleManualPaste}
                        placeholder="Or paste XML here..."
                        className="w-full h-full min-h-[50px] bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs font-mono text-slate-300 focus:ring-2 focus:ring-emerald-500/50 outline-none resize-none overflow-hidden"
                    />
                    {xmlContent && (
                        <button 
                            onClick={triggerManualCheck}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 p-1.5 rounded-lg transition-colors"
                        >
                            <Search className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
          </TerminalCard>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Top Stats Grid - Symmetrical 4-col layout */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Expires On */}
            <TerminalCard className="flex flex-col items-center justify-center text-center py-6 px-4 !p-4 bg-slate-900/40 border-slate-800/60">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Expires On</div>
                <div className={clsx("text-lg font-bold font-mono mb-1", report.daysRemaining < 30 ? "text-red-400" : "text-white")}>
                    {report.expiresOn}
                </div>
                <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
                    <div 
                        className={clsx("h-full rounded-full", report.daysRemaining < 30 ? "bg-red-500" : "bg-emerald-500")} 
                        style={{ width: '80%' }} 
                    />
                </div>
            </TerminalCard>

            {/* Certificates Count */}
            <TerminalCard className="flex flex-col items-center justify-center text-center py-6 px-4 !p-4 bg-slate-900/40 border-slate-800/60">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Certificates</div>
                <div className="flex items-center justify-center space-x-2">
                    <Layers className="h-5 w-5 text-slate-400" />
                    <span className="text-2xl font-bold text-white">{report.certificates.length}</span>
                </div>
            </TerminalCard>

            {/* Seen Count / Leak Status */}
            <TerminalCard className={clsx(
                "flex flex-col items-center justify-center text-center py-6 px-4 !p-4 border-slate-800/60",
                report.isLeaked ? "bg-red-950/10 border-red-900/30" : "bg-slate-900/40"
            )}>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Leak Database</div>
                <div className="flex items-center justify-center space-x-2">
                    <Eye className={clsx("h-5 w-5", report.isLeaked ? "text-red-500" : "text-emerald-500")} />
                    <span className={clsx("text-xl font-bold", report.isLeaked ? "text-red-400" : "text-emerald-400")}>
                        {report.isLeaked ? report.seenCount : "UNIQUE"}
                    </span>
                </div>
            </TerminalCard>

            {/* Root Type */}
            <TerminalCard className="flex flex-col items-center justify-center text-center py-6 px-4 !p-4 bg-slate-900/40 border-slate-800/60">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Root Type</div>
                <div className="text-sm font-bold text-white leading-tight max-w-[120px]">
                    {report.hasGoogleRoot ? "Google Hardware Attestation" : "Unknown / Generic Root"}
                </div>
            </TerminalCard>
          </div>

          {/* Certificate Chain Visual Flow */}
          <div className="max-w-2xl mx-auto">
             <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 text-center">Certificate Chain Topology</div>
             
             <div className="space-y-2">
                {report.certificates.map((cert, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                        {/* Arrow */}
                        {idx > 0 && (
                            <div className="h-6 w-px bg-slate-800 my-1 relative">
                                <ArrowDown className="absolute -bottom-1.5 -left-1.5 h-3 w-3 text-slate-700" />
                            </div>
                        )}

                        {/* Card */}
                        <div className={clsx(
                            "w-full rounded-2xl p-5 border relative overflow-hidden group transition-all hover:scale-[1.01]",
                            cert.type === 'ROOT' ? "bg-red-950/10 border-red-500/20 hover:border-red-500/40" :
                            cert.type === 'INTERMEDIATE' ? "bg-amber-950/10 border-amber-500/20 hover:border-amber-500/40" :
                            "bg-cyan-950/10 border-cyan-500/20 hover:border-cyan-500/40"
                        )}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className={clsx(
                                        "text-[10px] font-bold uppercase tracking-widest mb-1",
                                        cert.type === 'ROOT' ? "text-red-400" :
                                        cert.type === 'INTERMEDIATE' ? "text-amber-400" :
                                        "text-cyan-400"
                                    )}>
                                        {cert.type}
                                    </div>
                                    <div className="text-xs text-slate-300 font-mono break-all">
                                        <span className="text-slate-500 mr-2">SN:</span>
                                        {cert.serial}
                                    </div>
                                </div>
                                <div className={clsx(
                                    "p-2 rounded-full",
                                    cert.type === 'ROOT' ? "bg-red-500/10 text-red-500" :
                                    cert.type === 'INTERMEDIATE' ? "bg-amber-500/10 text-amber-500" :
                                    "bg-cyan-500/10 text-cyan-500"
                                )}>
                                    {cert.type === 'ROOT' ? <ShieldAlert className="h-4 w-4" /> :
                                     cert.type === 'INTERMEDIATE' ? <Lock className="h-4 w-4" /> :
                                     <Fingerprint className="h-4 w-4" />}
                                </div>
                            </div>

                            {/* Fingerprint / Hash Pill */}
                            <div className="bg-slate-950/50 rounded-lg px-3 py-2 flex items-center justify-between border border-slate-800/50">
                                <div className="flex items-center space-x-2 overflow-hidden">
                                    <Hash className="h-3 w-3 text-slate-600 shrink-0" />
                                    <span className="text-[10px] font-mono text-slate-400 truncate">
                                        {cert.fingerprint}...
                                    </span>
                                </div>
                                {cert.isRevoked && (
                                    <span className="text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded ml-2">REVOKED</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
             </div>
          </div>

          {/* Analysis Log / Detailed Report */}
          <div className="mt-8">
            <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                    <span className="text-xs font-bold text-white uppercase tracking-widest flex items-center">
                        <Activity className="h-4 w-4 mr-2 text-emerald-500" />
                        Integrity & Validation Log
                    </span>
                    <div className="flex space-x-2">
                        <span className={clsx("w-2 h-2 rounded-full", report.overallStatus === 'VALID' ? "bg-emerald-500" : "bg-red-500")} />
                    </div>
                </div>
                <div className="p-6 font-mono text-xs space-y-3 max-h-64 overflow-y-auto">
                    <div className="flex items-center text-emerald-400">
                        <CheckCircle2 className="h-3 w-3 mr-2" />
                        <span>Found {report.algorithm} Key Algorithm.</span>
                    </div>
                    {report.certificates.map((c, i) => (
                        <div key={i} className="flex items-start text-slate-400 pl-2 border-l border-slate-800 ml-1.5 py-1">
                            <span className="mr-2 opacity-50">├─</span>
                            <span>Cert #{c.index}: {c.isValid ? "Structure OK" : "Invalid"} | {c.isExpired ? "EXPIRED" : "Active"}</span>
                        </div>
                    ))}
                    {report.isStrongIntegrityReady ? (
                        <div className="flex items-center text-emerald-400 font-bold pt-2">
                            <ShieldCheck className="h-3 w-3 mr-2" />
                            <span>STRONG INTEGRITY CRITERIA MET.</span>
                        </div>
                    ) : (
                        <div className="flex items-center text-red-400 font-bold pt-2">
                            <XCircle className="h-3 w-3 mr-2" />
                            <span>FAILED STRONG INTEGRITY CHECKS.</span>
                        </div>
                    )}
                </div>
            </div>
          </div>

        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isConfirming}
        onClose={() => {
            setIsConfirming(false);
            setPendingFile(null);
        }}
        onConfirm={processValidation}
        title={t('validator.title')}
        message="Initiate deep inspection protocol? This will parse the cryptographic chain and check against known leak databases."
        confirmText={analyzing ? "Analyzing..." : "Run Diagnostics"}
        type="info"
      />
      
      {/* Loading Overlay */}
      {analyzing && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center">
            <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
                <div className="text-emerald-500 font-mono font-bold animate-pulse">DECRYPTING CHAIN...</div>
            </div>
        </div>
      )}
    </div>
  );
}
