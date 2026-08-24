import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, XCircle } from 'lucide-react';
import { doctorApi } from '../../services/doctorApi';

const modalEase = [0.22, 1, 0.36, 1] as const;

/** Mirrors lib/appointmentState.ts; replaced by the API list once it loads. */
const FALLBACK_REASONS = [
  { id: 'unavailable', label: 'Doctor unavailable at this time' },
  { id: 'fully-booked', label: 'Schedule is fully booked' },
  { id: 'wrong-specialty', label: 'Needs a different specialty' },
  { id: 'emergency', label: 'Emergency case took priority' },
  { id: 'more-info', label: 'More patient information needed' },
  { id: 'duplicate', label: 'Duplicate or already-booked request' },
  { id: 'other', label: 'Other (write a reason)' },
];

interface DenyReasonModalProps {
  isOpen: boolean;
  patientName?: string;
  appointmentCode?: string;
  isSubmitting?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reasonId: string, reasonNote?: string) => void;
}

/**
 * Declining an appointment requires a reason, because the patient is shown it
 * rather than a bare "Declined". Choosing "Other" opens a free-text box, and
 * the confirm button stays disabled until there is something to send.
 */
export const DenyReasonModal: React.FC<DenyReasonModalProps> = ({
  isOpen,
  patientName,
  appointmentCode,
  isSubmitting = false,
  error = null,
  onCancel,
  onConfirm,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [reasons, setReasons] = useState(FALLBACK_REASONS);
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setReasonId('');
    setNote('');
    doctorApi.getDenialReasons().then(setReasons).catch(() => {/* keep the fallback */});
  }, [isOpen]);

  if (!isOpen) return null;

  const isOther = reasonId === 'other';
  const canSubmit = !!reasonId && (!isOther || note.trim().length > 0) && !isSubmitting;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
        onClick={onCancel}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Reason for declining"
          className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.20] bg-[#12122b]/95 text-white shadow-2xl glass-panel-elevated backdrop-blur-2xl"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-3 border-b border-white/[0.10] bg-white/[0.04] p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-400/35 bg-rose-500/15 text-rose-300">
              <XCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-white">Decline this appointment</h3>
              <p className="mt-0.5 text-xs text-white/60">
                {patientName ? `${patientName}` : 'This patient'}
                {appointmentCode ? <span className="font-mono text-white/45"> · {appointmentCode}</span> : null}
                {' '}will be told why.
              </p>
            </div>
          </div>

          <div className="space-y-2 p-5">
            {reasons.map((reason) => {
              const selected = reasonId === reason.id;
              return (
                <button
                  key={reason.id}
                  type="button"
                  onClick={() => setReasonId(reason.id)}
                  aria-pressed={selected}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-xs font-semibold transition-colors cursor-pointer ${
                    selected
                      ? 'border-rose-400/50 bg-rose-500/15 text-white'
                      : 'border-white/[0.12] bg-white/[0.04] text-white/75 hover:border-white/[0.22] hover:bg-white/[0.08]'
                  }`}
                >
                  {reason.label}
                </button>
              );
            })}

            {isOther && (
              <textarea
                autoFocus
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                placeholder="Write the reason the patient will see…"
                className="glass-input w-full rounded-2xl px-4 py-3 text-xs placeholder-white/40 text-white"
              />
            )}

            {!isOther && reasonId && (
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                placeholder="Add a detail (optional)"
                className="glass-input w-full rounded-2xl px-4 py-2.5 text-xs placeholder-white/40 text-white"
              />
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-[11px] font-medium text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.10] p-5 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl border border-white/[0.12] bg-white/[0.08] px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/[0.15] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onConfirm(reasonId, note.trim() || undefined)}
              className="rounded-2xl border border-white/20 bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/25 hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Declining…' : 'Confirm decline'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
