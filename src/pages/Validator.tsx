import React, { useState } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { CheckCircle, XCircle, AlertTriangle, Upload, ShieldAlert, Activity, ShieldCheck, Search, Lock, Users } from 'lucide-react';
import TerminalCard from '../components/TerminalCard';
import { useLanguage } from '../contexts/LanguageContext';
import jsrsasign from 'jsrsasign';

interface ValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  info: Record<string, string>;
  revocationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  expiryStatus: 'VALID' | 'EXPIRED' | 'NEAR_EXPIRY';
  usageEstimate: string;
  strongIntegrityReady: boolean;
}

export default function Validator() {
  const [xmlContent, setXmlContent] = useState('');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const { t } = useLanguage();

  const parseCertificate = (pem: string) => {
    try {
      const cleanPem = pem.replace(/(-{5}BEGIN CERTIFICATE-{5})|(-{5}END CERTIFICATE-{5})|\n|\r/g, '');
      const cert = new jsrsasign.X509();
      cert.readCertPEM(pem);
      return {
        subject: cert.getSubjectString(),
        issuer: cert.getIssuerString(),
        notBefore: cert.getNotBefore(),
        notAfter: cert.getNotAfter(),
        serial: cert.getSerialNumberHex(),
      };
    } catch (e) {
      return null;
    }
  };

  const validateXML = (content: string) => {
    const parser = new XMLParser();
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: Record<string, string> = {};
    let score = 100;
    let strongIntegrityReady = true;

    try {
      const jsonObj = parser.parse(content);
      
      if (!jsonObj.AndroidAttestation) {
        errors.push(t('errors.missing_root'));
        score -= 50;
        strongIntegrityReady = false;
      } else {
        const root = jsonObj.AndroidAttestation;
        
        if (!root.Keybox) {
          errors.push(t('errors.missing_keybox'));
          score -= 50;
          strongIntegrityReady = false;
        } else {
          const kb = root.Keybox;
          
          if (!kb.KeyAlgorithm) {
            errors.push(t('errors.missing_algo'));
            score -= 10;
          } else {
            info["Algorithm"] = kb.KeyAlgorithm;
            if (kb.KeyAlgorithm !== 'ECDSA' && kb.KeyAlgorithm !== 'RSA') {
                warnings.push("Algorithm is non-standard. Play Integrity may reject it.");
                score -= 5;
                strongIntegrityReady = false;
            }
          }

          if (!kb.DeviceID) {
            errors.push(t('errors.missing_device_id'));
            score -= 20;
          } else {
            info["Device ID"] = kb.DeviceID;
            if (kb.DeviceID.length < 8) {
                warnings.push("Device ID is unusually short. Potential generic ID.");
                score -= 5;
            }
            if (['123456', 'deadbeef', 'pixel5', 'android'].includes(kb.DeviceID.toLowerCase())) {
                errors.push("Device ID is a known generic placeholder. High ban risk.");
                score -= 30;
                strongIntegrityReady = false;
            }
          }

          if (!kb.PrivateKey) {
            errors.push(t('errors.missing_priv_key'));
            score -= 20;
            strongIntegrityReady = false;
          } else {
             const pk = kb.PrivateKey.trim();
             if (pk.length < 100) {
                 errors.push(t('errors.key_length'));
                 score -= 10;
                 strongIntegrityReady = false;
             }
          }

          let expiryStatus: 'VALID' | 'EXPIRED' | 'NEAR_EXPIRY' = 'VALID';
          
          if (!kb.CertificateChain || !kb.CertificateChain.Certificate) {
            errors.push(t('errors.cert_chain_empty'));
            score -= 20;
            strongIntegrityReady = false;
          } else {
            const certs = Array.isArray(kb.CertificateChain.Certificate) 
              ? kb.CertificateChain.Certificate 
              : [kb.CertificateChain.Certificate];
            
            info["Chain Depth"] = `${certs.length} Certificates`;
            
            if (certs.length < 3) {
                warnings.push("Certificate chain is too short (Recommend 3+ for Strong Integrity).");
                score -= 10;
                strongIntegrityReady = false;
            }

            certs.forEach((c: string, i: number) => {
                const parsed = parseCertificate(c);
                if (parsed) {
                    if (i === 0) {
                        info["Leaf Cert Serial"] = parsed.serial.substring(0, 16) + "...";
                        info["Leaf Issuer"] = parsed.issuer.split(',')[0] || "Unknown";
                    }
                } else {
                    warnings.push(`Certificate ${i+1} could not be parsed. Format may be invalid.`);
                    score -= 5;
                }
            });
          }

          let revocationRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
          if (score < 60) revocationRisk = 'HIGH';
          else if (score < 85) revocationRisk = 'MEDIUM';

          const entropy = kb.DeviceID ? new Set(kb.DeviceID.split('')).size : 0;
          let usageEstimate = "Unique (Estimated)";
          if (entropy < 4) usageEstimate = "High Global Usage (Generic ID)";
          else if (revocationRisk === 'HIGH') usageEstimate = "Flagged / Leaked";

          setResult({
            valid: errors.length === 0,
            score: Math.max(0, score),
            errors,
            warnings,
            info,
            revocationRisk,
            expiryStatus,
            usageEstimate,
            strongIntegrityReady
          });
        }
      }
    } catch (e) {
      setResult({
        valid: false,
        score: 0,
        errors: ["XML Syntax Error: " + (e as Error).message],
        warnings: [],
        info: {},
        revocationRisk: 'HIGH',
        expiryStatus: 'VALID',
        usageEstimate: 'Unknown',
        strongIntegrityReady: false
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setXmlContent(content);
        validateXML(content);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">{t('validator.title')}</h1>
        <p className="text-slate-400 font-mono text-xs md:text-sm">{t('validator.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <div className="space-y-4">
          <TerminalCard className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <label className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center">
                <Search className="h-4 w-4 mr-2" />
                {t('validator.upload_label')}
              </label>
              <label className="cursor-pointer inline-flex items-center space-x-2 text-xs text-emerald-400 hover:text-white font-bold border border-emerald-500/30 px-4 py-2 rounded-full hover:bg-emerald-500/10 transition-all shadow-lg hover:shadow-emerald-500/20">
                <Upload className="h-3 w-3" />
                <span>{t('validator.upload_btn')}</span>
                <input type="file" accept=".xml" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <textarea
              value={xmlContent}
              onChange={(e) => {
                setXmlContent(e.target.value);
                if (e.target.value) validateXML(e.target.value);
                else setResult(null);
              }}
              placeholder={t('validator.paste_area')}
              className="w-full flex-1 px-4 py-4 md:px-6 bg-slate-950/50 border border-slate-800 rounded-3xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none font-mono text-[10px] md:text-xs text-slate-300 placeholder-slate-700 resize-none min-h-[300px] md:min-h-[500px] transition-all"
            />
          </TerminalCard>
        </div>

        <div className="space-y-6">
          {result ? (
            <div className="space-y-6">
              {/* Health Score Card - Optimized for Mobile */}
              <TerminalCard variant={result.valid ? (result.score > 80 ? 'success' : 'warning') : 'danger'}>
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6">
                  <div className="flex items-center space-x-5">
                    <div className={`p-4 rounded-full shrink-0 ${result.valid ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                        {result.valid ? (
                        result.score > 80 ? <ShieldCheck className="h-10 w-10 md:h-12 md:w-12 text-emerald-500" /> : <AlertTriangle className="h-10 w-10 md:h-12 md:w-12 text-amber-500" />
                        ) : (
                        <ShieldAlert className="h-10 w-10 md:h-12 md:w-12 text-red-500" />
                        )}
                    </div>
                    <div>
                      <h3 className={`text-xl md:text-2xl font-bold tracking-tight ${
                        result.valid ? 'text-white' : 'text-red-400'
                      }`}>
                        {result.valid ? t('validator.valid_title') : t('validator.invalid_title')}
                      </h3>
                      <p className="text-xs md:text-sm text-slate-400 mt-1 leading-relaxed">
                        {result.valid ? t('validator.valid_desc') : t('validator.invalid_desc')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Score Display */}
                  <div className="flex items-center justify-between md:block md:text-right bg-slate-950/30 md:bg-transparent p-4 md:p-0 rounded-2xl md:rounded-none border border-slate-800/50 md:border-none">
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest md:mb-1">{t('validator.health_score')}</div>
                    <div className={`text-4xl md:text-5xl font-bold font-mono tracking-tighter ${
                      result.score > 80 ? 'text-emerald-400' : result.score > 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {result.score}%
                    </div>
                  </div>
                </div>

                {/* Deep Analysis Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800/50 flex items-center justify-between md:block">
                        <div className="flex items-center space-x-2 mb-0 md:mb-2 text-slate-400">
                            <Lock className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Strong Integrity</span>
                        </div>
                        <div className={`text-sm font-bold ${result.strongIntegrityReady ? 'text-emerald-400' : 'text-red-400'}`}>
                            {result.strongIntegrityReady ? 'READY' : 'NOT COMPLIANT'}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800/50 flex items-center justify-between md:block">
                        <div className="flex items-center space-x-2 mb-0 md:mb-2 text-slate-400">
                            <Users className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Usage Estimate</span>
                        </div>
                        <div className="text-sm font-bold text-slate-200 text-right md:text-left">
                            {result.usageEstimate}
                        </div>
                    </div>
                </div>

                {/* Revocation Risk Indicator */}
                <div className="bg-slate-950/30 rounded-2xl p-5 border border-slate-800/50">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('validator.revoked_title')}</span>
                        <span className={`text-[10px] md:text-xs font-bold px-3 py-1 rounded-full ${
                            result.revocationRisk === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' :
                            result.revocationRisk === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-red-500/20 text-red-400'
                        }`}>{result.revocationRisk} RISK</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-1000 ease-out ${
                                result.revocationRisk === 'LOW' ? 'bg-emerald-500 w-1/12' :
                                result.revocationRisk === 'MEDIUM' ? 'bg-amber-500 w-1/2' :
                                'bg-red-500 w-full'
                            }`}
                        />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">{t('validator.revoked_desc')}</p>
                </div>
              </TerminalCard>

              {Object.keys(result.info).length > 0 && (
                <TerminalCard title={t('validator.details')} variant="info">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(result.info).map(([key, value]) => (
                      <div key={key} className="bg-blue-950/20 p-4 rounded-2xl border border-blue-900/20">
                        <div className="text-[10px] text-blue-300/70 uppercase tracking-wider mb-1 font-bold">{key}</div>
                        <div className="font-mono text-xs text-blue-200 font-medium truncate">{value}</div>
                      </div>
                    ))}
                  </div>
                </TerminalCard>
              )}

              {(result.errors.length > 0 || result.warnings.length > 0) && (
                <TerminalCard title={t('validator.fix_advice')} variant="warning">
                   <div className="space-y-3">
                    {result.errors.map((err, idx) => (
                      <div key={idx} className="flex items-start space-x-3 text-sm text-red-300 bg-red-950/30 px-5 py-4 rounded-2xl border border-red-900/30">
                        <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-red-400" />
                        <span className="leading-relaxed">{err}</span>
                      </div>
                    ))}
                    {result.warnings.map((warn, idx) => (
                      <div key={idx} className="flex items-start space-x-3 text-sm text-amber-300 bg-amber-950/30 px-5 py-4 rounded-2xl border border-amber-900/30">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-400" />
                        <span className="leading-relaxed">{warn}</span>
                      </div>
                    ))}
                   </div>
                </TerminalCard>
              )}
            </div>
          ) : (
            <TerminalCard className="h-full flex flex-col items-center justify-center text-center p-8 md:p-12 border-dashed border-slate-800 bg-slate-900/20">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
                <div className="bg-slate-900 w-24 h-24 rounded-full flex items-center justify-center ring-1 ring-slate-700 relative z-10">
                  <Activity className="h-10 w-10 text-slate-500" />
                </div>
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-white mb-3">{t('validator.analyzing')}</h3>
              <p className="text-slate-400 max-w-xs mx-auto text-xs md:text-sm leading-relaxed">
                {t('validator.paste_area')}
              </p>
            </TerminalCard>
          )}
        </div>
      </div>
    </div>
  );
}
