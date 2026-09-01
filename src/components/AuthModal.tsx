import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Mail, Lock, User as UserIcon, Shield, Eye, EyeOff, X } from 'lucide-react';
import { authApi } from '../services/authApi';
import { wakeServer } from '../services/apiClient';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  /**
   * Why a previous attempt failed, when there was one. Surfaced here because a
   * Google sign-in that fails redirects back to a fresh page load, so the
   * component that started it no longer exists to report anything.
   */
  notice?: string | null;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

const modalEase = [0.22, 1, 0.36, 1] as const;

/**
 * Sign in / create account.
 *
 * Laid out to match the kit's Login and Register screens, read from the Figma
 * file rather than eyeballed: a lavender illustration half beside a white form
 * half, a 448px form column, 36px inputs on 6px corners with #9DA4B0
 * placeholders, Inter 700/20 heading, 500/14 labels, a 38px primary button.
 *
 * The behaviour is entirely ours. Two controls the kit shows are deliberately
 * absent — "Remember Me" and "Forgot password?" — because neither has anything
 * behind it here, and a control that does nothing is worse than one that is not
 * there.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, notice = null, onClose, onLoginSuccess }) => {
  const shouldReduceMotion = useReducedMotion();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');

  // A failed Google sign-in comes back as a fresh page load, so the reason
  // arrives as a prop rather than from anything this component did. Seeding the
  // existing banner keeps one error surface instead of two.
  useEffect(() => {
    if (isOpen && notice) setError(notice);
  }, [isOpen, notice]);
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
  const fieldClass = 'pc-input h-9 w-full pl-9 text-sm';

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A1B39]/45 backdrop-blur-sm sm:p-4"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: modalEase }}
        onClick={onClose}
      >
        <motion.div
          className="pc relative flex h-full w-full overflow-hidden bg-[var(--pc-surface)] sm:h-auto sm:max-h-[92vh] sm:w-auto sm:rounded-[20px] sm:border sm:border-[var(--pc-border)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-title"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.985 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: modalEase }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Illustration half — the kit's lavender panel. It steps aside below
              lg, where the screen belongs entirely to the form. */}
          <div className="hidden w-[360px] shrink-0 flex-col justify-center bg-[var(--pc-illustration)] p-10 lg:flex">
            <svg viewBox="0 0 260 230" className="w-full" role="img" aria-label="A hospital reception with a queue of patients">
              <rect x="42" y="54" width="176" height="126" rx="6" fill="#FFFFFF" />
              <rect x="42" y="54" width="176" height="26" rx="6" fill="var(--pc-primary)" />
              <rect x="122" y="26" width="16" height="42" rx="3" fill="var(--pc-primary)" />
              <rect x="109" y="39" width="42" height="16" rx="3" fill="var(--pc-accent)" />
              {[0, 1, 2].map((row) => (
                [0, 1, 2, 3].map((col) => (
                  <rect
                    key={`${row}-${col}`}
                    x={57 + col * 38}
                    y={94 + row * 26}
                    width="26"
                    height="16"
                    rx="3"
                    fill={(row + col) % 3 === 0 ? 'var(--pc-tint-lilac)' : '#F1F2F7'}
                  />
                ))
              ))}
              <rect x="112" y="152" width="36" height="28" rx="3" fill="var(--pc-primary)" opacity="0.14" />
              {[0, 1, 2].map((i) => (
                <g key={i} transform={`translate(${62 + i * 34}, 192)`} opacity={1 - i * 0.22}>
                  <circle cx="0" cy="0" r="7" fill="var(--pc-primary)" />
                  <rect x="-8" y="9" width="16" height="18" rx="8" fill="var(--pc-primary)" />
                </g>
              ))}
              <rect x="170" y="186" width="46" height="30" rx="4" fill="#FFFFFF" stroke="var(--pc-border)" />
              <rect x="178" y="194" width="30" height="4" rx="2" fill="var(--pc-accent)" />
              <rect x="178" y="203" width="20" height="4" rx="2" fill="var(--pc-border-strong)" />
            </svg>
            <p className="mt-8 text-sm leading-relaxed text-[var(--pc-text-muted)]">
              Book an appointment, take a queue token, and follow your place in
              the line from your phone.
            </p>
          </div>

          {/* Form half */}
          <div className="flex w-full flex-col overflow-y-auto bg-[var(--pc-surface)] px-6 py-8 sm:w-[448px] sm:px-10">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-md p-1.5 text-[var(--pc-text-subtle)] transition-colors hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Brand mark, in the kit's own four-lobe shape */}
            <div className="mb-7 flex items-center justify-center gap-2">
              <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
                <rect x="3" y="11" width="11" height="10" rx="5" fill="var(--pc-primary)" />
                <rect x="11" y="3" width="10" height="11" rx="5" fill="var(--pc-primary)" />
                <rect x="18" y="11" width="11" height="10" rx="5" fill="var(--pc-accent)" />
                <rect x="11" y="18" width="10" height="11" rx="5" fill="var(--pc-primary)" />
              </svg>
              <span className="text-xl font-bold tracking-tight text-[var(--pc-text)]">QueueMind</span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: modalEase }}
                className="text-center"
              >
                <h3 id="auth-title" className="text-xl font-bold text-[var(--pc-text)]">
                  {isRegister ? 'Register' : 'Sign In'}
                </h3>
                <p className="mt-1 text-sm text-[var(--pc-text-muted)]">
                  {isRegister
                    ? 'Please enter your details to create account'
                    : 'Please enter below details to access the dashboard'}
                </p>
              </motion.div>
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
                    <p className="rounded-md border border-[var(--pc-tint-rose)] bg-[#FEF3F2] px-3.5 py-2.5 text-sm font-medium text-[var(--pc-danger)]">
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
                      <span className="mb-1.5 block text-sm font-medium text-[var(--pc-text)]">Full Name</span>
                      <span className="relative block">
                        <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pc-text)]" />
                        <input
                          type="text"
                          required={isRegister}
                          autoComplete="name"
                          placeholder="Enter Name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className={`${fieldClass} pr-3`}
                        />
                      </span>
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--pc-text)]">Email Address</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pc-text)]" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Enter Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${fieldClass} pr-3`}
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--pc-text)]">Password</span>
                <span className="relative block">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pc-text)]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    // Only on sign-up: an existing account may hold a shorter
                    // password set under the old rule, and blocking their own
                    // password at the sign-in box would lock them out.
                    minLength={isRegister ? 8 : undefined}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder={isRegister ? 'At least 8 characters' : 'Enter Password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${fieldClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--pc-text-subtle)] transition-colors hover:text-[var(--pc-text)] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
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

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="pc-btn-primary h-[38px] w-full text-sm font-medium cursor-pointer"
                >
                  {loading ? busyLabel : isRegister ? 'Register' : 'Login'}
                </button>

                <AnimatePresence initial={false}>
                  {loading && waitStage > 0 && (
                    <motion.p
                      initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: modalEase }}
                      className="mt-2.5 text-center text-xs leading-relaxed text-[var(--pc-text-muted)]"
                    >
                      {waitStage === 2
                        ? 'This host sleeps when nobody is using it. The first request wakes it, which can take up to a minute — nothing has been lost.'
                        : 'Free hosting pauses when idle. Hang on a few seconds while it starts back up.'}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <span className="h-px flex-grow bg-[var(--pc-border)]" />
                <span className="text-[13px] text-[var(--pc-text-muted)]">OR</span>
                <span className="h-px flex-grow bg-[var(--pc-border)]" />
              </div>

              {/* The kit offers Facebook, Google and Apple. Only Google is wired
                  up here, so only Google is shown. */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="pc-btn-ghost flex h-10 w-full items-center justify-center gap-2.5 text-sm font-medium cursor-pointer disabled:opacity-60"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <p className="pt-1 text-center text-sm text-[var(--pc-text)]">
                {isRegister ? 'Already have an account yet?' : "Don't have an account yet?"}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(isRegister ? 'login' : 'register');
                    setError('');
                  }}
                  className="font-medium text-[var(--pc-primary)] transition-colors hover:text-[var(--pc-primary-bright)] cursor-pointer"
                >
                  {isRegister ? 'Login' : 'Register'}
                </button>
              </p>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
