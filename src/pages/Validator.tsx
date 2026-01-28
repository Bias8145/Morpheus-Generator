import React, { useState, useEffect, useRef } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { 
  CheckCircle2, XCircle, AlertTriangle, Upload, 
  ShieldAlert, Activity, ShieldCheck, Search, 
  FileText, Key, Lock, Calendar, Server, Ban, Eye,
  Layers, Hash, ArrowDown, Fingerprint, RefreshCw,
  Terminal as TerminalIcon, Cpu, ChevronRight, AlertOctagon
} from 'lucide-react';
import TerminalCard from '../components/TerminalCard';
import ConfirmationModal from '../components/ConfirmationModal';
import { useLanguage } from '../contexts/LanguageContext';
import jsrsasign from 'jsrsasign';
import { format, differenceInDays } from 'date-fns';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// Mock Database of known leaked serials (Publicly known generic/test keys)
const LEAK_DB = [
  '2b0a09a69c59b482ddb8a21786fdd439', // Common generic
  'f92009e853b6b045', // Test key
  'deadbeef',
  '0c8684c66d5c3f63c2d2494b72b82d50',
  '1e016753308a01c036070b9916296a27'
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
  fingerprint: string;
  rawSubject: string;
  rawIssuer: string;
}

interface LogEntry {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: string;
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
  overallStatus: 'VALID' | 'REVOKED' | 'EXPIRED' | 'INVALID' | 'WEAK';
  logs: LogEntry[];
  expiresOn: string;
  daysRemaining: number;
}

export default function Validator() {
  const [xmlContent, setXmlContent] = useState('');
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ content: string, name: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const { t } = useLanguage();

  useEffect(() => {
    const savedReport = sessionStorage.getItem('morpheus_validator_report_v2');
    const savedXml = sessionStorage.getItem('morpheus_validator_xml_v2');
    if (savedReport) {
      try {
        const parsed = JSON.parse(savedReport);
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

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [report?.logs]);

  const addLog = (logs: LogEntry[], type: LogEntry['type'], message: string) => {
    logs.push({
      type,
      message,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false })
    });
  };

  const calculateFingerprint = (hex: string) => {
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

      // Determine Type logic
      let type: 'ROOT' | 'INTERMEDIATE' | 'END-ENTITY' = 'INTERMEDIATE';
      
      // Heuristic: Google Root is usually self-signed or specific issuer
      if (isGoogleRoot && issuer === subject) type = 'ROOT';
      else if (index === 0) type = 'END-ENTITY'; // First in XML is usually leaf
      else if (index === total - 1) type = 'ROOT'; // Last is usually root

      return {
        index: index + 1,
        type,
        serial,
        subject: subject.split(',')[0].replace('CN=', '').replace('OU=', ''), // Simplified for UI
        rawSubject: subject,
        issuer: issuer.split(',')[0].replace('CN=', '').replace('OU=', ''),
        rawIssuer: issuer,
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
    setTimeout(() => {
        validateXML(pendingFile.content, pendingFile.name);
        setAnalyzing(false);
        setPendingFile(null);
    }, 1200); // Cinematic delay
  };

  const validateXML = (content: string, fileName: string) => {
    const parser = new XMLParser();
    const logs: LogEntry[] = [];
    
    try {
      addLog(logs, 'info', `Initialized analysis for: ${fileName}`);
      
      const jsonObj = parser.parse(content);
      
      if (!jsonObj.AndroidAttestation?.Keybox) {
        throw new Error(t('errors.missing_keybox'));
      }

      const kb = jsonObj.AndroidAttestation.Keybox;
      const algo = kb.KeyAlgorithm || 'Unknown';
      const deviceID = kb.DeviceID || 'Unknown';

      addLog(logs, 'info', `Device ID: ${deviceID}`);
      
      if (algo === 'ECDSA') {
        addLog(logs, 'success', 'Found ECDSA Key Algorithm.');
      } else {
        addLog(logs, 'warning', `Algorithm is ${algo}. ECDSA is recommended for Strong Integrity.`);
      }

      const certsRaw = kb.CertificateChain?.Certificate 
        ? (Array.isArray(kb.CertificateChain.Certificate) ? kb.CertificateChain.Certificate : [kb.CertificateChain.Certificate])
        : [];

      addLog(logs, 'info', `Parsing ${certsRaw.length} certificates in chain...`);

      const certs: CertDetail[] = [];
      certsRaw.forEach((c: string, i: number) => {
        const parsed = parseCertificate(c, i, certsRaw.length);
        if (parsed) {
            certs.push(parsed);
            addLog(logs, 'info', `Cert #${i+1}: Serial ${parsed.serial.substring(0, 8)}...`);
            if (parsed.isExpired) addLog(logs, 'error', `Cert #${i+1} is EXPIRED.`);
            if (parsed.isRevoked) addLog(logs, 'error', `Cert #${i+1} is REVOKED (Known Leak).`);
        }
      });

      // Sort for visualization: Root -> Intermediate -> Leaf
      // But for XML logic, usually Leaf is first.
      // We want to display Root at top.
      const typeOrder = { 'ROOT': 0, 'INTERMEDIATE': 1, 'END-ENTITY': 2 };
      const sortedCerts = [...certs].sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

      const leafCert = certs.find(c => c.type === 'END-ENTITY') || certs[0];
      const rootCert = certs.find(c => c.type === 'ROOT') || certs[certs.length - 1];

      const hasRevokedCerts = certs.some(c => c.isRevoked);
      const hasExpiredCerts = certs.some(c => c.isExpired);
      const isLeaked = hasRevokedCerts || LEAK_DB.some(s => deviceID.includes(s));
      const hasGoogleRoot = !!rootCert?.isGoogleRoot;

      if (hasGoogleRoot) addLog(logs, 'success', 'Google Hardware Attestation Root verified.');
      else addLog(logs, 'warning', 'No Google Root detected. May fail hardware attestation.');

      let status: ValidationReport['overallStatus'] = 'VALID';
      if (isLeaked) status = 'REVOKED';
      else if (hasExpiredCerts) status = 'EXPIRED';
      else if (algo !== 'ECDSA' || !hasGoogleRoot) status = 'WEAK';

      if (status === 'VALID') addLog(logs, 'success', 'Chain valid. Strong Integrity criteria met.');
      else if (status === 'REVOKED') addLog(logs, 'error', 'CRITICAL: Keybox is LEAKED/REVOKED.');
      else if (status === 'WEAK') addLog(logs, 'warning', 'Chain valid but weak (RSA or Non-Google Root).');

      const reportData: ValidationReport = {
        fileName,
        algorithm: algo,
        deviceID,
        certificates: sortedCerts,
        isValidStructure: true,
        hasGoogleRoot,
        isStrongIntegrityReady: status === 'VALID',
        isLeaked,
        seenCount: isLeaked ? 999 : 0,
        overallStatus: status,
        logs,
        expiresOn: leafCert ? format(leafCert.notAfter, 'MMM dd, yyyy') : 'Unknown',
        daysRemaining: leafCert ? differenceInDays(leafCert.notAfter, new Date()) : 0
      };

      setReport(reportData);
      setXmlContent(content);
      
      sessionStorage.setItem('morpheus_validator_report_v2', JSON.stringify(reportData));
      sessionStorage.setItem('morpheus_validator_xml_v2', content);

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
    e.target.value = ''; 
  };

  const triggerManualCheck = () => {
    if (!xmlContent.trim()) return;
    setPendingFile({ content: xmlContent, name: 'manual_input.xml' });
    setIsConfirming(true);
  };

  return (
    <div className="space-y-8 pb-24">
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
                    sessionStorage.removeItem('morpheus_validator_report_v2');
                    sessionStorage.removeItem('morpheus_validator_xml_v2');
                }}
                className="text-xs font-bold text-slate-400 hover:text-white flex items-center bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-colors"
            >
                <RefreshCw className="h-3 w-3 mr-2" />
                NEW CHECK
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
                    <span className="font-bold text-white tracking-wide uppercase text-xs">{t('validator.upload_btn')}</span>
                    <input type="file" accept=".xml" onChange={handleFileUpload} className="hidden" />
                </label>
                
                <div className="relative flex-1">
                    <textarea 
                        value={xmlContent}
                        onChange={(e) => setXmlContent(e.target.value)}
                        placeholder={t('validator.paste_area')}
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
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Status Banner */}
          <div className={clsx(
            "rounded-[2rem] p-8 md:p-10 border flex flex-col md:flex-row items-center justify-between relative overflow-hidden",
            report.overallStatus === 'VALID' ? "bg-emerald-950/20 border-emerald-500/30" : 
            report.overallStatus === 'REVOKED' ? "bg-red-950/20 border-red-500/30" :
            "bg-amber-950/20 border-amber-500/30"
          )}>
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay" />
            
            <div className="flex items-center space-x-6 relative z-10">
                <div className={clsx(
                    "w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl ring-1 ring-white/10",
                    report.overallStatus === 'VALID' ? "bg-emerald-500 text-emerald-950" : 
                    report.overallStatus === 'REVOKED' ? "bg-red-500 text-red-950" :
                    "bg-amber-500 text-amber-950"
                )}>
                    {report.overallStatus === 'VALID' ? <ShieldCheck className="h-10 w-10" /> : 
                     report.overallStatus === 'REVOKED' ? <Ban className="h-10 w-10" /> :
                     <AlertOctagon className="h-10 w-10" />}
                </div>
                <div>
                    <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">{t('validator.result_summary')}</div>
                    <h2 className={clsx(
                        "text-3xl md:text-5xl font-black tracking-tight",
                        report.overallStatus === 'VALID' ? "text-emerald-400" : 
                        report.overallStatus === 'REVOKED' ? "text-red-400" :
                        "text-amber-400"
                    )}>
                        {report.overallStatus}
                    </h2>
                    <p className="text-slate-400 text-sm mt-2 font-mono">
                        {report.isStrongIntegrityReady 
                            ? "Ready for Strong Integrity. No anomalies detected." 
                            : report.overallStatus === 'REVOKED' 
                                ? "Keybox is compromised. Do not use." 
                                : "Keybox has issues. Check logs below."}
                    </p>
                </div>
            </div>

            <div className="mt-6 md:mt-0 relative z-10 text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Confidence Score</div>
                <div className="text-4xl font-mono font-bold text-white">
                    {report.overallStatus === 'VALID' ? '100%' : '0%'}
                </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <TerminalCard className="bg-slate-900/40 border-slate-800/60 !p-5">
                <div className="flex items-center space-x-3 mb-3">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiration</span>
                </div>
                <div className={clsx("text-lg font-bold font-mono", report.daysRemaining < 30 ? "text-red-400" : "text-white")}>
                    {report.expiresOn}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{report.daysRemaining} days remaining</div>
            </TerminalCard>

            <TerminalCard className="bg-slate-900/40 border-slate-800/60 !p-5">
                <div className="flex items-center space-x-3 mb-3">
                    <Cpu className="h-4 w-4 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Algorithm</span>
                </div>
                <div className="text-lg font-bold font-mono text-white">
                    {report.algorithm}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{report.algorithm === 'ECDSA' ? 'Recommended' : 'Legacy'}</div>
            </TerminalCard>

            <TerminalCard className="bg-slate-900/40 border-slate-800/60 !p-5">
                <div className="flex items-center space-x-3 mb-3">
                    <Eye className="h-4 w-4 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Leak Status</span>
                </div>
                <div className={clsx("text-lg font-bold font-mono", report.isLeaked ? "text-red-400" : "text-emerald-400")}>
                    {report.isLeaked ? "LEAKED" : "UNIQUE"}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{report.isLeaked ? "Publicly known" : "No matches found"}</div>
            </TerminalCard>

            <TerminalCard className="bg-slate-900/40 border-slate-800/60 !p-5">
                <div className="flex items-center space-x-3 mb-3">
                    <ShieldAlert className="h-4 w-4 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Root Trust</span>
                </div>
                <div className="text-lg font-bold font-mono text-white truncate" title={report.hasGoogleRoot ? "Google Hardware Attestation" : "Unknown"}>
                    {report.hasGoogleRoot ? "Google HW" : "Generic"}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{report.hasGoogleRoot ? "Trusted Root" : "Untrusted Root"}</div>
            </TerminalCard>
          </div>

          {/* Certificate Chain & Logs Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Left: Chain Visual */}
             <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Certificate Chain Topology</h3>
                    <div className="text-[10px] font-mono text-slate-600">{report.certificates.length} Nodes</div>
                </div>

                <div className="space-y-0 relative">
                    {/* Vertical Line */}
                    <div className="absolute left-8 top-8 bottom-8 w-px bg-slate-800 z-0" />

                    {report.certificates.map((cert, idx) => (
                        <div key={idx} className="relative z-10 group">
                            <div className={clsx(
                                "ml-0 rounded-2xl p-5 border mb-4 transition-all hover:translate-x-1",
                                cert.type === 'ROOT' ? "bg-slate-900/80 border-red-500/20 hover:border-red-500/40" :
                                cert.type === 'INTERMEDIATE' ? "bg-slate-900/80 border-amber-500/20 hover:border-amber-500/40" :
                                "bg-slate-900/80 border-cyan-500/20 hover:border-cyan-500/40"
                            )}>
                                <div className="flex items-start gap-4">
                                    <div className={clsx(
                                        "w-16 h-16 rounded-xl flex items-center justify-center shrink-0 font-bold text-xl shadow-lg",
                                        cert.type === 'ROOT' ? "bg-red-500/10 text-red-500" :
                                        cert.type === 'INTERMEDIATE' ? "bg-amber-500/10 text-amber-500" :
                                        "bg-cyan-500/10 text-cyan-500"
                                    )}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className={clsx(
                                                    "text-[10px] font-bold uppercase tracking-widest mb-0.5",
                                                    cert.type === 'ROOT' ? "text-red-400" :
                                                    cert.type === 'INTERMEDIATE' ? "text-amber-400" :
                                                    "text-cyan-400"
                                                )}>
                                                    {cert.type} NODE
                                                </div>
                                                <div className="text-sm font-bold text-white truncate">{cert.subject}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">Issuer: {cert.issuer}</div>
                                            </div>
                                            {cert.isRevoked && (
                                                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase">Revoked</span>
                                            )}
                                        </div>
                                        
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <div className="bg-slate-950 rounded px-2 py-1 text-[10px] font-mono text-slate-400 border border-slate-800">
                                                SN: {cert.serial.substring(0, 12)}...
                                            </div>
                                            <div className="bg-slate-950 rounded px-2 py-1 text-[10px] font-mono text-slate-400 border border-slate-800">
                                                {cert.sigAlgo}
                                            </div>
                                            <div className="bg-slate-950 rounded px-2 py-1 text-[10px] font-mono text-slate-400 border border-slate-800">
                                                Exp: {format(cert.notAfter, 'yyyy-MM-dd')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {idx < report.certificates.length - 1 && (
                                <div className="ml-8 w-px h-4 bg-slate-800 mx-auto" />
                            )}
                        </div>
                    ))}
                </div>
             </div>

             {/* Right: Terminal Log */}
             <div className="lg:col-span-1">
                <div className="sticky top-6">
                    <div className="flex items-center justify-between px-2 mb-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Execution Log</h3>
                        <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
                    </div>
                    <div className="bg-slate-950 rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl h-[500px] flex flex-col">
                        <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-800 flex items-center space-x-2">
                            <TerminalIcon className="h-4 w-4 text-slate-500" />
                            <span className="text-[10px] font-mono text-slate-400">root@morpheus:~# check_integrity</span>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
                            {report.logs.map((log, i) => (
                                <div key={i} className="flex items-start space-x-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                                    <span className={clsx(
                                        log.type === 'success' ? "text-emerald-400" :
                                        log.type === 'error' ? "text-red-400" :
                                        log.type === 'warning' ? "text-amber-400" :
                                        "text-slate-300"
                                    )}>
                                        {log.type === 'success' && '✅ '}
                                        {log.type === 'error' && '❌ '}
                                        {log.type === 'warning' && '⚠️ '}
                                        {log.type === 'info' && 'ℹ️ '}
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
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
        confirmText={analyzing ? "Initializing..." : "Run Diagnostics"}
        type="info"
      />
      
      {/* Loading Overlay */}
      {analyzing && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[110] flex items-center justify-center">
            <div className="flex flex-col items-center max-w-sm text-center px-6">
                <div className="relative mb-8">
                    <div className="w-24 h-24 border-4 border-slate-800 rounded-full" />
                    <div className="absolute inset-0 w-24 h-24 border-4 border-t-emerald-500 border-r-emerald-500/50 border-b-transparent border-l-transparent rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ShieldCheck className="h-8 w-8 text-emerald-500 animate-pulse" />
                    </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Decrypting Chain...</h3>
                <p className="text-slate-400 text-sm font-mono">
                    Verifying cryptographic signatures and checking revocation lists.
                </p>
                <div className="mt-6 w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 animate-[loading_1.5s_ease-in-out_infinite]" style={{ width: '50%' }} />
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
