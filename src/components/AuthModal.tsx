import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Mail, Lock, User as UserIcon, Shield, Plus, ArrowRight } from 'lucide-react';
import { authApi } from '../services/authApi';
import { wakeServer } from '../services/apiClient';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

const modalEase = [0.22, 1, 0.36, 1] as const;

/**
 * Sign in / create account.
 *
 * Styled from the Preclinic UI kit — light surface, deep indigo primary, teal
 * accent, 6px corners, Inter — using the --pc-* tokens in index.css, which were
 * read out of the Figma file itself rather than eyeballed from a screenshot.
 *
 * The behaviour underneath is unchanged and entirely ours, not the kit's: the
 * same endpoints, the same VISITOR-only registration rule and its notice, the
 * same Google flow, the same cold-start handling.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const shouldReduceMotion = useReducedMotion();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * How long the request in flight has been running: 0 normal, 1 slow, 2 very
   * slow. A sleeping free-tier instance takes tens of seconds to restart, and a
   * button that only ever says "Processing..." is indistinguishable from one
   * that has hung. Saying what is happening is the difference between waiting
   * and giving up.
   */
  const [waitStage, setWaitStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (!loading) {
      setWaitStage(0);
      return;
    }
    const slow = setTimeout(() => setWaitStage(1), 4_000);
    const verySlow = setTimeout(() => setWaitStage(2), 15_000);
    return () => {
      clearTimeout(slow);
      clearTimeout(verySlow);
    };
  }, [loading]);

  // Opening the modal is the earliest reliable signal that credentials are
  // coming, so start the server waking while the form is still being filled in.
  useEffect(() => {
    if (isOpen) wakeServer();
  }, [isOpen]);

  const busyLabel = waitStage === 2
    ? 'Still waking the server...'
    : waitStage === 1
      ? 'Waking the server...'
      : 'Processing...';

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

  const isRegister = mode === 'register';

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0F1330]/55 p-4 backdrop-blur-sm"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: modalEase }}
        onClick={onClose}
      >
        <motion.div
          className="pc w-full max-w-[400px] overflow-hidden pc-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-title"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: modalEase }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Brand header — the kit's indigo, with its teal accent on the mark */}
          <div className="relative overflow-hidden bg-[var(--pc-primary)] px-6 pt-6 pb-7 text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[var(--pc-accent)]/25 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-10 bottom-[-3rem] h-28 w-28 rounded-full bg-white/10 blur-2xl"
            />

            <div className="relative flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/25">
                <Plus className="h-5 w-5 text-[var(--pc-accent)]" strokeWidth={3} />
              </span>
              <span className="text-base font-bold tracking-tight">QueueMind</span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: modalEase }}
                className="relative mt-4"
              >
                <h3 id="auth-title" className="text-xl font-bold tracking-tight">
                  {isRegister ? 'Create your account' : 'Welcome back'}
                </h3>
                <p className="mt-1 text-xs text-white/70">
                  {isRegister
                    ? 'Sign up to book appointments and track your visit.'
                    : 'Sign in to continue to your dashboard.'}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6 text-sm text-[var(--pc-text)]">
            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  role="alert"
                  initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: modalEase }}
                  className="overflow-hidden"
                >
                  <p className="rounded-md border border-[var(--pc-tint-rose)] bg-[#FEF3F2] px-3.5 py-2.5 text-[13px] font-medium text-[var(--pc-danger)]">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {isRegister && (
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
                  className="overflow-hidden"
                >
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-[var(--pc-text)]">Full name</span>
                    <span className="relative block">
                      <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pc-border-strong)]" />
                      <input
                        type="text"
                        required={isRegister}
                        autoComplete="name"
                        placeholder="e.g. Julian Sarah"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pc-input w-full py-3 pl-10 pr-4 text-sm"
                      />
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--pc-text)]">Email address</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pc-border-strong)]" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pc-input w-full rounded-xl py-3 pl-10 pr-4 text-sm"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--pc-text)]">Password</span>
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pc-border-strong)]" />
                <input
                  type="password"
                  required
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pc-input w-full rounded-xl py-3 pl-10 pr-4 text-sm"
                />
              </span>
            </label>

            <AnimatePresence initial={false}>
              {isRegister && (
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
                  className="overflow-hidden"
                >
                  <p className="flex items-start gap-2 rounded-md bg-[var(--pc-tint-lilac)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--pc-text-muted)]">
                    <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pc-primary)]" />
                    New accounts start as a visitor. Staff and clinical access is granted by an administrator.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="pc-btn-primary group flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold cursor-pointer"
              >
                <span>{loading ? busyLabel : isRegister ? 'Create account' : 'Sign in'}</span>
                {!loading && (
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                )}
              </button>

              <AnimatePresence initial={false}>
                {loading && waitStage > 0 && (
                  <motion.p
                    initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: modalEase }}
                    className="mt-2.5 text-center text-[11px] leading-relaxed text-[var(--pc-text-muted)]"
                  >
                    {waitStage === 2
                      ? 'This host sleeps when nobody is using it. The first request wakes it, which can take up to a minute — nothing has been lost.'
                      : 'Free hosting pauses when idle. Hang on a few seconds while it starts back up.'}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-grow bg-[var(--pc-border)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pc-text-muted)]">or</span>
              <span className="h-px flex-grow bg-[var(--pc-border)]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="pc-btn-ghost flex w-full items-center justify-center gap-3 px-5 py-3 text-sm font-medium cursor-pointer disabled:opacity-60"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <p className="pt-1 text-center text-xs text-[var(--pc-text-muted)]">
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(isRegister ? 'login' : 'register');
                  setError('');
                }}
                className="font-bold text-[var(--pc-primary)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-[var(--pc-primary)] cursor-pointer"
              >
                {isRegister ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
