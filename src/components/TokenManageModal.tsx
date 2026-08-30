import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Phone, Trash2, UserRound, Stethoscope } from 'lucide-react';
import { visitorApi, adminApi } from '../services/queueApi';
import type { VisitorServiceOption } from './VisitorFlow';

const modalEase = [0.22, 1, 0.36, 1] as const;

interface TokenManageModalProps {
  isOpen: boolean;
  tokenId: string;
  tokenCode: string;
  currentName?: string | null;
  currentPhone?: string | null;
  currentServiceName?: string;
  onClose: () => void;
  onUpdated: (updated: any) => void;
  onCancelled: () => void;
  /**
   * Staff opening somebody else's token from the live board.
   *
   * The visitor routes prove ownership with the holder's private access key,
   * which staff do not have — so this panel answered "a valid private access
   * key is required" to the very people the board is built for. When set, the
   * save and the removal go through the audited admin routes instead, which
   * check the caller's role and record the change.
   */
  asStaff?: boolean;
}

/**
 * Lets a visitor correct or give up their own queue token.
 *
 * Name and phone are simple corrections and keep their place in line. Switching
 * service is a different queue, so the server re-issues the token at the back of
 * it — the modal says so before they commit, rather than surprising them after.
 */
export const TokenManageModal: React.FC<TokenManageModalProps> = ({
  isOpen,
  tokenId,
  tokenCode,
  currentName,
  currentPhone,
  currentServiceName,
  onClose,
  onUpdated,
  onCancelled,
  asStaff = false,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [services, setServices] = useState<VisitorServiceOption[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(currentName ?? '');
    setPhone(currentPhone ?? '');
    setError(null);
    setConfirmingCancel(false);
    visitorApi.getServices()
      .then((list) => {
        setServices(list);
        const match = list.find((service) => service.name === currentServiceName);
        setServiceId(match?.id ?? '');
      })
      .catch(() => setServices([]));
  }, [isOpen, currentName, currentPhone, currentServiceName]);

  if (!isOpen) return null;

  const originalServiceId = services.find((service) => service.name === currentServiceName)?.id ?? '';
  const willRequeue = !!serviceId && !!originalServiceId && serviceId !== originalServiceId;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // Blank fields are omitted entirely: the server treats a missing field as
      // "leave it as it was", so clearing a box never wipes the saved value.
      const changes = {
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(willRequeue ? { serviceId } : {}),
      };
      // Staff go through the audited admin route; the holder proves ownership
      // with their own access key on the visitor route.
      const updated = asStaff
        ? await adminApi.updateTokenAsStaff(tokenId, changes)
        : await visitorApi.updateToken(tokenId, changes);
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Those changes could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const cancelToken = async () => {
    setBusy(true);
    setError(null);
    try {
      if (asStaff) {
        await adminApi.deleteTokenAsStaff(tokenId, 'Removed from the live board');
      } else {
        await visitorApi.cancelToken(tokenId);
      }
      onCancelled();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'That token could not be cancelled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Manage your token"
          className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/[0.20] bg-[#12122b]/95 text-white shadow-2xl glass-panel-elevated backdrop-blur-2xl"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-white/[0.10] bg-white/[0.04] p-5">
            <h3 className="font-display text-base font-bold text-white">Manage your token</h3>
            <p className="mt-0.5 text-xs text-white/60">
              <span className="font-mono text-white/80">{tokenCode}</span> · correct your details or leave the queue
            </p>
          </div>

          <div className="space-y-4 p-5 text-xs">
            <div>
              <label className="mb-1.5 block font-bold text-white/80">Your name</label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={currentName ? `${currentName} (leave blank to keep)` : 'Name shown on the board'}
                  className="glass-input w-full rounded-2xl py-2.5 pl-9 pr-4 text-white placeholder-white/40"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block font-bold text-white/80">Phone number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={currentPhone ? `${currentPhone} (leave blank to keep)` : 'For queue alerts (optional)'}
                  className="glass-input w-full rounded-2xl py-2.5 pl-9 pr-4 text-white placeholder-white/40"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block font-bold text-white/80">Service</label>
              <div className="relative">
                <Stethoscope className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <select
                  value={serviceId}
                  onChange={(event) => setServiceId(event.target.value)}
                  className="glass-input w-full appearance-none rounded-2xl bg-[#12122b] py-2.5 pl-9 pr-4 font-medium text-white"
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id} className="bg-[#12122b] text-white">
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>
              {willRequeue && (
                <p className="mt-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                  Changing service moves you to a different queue, so you will join it at the back.
                </p>
              )}
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-[11px] font-medium text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            {confirmingCancel ? (
              <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4">
                <p className="text-[11px] leading-relaxed text-[var(--pc-danger-text)]">
                  Give up token <span className="font-mono font-bold">{tokenCode}</span>?
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--pc-danger-text)]">
                  {asStaff ? (
                    <>
                      This visitor has <strong>not been treated yet</strong>. Removing the token gives up their place,
                      and a new one would start at the back of the queue. The change is recorded in the audit log.
                    </>
                  ) : (
                    <>
                      You have <strong>not been treated yet</strong>. Cancelling gives up this place
                      in the queue, and any new token starts at the back — you would wait again from the end.
                    </>
                  )}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={cancelToken}
                    className="flex-1 rounded-2xl border border-white/20 bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 font-bold text-white shadow-lg shadow-rose-500/25 hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? 'Cancelling…' : 'Yes, cancel it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(false)}
                    className="rounded-2xl border border-white/[0.14] bg-white/[0.06] px-4 py-2.5 font-semibold text-white/80 hover:bg-white/[0.12] cursor-pointer"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 font-semibold text-rose-300 hover:bg-rose-500/20 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Cancel my token
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.10] p-5 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/[0.12] bg-white/[0.08] px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/[0.15] cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-2xl border border-white/20 bg-[var(--pc-primary)] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#2E37A4]/30 hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
