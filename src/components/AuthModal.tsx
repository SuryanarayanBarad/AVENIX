import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Mail, Lock, User as UserIcon, Shield } from 'lucide-react';
import { authApi } from '../services/authApi';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

const modalEase = [0.22, 1, 0.36, 1] as const;

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const shouldReduceMotion = useReducedMotion();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      let res;
      if (mode === 'login') {
        res = await authApi.login({ email, password });
      } else {
        res = await authApi.register({ name, email, password });
      }
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const { url } = await authApi.googleGetAuthUrl();
      // Redirect the browser to Google's consent screen
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Google sign-in could not be completed. Please try again.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/[0.20] bg-[#12122b]/95 text-white shadow-2xl glass-panel-elevated backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="p-6 pb-4">
            <h3 className="font-bold text-xl font-display text-white text-center">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h3>
            <p className="text-xs text-white/60 text-center mt-1">
              {mode === 'login' ? 'Sign in to access the QueueMind Dashboard' : 'Sign up to manage operations'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 text-xs">
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-2.5 rounded-xl font-medium text-center">
                {error}
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-white/80 font-bold mb-1.5">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Julian Sarah"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-white/80 font-bold mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="name@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-white/80 font-bold mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                />
              </div>
            </div>

            {mode === 'register' && (
              <p className="flex items-start gap-2 rounded-2xl border border-white/[0.10] bg-white/[0.04] px-3.5 py-2.5 text-[11px] leading-relaxed text-white/60">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
                New accounts start as a visitor. Staff and clinical access is granted by an administrator.
              </p>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full px-5 py-3 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:opacity-90 text-white font-bold shadow-lg shadow-[#8e7dff]/30 cursor-pointer border border-white/20 disabled:opacity-50"
              >
                {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-white/[0.1]"></div>
              <span className="flex-shrink-0 mx-4 text-white/40 font-medium text-[10px] uppercase">or</span>
              <div className="flex-grow border-t border-white/[0.1]"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError('');
                }}
                className="text-white/60 hover:text-white font-medium underline decoration-white/30 hover:decoration-white transition-all cursor-pointer"
              >
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
