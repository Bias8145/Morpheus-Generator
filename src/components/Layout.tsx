import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  LayoutDashboard, FileCode, CheckCircle, LogOut, Menu, X, 
  Globe, DatabaseZap, LogIn, Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { useLanguage } from '../contexts/LanguageContext';

export default function Layout() {
  const [user, setUser] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const navItems = [
    { label: t('app.nav_dashboard'), path: '/', icon: LayoutDashboard },
    { label: t('app.nav_generator'), path: '/create', icon: FileCode },
    { label: t('app.nav_validator'), path: '/validate', icon: CheckCircle },
  ];

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'id' : 'en');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center sticky top-0 z-50 rounded-b-3xl shadow-lg">
        <div className="flex items-center space-x-2 font-bold text-xl tracking-tight">
          <DatabaseZap className="h-6 w-6 text-emerald-500" />
          <span className="font-mono tracking-widest text-white">MORPHEUS</span>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Mobile Language Switcher */}
          <button 
            onClick={toggleLanguage}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-emerald-400 hover:bg-slate-700 transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="uppercase">{language}</span>
          </button>

          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-slate-300 p-2 rounded-full hover:bg-white/5 active:bg-white/10 transition-colors">
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={clsx(
        "bg-slate-900/50 backdrop-blur-xl border-r border-slate-800 w-full md:w-80 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out md:h-screen md:sticky md:top-0 z-40 fixed inset-0 md:relative",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-8 hidden md:flex items-center space-x-3 font-bold text-3xl tracking-tighter">
          <div className="relative group cursor-pointer">
            <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 rounded-full group-hover:opacity-40 transition-opacity"></div>
            <DatabaseZap className="h-10 w-10 text-emerald-500 relative z-10" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono tracking-[0.2em] text-white leading-none">MORPHEUS</span>
            <span className="text-[9px] text-slate-500 font-mono tracking-widest mt-1 uppercase">Generator & DB</span>
          </div>
        </div>

        {/* Status Bar */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between bg-slate-950/50 rounded-full px-4 py-3 border border-slate-800 shadow-inner">
            <div className="flex items-center space-x-2">
              <div className={clsx("w-2 h-2 rounded-full animate-pulse", isOnline ? "bg-emerald-500" : "bg-red-500")} />
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                {isOnline ? t('app.status_online') : t('app.status_offline')}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={clsx(
                  "group flex items-center space-x-4 px-6 py-4 rounded-[2rem] transition-all duration-300 relative overflow-hidden",
                  isActive 
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/40" 
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className={clsx("h-5 w-5 transition-transform group-hover:scale-110", isActive && "text-white")} />
                <span className="font-medium tracking-wide text-sm">{item.label}</span>
                {isActive && <Zap className="absolute right-4 h-4 w-4 text-white/30 animate-pulse" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 mt-auto space-y-4">
          {/* Desktop Language Switcher - Hidden on Mobile since it's in header */}
          <button 
            onClick={toggleLanguage}
            className="hidden md:flex w-full items-center justify-between px-5 py-3 rounded-2xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 transition-all group"
          >
            <div className="flex items-center space-x-3">
              <Globe className="h-4 w-4" />
              <span className="text-xs font-bold tracking-wide">LANGUAGE / BAHASA</span>
            </div>
            <span className="text-xs font-mono bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 group-hover:text-white transition-colors">
              {language.toUpperCase()}
            </span>
          </button>

          <div className="bg-slate-900/80 rounded-[2rem] p-5 border border-slate-800">
            {user ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                    {user.email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono text-emerald-400 truncate tracking-wider">OPERATOR_ID</div>
                    <div className="text-xs truncate text-slate-300 font-medium">{user.email}</div>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center space-x-2 px-4 py-3 w-full rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors border border-red-500/20 text-xs font-bold tracking-wide uppercase"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{t('app.sign_out')}</span>
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-[10px] font-mono text-slate-500 mb-4 uppercase tracking-widest">{t('app.guest_mode')}</div>
                <Link
                  to="/login"
                  className="flex items-center justify-center space-x-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-2xl transition-all shadow-lg shadow-emerald-900/20 group"
                >
                  <LogIn className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  <span className="text-xs font-bold tracking-wide uppercase">{t('app.sign_in')}</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Background Grid Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-transparent to-slate-950 pointer-events-none" />
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto relative z-10 min-h-[calc(100vh-8rem)]">
            <Outlet />
          </div>
          
          {/* Footer */}
          <footer className="max-w-7xl mx-auto mt-12 py-6 border-t border-slate-800/50 flex flex-col md:flex-row justify-between items-center text-slate-500 text-[10px] md:text-xs font-mono uppercase tracking-wider">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <DatabaseZap className="h-4 w-4 text-slate-600" />
              <span>Morpheus System v4.0</span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span>Integrity Engine</span>
            </div>
            <div className="flex items-center space-x-6">
              <span className="hover:text-emerald-400 cursor-pointer transition-colors">Privacy Protocol</span>
              <span className="hover:text-emerald-400 cursor-pointer transition-colors">Documentation</span>
              <span className="hover:text-emerald-400 cursor-pointer transition-colors">Support</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
