import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { 
  Bell, 
  MapPin, 
  Clock, 
  ArrowRight, 
  Stethoscope, 
  TimerReset,
  X
} from 'lucide-react';
import { Token } from '../types';
import type { PublicQueueToken } from './VisitorFlow';

interface ApproachingModalProps {
  /**
   * Either shape of token reaches this modal — a staff-board `Token` or the
   * visitor's own `PublicQueueToken`. They name the same two facts differently,
   * so both spellings are read rather than assuming the staff one.
   */
  token: Token | PublicQueueToken;
  onConfirmOnWay: () => void;
  onRequestMoreTime: () => void;
  onClose: () => void;
}

const modalEase = [0.22, 1, 0.36, 1] as const;

export const ApproachingModal: React.FC<ApproachingModalProps> = ({
  token,
  onConfirmOnWay,
  onRequestMoreTime,
  onClose,
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
      onClick={onClose}
    >
      
      <motion.div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.22] bg-[#12122b]/90 text-white shadow-2xl glass-panel-elevated backdrop-blur-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approaching-modal-title"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
        onClick={(event) => event.stopPropagation()}
      >
        
        {/* Header alert stripe */}
        <div className="bg-gradient-to-r from-amber-500/30 via-orange-500/20 to-[#3538CD]/20 text-white p-6 relative border-b border-white/10 backdrop-blur-xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/60 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/30 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner animate-bounce">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Live Turn Notification</span>
              <h3 id="approaching-modal-title" className="text-2xl font-black font-display tracking-tight text-white">It's Almost Your Turn!</h3>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          
          {/* Big Token Display (Frosted Card) */}
          <div className="text-center glass-panel rounded-2xl p-5 border border-white/15">
            <span className="text-xs text-white/50 font-medium tracking-wider">YOUR TOKEN</span>
            <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#2E37A4] to-[#00D3C7] font-mono tracking-tight my-1">
              {token.code}
            </div>
            <p className="text-xs font-semibold text-white/80 mt-1">
              Please proceed toward <span className="text-[#2E37A4] font-bold">{'counterName' in token ? (token.counterName ?? token.counterId) : token.counterId}</span>.
            </p>
          </div>

          {/* Details list */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.05] border border-white/[0.10]">
              <div className="flex items-center gap-2 text-white/70">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Estimated Wait</span>
              </div>
              <span className="font-bold text-white">approx. ~3 mins</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.05] border border-white/[0.10]">
              <div className="flex items-center gap-2 text-white/70">
                <Stethoscope className="w-4 h-4 text-[#2E37A4]" />
                <span>Service Dept.</span>
              </div>
              <span className="font-bold text-white">{'serviceName' in token ? token.serviceName : token.service}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.05] border border-white/[0.10]">
              <div className="flex items-center gap-2 text-white/70">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Counter Location</span>
              </div>
              <span className="font-bold text-emerald-300">Triage Wing • Ground Floor</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              onClick={onConfirmOnWay}
              className="pc-btn-primary w-full py-3.5 px-4 hover:from-[#3538CD] hover:to-[#3538CD] text-sm flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer font-semibold"
            >
              <span>I'm on my way</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onRequestMoreTime}
              className="w-full py-2.5 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/[0.10]"
            >
              <TimerReset className="w-3.5 h-3.5 text-white/60" />
              <span>I need more time (+5 mins)</span>
            </button>
          </div>

        </div>

      </motion.div>

    </motion.div>
  );
};
