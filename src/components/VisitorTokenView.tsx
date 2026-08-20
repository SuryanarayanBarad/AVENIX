import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { 
  Building2, 
  Clock, 
  Users, 
  MapPin, 
  Bell, 
  Navigation, 
  ShieldCheck, 
  Ticket, 
  Hourglass, 
  ArrowLeft
} from 'lucide-react';
import { Token } from '../types';
import { ApproachingModal } from './ApproachingModal';

const trackerEase = [0.22, 1, 0.36, 1] as const;

interface VisitorTokenViewProps {
  token: Token;
  onUpdateToken: (token: Token) => void;
  onBackToKiosk: () => void;
}

export const VisitorTokenView: React.FC<VisitorTokenViewProps> = ({
  token,
  onUpdateToken,
  onBackToKiosk,
}) => {
  const [showApproachingModal, setShowApproachingModal] = useState(false);
  const [activeBottomNav, setActiveBottomNav] = useState<'token' | 'wait' | 'directions' | 'alerts'>('token');
  const [isOnWay, setIsOnWay] = useState(false);
  const [activeDirections, setActiveDirections] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const queueProgress = isOnWay || token.status === 'serving'
    ? 0.96
    : Math.max(0.18, Math.min(0.84, 1 - token.peopleAhead / 24));
  const progressDashOffset = 264 * (1 - queueProgress);

  const handleConfirmOnWay = () => {
    setIsOnWay(true);
    setShowApproachingModal(false);
    onUpdateToken({
      ...token,
      status: 'serving',
      estWaitMin: 1,
      peopleAhead: 0,
    });
  };

  const handleRequestMoreTime = () => {
    setShowApproachingModal(false);
    onUpdateToken({
      ...token,
      estWaitMin: token.estWaitMin + 5,
      peopleAhead: token.peopleAhead + 1,
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 flex items-center justify-center text-white">
      
      {/* Mobile Frame Mockup Container (Frosted Glass Smartphone) */}
      <div className="w-full max-w-md glass-panel-elevated rounded-[36px] overflow-hidden flex flex-col min-h-[660px] relative shadow-2xl border border-white/[0.18] backdrop-blur-2xl">
        
        {/* Mobile Header */}
        <div className="bg-white/[0.05] text-white px-5 py-4 flex items-center justify-between border-b border-white/[0.12] backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBackToKiosk}
              className="p-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-white transition-colors cursor-pointer mr-0.5"
              title="Back to Kiosk"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] flex items-center justify-center text-white shadow-md">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs leading-tight font-display text-white">CityCare Central</h3>
              <p className="text-[10px] text-white/60">Live Patient Queue Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              LIVE
            </span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          
          {/* Notification Alert Banner (Frosted Amber Pill) */}
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 backdrop-blur-xl shadow-lg">
            <Bell className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <span className="font-bold block text-white">Your turn is approaching!</span>
              <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                Please proceed to the waiting lounge near <strong className="text-white">{token.counterId}</strong>.
              </p>
            </div>
          </div>

          {/* Center Circular Progress Ring & Token Code (Frosted Glass Card) */}
          <div className="p-6 rounded-3xl glass-panel text-center relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/40 backdrop-blur-md">
                {token.service}
              </span>
            </div>

            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest block mb-1">
              CURRENT TOKEN
            </span>

            {/* Circular Progress SVG */}
            <div className="relative w-44 h-44 mx-auto flex items-center justify-center my-2">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-white/[0.08]"
                  strokeWidth="7"
                  fill="transparent"
                />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-[#8e7dff]"
                  strokeWidth="7"
                  strokeDasharray="264"
                  animate={{ strokeDashoffset: progressDashOffset }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: trackerEase }}
                  strokeLinecap="round"
                  fill="transparent"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(142, 125, 255, 0.6))' }}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-purple-200 font-mono tracking-tight">
                  {token.code}
                </div>
                <div className="text-[10px] font-bold text-emerald-400 mt-1 uppercase tracking-wider bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {isOnWay ? 'Serving Now' : 'Almost Ready'}
                </div>
              </div>
            </div>

            <p className="text-xs text-white/70 mt-1">
              Patient: <strong className="text-white">{token.patientName}</strong>
            </p>
          </div>

          {/* 3 Metric Cards (Frosted Glass Small Cards) */}
          <div className="grid grid-cols-3 gap-2 text-center">
            
            <div className="p-3 rounded-2xl glass-panel">
              <Clock className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <div className="text-[10px] text-white/50 font-medium">Est. Wait</div>
              <div className="text-base font-light text-white font-display">
                ~{token.estWaitMin} min
              </div>
            </div>

            <div className="p-3 rounded-2xl glass-panel">
              <Users className="w-4 h-4 text-[#8e7dff] mx-auto mb-1" />
              <div className="text-[10px] text-white/50 font-medium">Ahead</div>
              <div className="text-base font-light text-white font-display">
                {token.peopleAhead} people
              </div>
            </div>

            <div className="p-3 rounded-2xl glass-panel">
              <MapPin className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <div className="text-[10px] text-white/50 font-medium">Counter</div>
              <div className="text-sm font-semibold text-[#8e7dff] font-display truncate">
                {token.counterId}
              </div>
            </div>

          </div>

          {/* Directions / Wayfinding Accordion */}
          <div className="p-4 rounded-2xl glass-panel space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[#8e7dff]" />
                <span className="text-xs font-bold text-white">Wayfinding: How to reach {token.counterId}</span>
              </div>
              <button
                onClick={() => setActiveDirections(!activeDirections)}
                className="text-xs font-semibold text-[#8e7dff] hover:text-[#a78bfa] transition-colors cursor-pointer"
              >
                {activeDirections ? 'Hide Map' : 'View Guide'}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {activeDirections && (
                <motion.div
                  className="overflow-hidden"
                  initial={shouldReduceMotion ? false : { height: 0, opacity: 0, y: -4 }}
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { height: 0, opacity: 0, y: -4 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: trackerEase }}
                >
                  <div className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.10] text-xs text-white/80 space-y-2 backdrop-blur-md">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#8e7dff]/20 text-[#8e7dff] font-bold text-[10px] flex items-center justify-center shrink-0 border border-[#8e7dff]/40">1</span>
                      <span>Exit Main Atrium and turn right down Hallway B.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#8e7dff]/20 text-[#8e7dff] font-bold text-[10px] flex items-center justify-center shrink-0 border border-[#8e7dff]/40">2</span>
                      <span>Pass the Pharmacy Lobby and enter the Triage Zone.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#8e7dff]/20 text-[#8e7dff] font-bold text-[10px] flex items-center justify-center shrink-0 border border-[#8e7dff]/40">3</span>
                      <span>{token.counterId} is located on your left at Desk #04.</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Action Simulation Controls */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => setShowApproachingModal(true)}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:from-[#7b69fd] hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#8e7dff]/30 active:scale-98 transition-all cursor-pointer border border-white/20"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Simulate "Almost Your Turn" Modal</span>
            </button>

            <button
              onClick={onBackToKiosk}
              className="w-full py-2.5 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white/80 hover:text-white font-semibold text-xs transition-all cursor-pointer"
            >
              Back to Kiosk Service Menu
            </button>
          </div>

          {/* Privacy Note */}
          <div className="flex items-center justify-center gap-1 text-[10px] text-white/40 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Anonymous Spatial Tracking • No personal identity stored</span>
          </div>

        </div>

        {/* Mobile Bottom Navigation Bar (Frosted Glass Bottom Bar) */}
        <div className="bg-white/[0.06] border-t border-white/[0.12] px-4 py-2.5 flex items-center justify-around text-xs backdrop-blur-2xl">
          <button
            onClick={() => setActiveBottomNav('token')}
            className={`flex flex-col items-center gap-0.5 p-1 transition-colors cursor-pointer ${
              activeBottomNav === 'token' ? 'text-[#8e7dff] font-bold' : 'text-white/50 hover:text-white'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span className="text-[9px]">My Token</span>
          </button>

          <button
            onClick={() => setActiveBottomNav('wait')}
            className={`flex flex-col items-center gap-0.5 p-1 transition-colors cursor-pointer ${
              activeBottomNav === 'wait' ? 'text-[#8e7dff] font-bold' : 'text-white/50 hover:text-white'
            }`}
          >
            <Hourglass className="w-4 h-4" />
            <span className="text-[9px]">Wait Time</span>
          </button>

          <button
            onClick={() => setActiveDirections(!activeDirections)}
            className={`flex flex-col items-center gap-0.5 p-1 transition-colors cursor-pointer ${
              activeDirections ? 'text-[#8e7dff] font-bold' : 'text-white/50 hover:text-white'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span className="text-[9px]">Directions</span>
          </button>

          <button
            onClick={() => setShowApproachingModal(true)}
            className="flex flex-col items-center gap-0.5 p-1 text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="text-[9px]">Alerts</span>
          </button>
        </div>

        {/* Approaching Modal Popup */}
        <AnimatePresence initial={false}>
          {showApproachingModal && (
            <ApproachingModal
              token={token}
              onConfirmOnWay={handleConfirmOnWay}
              onRequestMoreTime={handleRequestMoreTime}
              onClose={() => setShowApproachingModal(false)}
            />
          )}
        </AnimatePresence>

      </div>

    </div>
  );
};
