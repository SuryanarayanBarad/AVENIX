import React, { useState, useEffect, useRef } from 'react';
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
  ArrowLeft,
  Activity,
  CheckCircle2,
  UserCircle2,
  Settings2,
  Hourglass,
} from 'lucide-react';
import { Token } from '../types';
import type { PublicQueueToken } from './VisitorFlow';
import { visitorApi } from '../services/queueApi';
import { TokenManageModal } from './TokenManageModal';
import { useLiveUpdates } from '../hooks/useLiveUpdates';
import { ApproachingModal } from './ApproachingModal';

const trackerEase = [0.22, 1, 0.36, 1] as const;

interface VisitorTokenViewProps {
  token: Token | PublicQueueToken;
  onBackToKiosk: () => void;
  /** Where "Get a new token" goes. Defaults to the back action. */
  onGetNewToken?: () => void;
}

export const VisitorTokenView: React.FC<VisitorTokenViewProps> = ({
  token,
  onBackToKiosk,
  onGetNewToken,
}) => {
  const shouldReduceMotion = useReducedMotion();
  
  // Live API state
  const [queueData, setQueueData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Alert Modals
  const [showApproachingModal, setShowApproachingModal] = useState(false);
  const [isOnWay, setIsOnWay] = useState(false);
  
  // Pagination State
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Tracks if we've already shown the approaching modal for this session
  const hasShownApproachingModal = useRef(false);

  // Visitors may correct their own token details or give up their place.
  const [showManageModal, setShowManageModal] = useState(false);
  const [wasCancelled, setWasCancelled] = useState(false);
  // Details the visitor edits are held locally as well, so saving repaints at
  // once rather than waiting for the next poll to come back.
  const [localDetails, setLocalDetails] = useState<{ visitorName?: string | null; phone?: string | null; serviceName?: string } | null>(null);

  // Finishing the consultation, and what follows it.
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completion, setCompletion] = useState<{ calledNext: string | null } | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const fetchQueuePosition = async (silent = false) => {
    const authHeader = window.localStorage.getItem('auth_token');
    if (!token.accessKey && !authHeader) {
      // Tokens from Kiosk or Admin views might not have access keys (they are mock tokens)
      // Just skip fetching live data and use the token's static data
      setIsLoading(false);
      return;
    }

    try {
      if (!silent) setIsLoading(true);
      if (silent) setIsRefreshing(true);
      
      const data = await visitorApi.getQueuePosition(token.id, token.accessKey);
      setQueueData(data);
      
      // Auto-trigger approaching modal if status is approaching and hasn't been shown
      if (!hasShownApproachingModal.current && data.status.toLowerCase() === 'approaching') {
        setShowApproachingModal(true);
        hasShownApproachingModal.current = true;
      }
      
    } catch (err: any) {
      setError(err.message || 'Failed to load queue data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueuePosition();
    const intervalId = setInterval(() => {
      fetchQueuePosition(true);
    }, 10000); // poll every 10s as a safety net behind the live stream
    return () => clearInterval(intervalId);
  }, [token.id, token.accessKey]);

  // Anyone moving this queue — staff calling the next person, an admin
  // reordering, another visitor cancelling — repaints this screen at once.
  useLiveUpdates(() => fetchQueuePosition(true), {
    watch: token.accessKey ? { tokenId: token.id, accessKey: token.accessKey } : null,
  });

  const handleComplete = async () => {
    setIsCompleting(true);
    setCompleteError(null);
    try {
      const result = await visitorApi.completeToken(token.id);
      // Repaint from the response immediately; the live stream tells every
      // other screen at the same moment.
      setQueueData((current: any) => (current ? { ...current, status: 'Completed', peopleAhead: 0 } : current));
      setCompletion({ calledNext: result.calledNext?.code ?? null });
      setConfirmingComplete(false);
      try { window.localStorage.removeItem('queuemind:active-visitor-token'); } catch { /* storage may be unavailable */ }
    } catch (err: any) {
      setCompleteError(err?.message || 'Your consultation could not be marked complete.');
    } finally {
      setIsCompleting(false);
    }
  };

  // Derived values from live data (or fallback to token)
  const currentStatus = queueData?.status || token.status;
  const currentWaitMin = queueData?.estimatedWaitMinutes ?? ('estimatedWaitMinutes' in token ? token.estimatedWaitMinutes : token.estWaitMin);
  const currentAhead = queueData?.peopleAhead ?? token.peopleAhead;
  
  const tokenService = localDetails?.serviceName
    ?? queueData?.serviceName
    ?? ('serviceName' in token ? token.serviceName : token.service);
  const tokenCounterId = 'counterName' in token ? token.counterName : token.counterId || 'Triage';
  
  // Only an active token the visitor can prove ownership of is manageable.
  const canManageToken = !wasCancelled
    && !!(token.accessKey || window.localStorage.getItem('auth_token'))
    && ['waiting', 'approaching'].includes(String(currentStatus).toLowerCase());

  const isServing = currentStatus.toLowerCase() === 'serving';
  const isApproaching = currentStatus.toLowerCase() === 'approaching';

  const queueProgress = isOnWay || isServing
    ? 0.96
    : Math.max(0.18, Math.min(0.84, 1 - currentAhead / 24));
  const progressDashOffset = 264 * (1 - queueProgress);

  const handleConfirmOnWay = () => {
    setIsOnWay(true);
    setShowApproachingModal(false);
  };

  const handleRequestMoreTime = () => {
    setShowApproachingModal(false);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const index = Math.round(container.scrollLeft / container.clientWidth);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const scrollToCard = (index: number) => {
    if (scrollContainerRef.current) {
      const width = scrollContainerRef.current.clientWidth;
      scrollContainerRef.current.scrollTo({
        left: width * index,
        behavior: 'smooth'
      });
    }
  };

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-white p-6">
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl max-w-md w-full text-center">
          <p className="text-red-300 font-medium mb-4">{error}</p>
          <button 
            onClick={onBackToKiosk}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pc min-h-[calc(100vh-4rem)] bg-[var(--pc-page)] py-0 px-0 sm:py-8 sm:px-6 flex items-center justify-center text-[var(--pc-text)]">

      {/* Mobile Frame Mockup Container (Frosted Glass Smartphone)
          On a desktop this is a phone mockup, and it reads well as one. On an
          actual phone it was a phone drawn inside a phone: a rounded, bordered
          box held 760px tall — taller than the viewport it was sitting in — so
          the visitor scrolled a card inside a page instead of just reading
          their token. Below `sm` the frame steps off and the content fills the
          screen; from `sm` up the mockup returns unchanged. */}
      <div className="w-full sm:max-w-md glass-panel-elevated rounded-none sm:rounded-[36px] overflow-hidden flex flex-col min-h-[calc(100vh-4rem)] sm:min-h-[680px] sm:h-[85vh] relative shadow-2xl border-0 sm:border border-white/[0.18] backdrop-blur-2xl">

        {/* Mobile Header */}
        <div className="bg-white/[0.05] text-white px-5 py-4 flex items-center justify-between border-b border-white/[0.12] backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBackToKiosk}
              className="p-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-white transition-colors cursor-pointer mr-0.5"
              title="Back to Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#2E37A4] to-[#00D3C7] flex items-center justify-center text-white shadow-md">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs leading-tight font-display text-white">CityCare Central</h3>
              <p className="text-[10px] text-white/60">Live Patient Queue Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canManageToken && (
              <button
                onClick={() => setShowManageModal(true)}
                title="Edit or cancel this token"
                className="p-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-white/75 hover:text-white transition-colors cursor-pointer"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border backdrop-blur-md transition-colors ${
              isServing ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 
              isApproaching ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 
              'bg-[#2E37A4]/20 text-[#2E37A4] border-[#2E37A4]/40'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isServing || isApproaching ? 'animate-ping' : ''} ${
                isServing ? 'bg-emerald-400' : isApproaching ? 'bg-amber-400' : 'bg-[#2E37A4]'
              }`} />
              LIVE
            </span>
          </div>
        </div>

        {/* Swipeable Horizontal Scroll Container */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
            
          {/* ─── CARD 1: TOKEN ─── */}
          <div className="min-w-full w-full shrink-0 snap-center p-4 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4">
            {/* Notification Alert Banner (Frosted Amber Pill) */}
            {isApproaching && (
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 backdrop-blur-xl shadow-lg animate-pulse">
                <Bell className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
                <div>
                  <span className="font-bold block text-white">Your turn is approaching!</span>
                  <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                    Please proceed to the waiting lounge near <strong className="text-white">{tokenCounterId}</strong>.
                  </p>
                </div>
              </div>
            )}
            
            {isServing && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-3 backdrop-blur-xl shadow-lg animate-pulse">
                <Activity className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-white">It's your turn!</span>
                  <p className="text-[11px] text-emerald-200/80 mt-0.5 leading-relaxed">
                    Please approach <strong className="text-white">{tokenCounterId}</strong> now.
                  </p>
                </div>
              </div>
            )}

            {/* Center Circular Progress Ring & Token Code */}
            <div className="p-4 sm:p-6 rounded-3xl glass-panel text-center relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#2E37A4]/20 text-[#2E37A4] border border-[#2E37A4]/40 backdrop-blur-md">
                  {tokenService}
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
                    className={`transition-colors ${
                      isServing ? 'stroke-emerald-400' : isApproaching ? 'stroke-amber-400' : 'stroke-[#2E37A4]'
                    }`}
                    strokeWidth="7"
                    strokeDasharray="264"
                    animate={{ strokeDashoffset: progressDashOffset }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: trackerEase }}
                    strokeLinecap="round"
                    fill="transparent"
                    style={{ filter: `drop-shadow(0 0 8px ${isServing ? 'rgba(52, 211, 153, 0.6)' : isApproaching ? 'rgba(251, 191, 36, 0.6)' : 'rgba(46, 55, 164, 0.6)'})` }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <div className="text-4xl font-black text-[var(--pc-primary)] font-mono tracking-tight">
                    {token.code}
                  </div>
                  <div className={`text-[10px] font-bold mt-1 uppercase tracking-wider px-2 py-0.5 rounded-full border transition-colors ${
                    isServing ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' :
                    isApproaching ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' :
                    isOnWay ? 'text-[#2E37A4] bg-[#2E37A4]/15 border-[#2E37A4]/30' :
                    'text-white/70 bg-white/5 border-white/10'
                  }`}>
                    {isServing ? 'Serving Now' : isOnWay ? 'On My Way' : isApproaching ? 'Next' : 'Waiting'}
                  </div>
                </div>
              </div>

              <p className="text-xs text-white/70 mt-1">
                Token for: <strong className="text-white">{tokenService}</strong>
              </p>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-2xl glass-panel">
                <Clock className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <div className="text-[10px] text-white/50 font-medium">Est. Wait</div>
                <div className="text-base font-light text-white font-display">
                  {isLoading && !queueData ? '...' : `~${currentWaitMin}m`}
                </div>
              </div>

              <div className="p-3 rounded-2xl glass-panel">
                <Users className="w-4 h-4 text-[#2E37A4] mx-auto mb-1" />
                <div className="text-[10px] text-white/50 font-medium">Ahead</div>
                <div className="text-base font-light text-white font-display">
                  {isLoading && !queueData ? '...' : currentAhead}
                </div>
              </div>

              <div className="p-3 rounded-2xl glass-panel">
                <MapPin className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <div className="text-[10px] text-white/50 font-medium">Counter</div>
                <div className="text-sm font-semibold text-[#2E37A4] font-display truncate">
                  {tokenCounterId}
                </div>
              </div>
            </div>

            {/* Finish the visit — sits directly under the three metric cards */}
            {completion ? (
              <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center">
                <CheckCircle2 className="mx-auto mb-1.5 h-6 w-6 text-emerald-300" />
                <p className="text-sm font-bold text-white">Consultation complete</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/65">
                  {completion.calledNext
                    ? <>Thank you. <span className="font-mono font-semibold text-emerald-200">{completion.calledNext}</span> has been called forward.</>
                    : 'Thank you. Your place in the queue has been released.'}
                </p>
                <button
                  type="button"
                  onClick={onGetNewToken ?? onBackToKiosk}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#2E37A4] to-purple-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-[#2E37A4]/30 hover:opacity-90 cursor-pointer"
                >
                  <Ticket className="h-4 w-4" />
                  Get a new token
                </button>
              </div>
            ) : canManageToken ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => (isServing ? handleComplete() : setConfirmingComplete(true))}
                  disabled={isCompleting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isCompleting ? 'Completing…' : 'Complete consultation'}
                </button>

                {/* Being marked Waiting means the desk has not called this token
                    yet, so confirm before releasing the place in the queue. */}
                {confirmingComplete && (
                  <div className="mt-2 rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4">
                    <p className="flex items-start gap-2 text-[11px] font-semibold leading-relaxed text-amber-100">
                      <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      You are still shown as <strong className="text-white">waiting</strong> — your turn has not been
                      called yet.
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-amber-100/80">
                      Only continue if the doctor has already seen you. This releases your place in the queue and
                      cannot be undone — a new token would start at the back.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={isCompleting}
                        onClick={handleComplete}
                        className="pc-btn-success flex-1 px-4 py-2.5 text-xs font-bold cursor-pointer"
                      >
                        {isCompleting ? 'Completing…' : 'Yes, I have been seen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingComplete(false)}
                        className="rounded-2xl border border-white/[0.14] bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/[0.12] cursor-pointer"
                      >
                        Not yet
                      </button>
                    </div>
                  </div>
                )}

                {completeError && (
                  <p className="mt-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-[11px] font-medium text-rose-300">
                    {completeError}
                  </p>
                )}
              </div>
            ) : null}

            {/* Privacy Note */}
            <div className="flex items-center justify-center gap-1 text-[10px] text-white/40 pt-4">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Anonymous tracking • No personal data displayed</span>
            </div>
            
          </div>

          {/* ─── CARD 2: WAIT TIME (TIMELINE) ─── */}
          <div className="min-w-full w-full shrink-0 snap-center p-4 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4">
            <div className="glass-panel p-5 rounded-3xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#2E37A4]" />
                  Live Queue Timeline
                </h3>
                <div className="text-[10px] font-semibold bg-white/5 px-2 py-1 rounded border border-white/10 text-white/60">
                  {currentAhead} ahead of you
                </div>
              </div>

              {isLoading && !queueData ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-[#2E37A4] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : queueData?.queueTokens?.length > 0 ? (
                <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-[23px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/[0.1] before:to-transparent">
                  {queueData.queueTokens.map((t: PublicQueueToken, i: number) => {
                    const isMine = t.isOwn;
                    const isServingToken = t.status.toLowerCase() === 'serving';
                    
                    return (
                      <div 
                        key={`${t.code}-${i}`} 
                        className={`relative flex items-center justify-between p-3 rounded-2xl transition-all ${
                          isMine 
                            ? 'bg-gradient-to-r from-[#2E37A4]/20 to-purple-500/20 border border-[#2E37A4]/30 shadow-lg shadow-[#2E37A4]/10 scale-[1.02]' 
                            : 'bg-white/5 border border-white/[0.05]'
                        }`}
                      >
                        {/* Timeline Dot */}
                        <div className={`absolute left-0 -translate-x-[29px] w-4 h-4 rounded-full border-[3px] border-[#0a0a0b] ${
                          isMine ? 'bg-[#2E37A4] shadow-[0_0_10px_rgba(46,55,164,0.6)]' :
                          isServingToken ? 'bg-emerald-400' : 'bg-white/20'
                        }`} />
                        
                        <div className="flex items-center gap-3">
                          {isMine ? (
                            <div className="w-8 h-8 rounded-full bg-[#2E37A4]/20 flex items-center justify-center">
                              <UserCircle2 className="w-4 h-4 text-[#2E37A4]" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                              <Ticket className="w-4 h-4 text-white/40" />
                            </div>
                          )}
                          <div>
                            <div className={`font-mono font-bold ${isMine ? 'text-[#2E37A4]' : 'text-white/80'}`}>
                              {t.code} {isMine && '(You)'}
                            </div>
                            <div className="text-[10px] text-white/40 capitalize">
                              {t.status}
                            </div>
                          </div>
                        </div>
                        
                        {isServingToken && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20">
                            <Activity className="w-3 h-3" />
                            SERVING
                          </div>
                        )}
                        {isMine && !isServingToken && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full border border-amber-400/20">
                            <Clock className="w-3 h-3" />
                            ~{currentWaitMin}m
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-white/50 text-xs">
                  No queue data available.
                </div>
              )}
            </div>
          </div>

          {/* ─── CARD 3: DIRECTIONS ─── */}
          <div className="min-w-full w-full shrink-0 snap-center p-4 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4">
            <div className="p-4 rounded-2xl glass-panel space-y-4">
              <div className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-[#2E37A4]" />
                <span className="text-sm font-bold text-white">Wayfinding Guide</span>
              </div>
              
              <div className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.10] text-xs text-white/80 space-y-3 backdrop-blur-md">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#2E37A4]/20 text-[#2E37A4] font-bold text-[11px] flex items-center justify-center shrink-0 border border-[#2E37A4]/40">1</span>
                  <span className="mt-0.5">Exit Main Atrium and turn right down Hallway B.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#2E37A4]/20 text-[#2E37A4] font-bold text-[11px] flex items-center justify-center shrink-0 border border-[#2E37A4]/40">2</span>
                  <span className="mt-0.5">Pass the Pharmacy Lobby and enter the Triage Zone.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[11px] flex items-center justify-center shrink-0 border border-emerald-500/40">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="mt-0.5"><strong className="text-white">{tokenCounterId}</strong> is located on your left at Desk #04.</span>
                </div>
              </div>
              
              {/* Mock Map View */}
              <div className="w-full h-48 rounded-xl bg-white/5 border border-white/10 relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 opacity-20" style={{
                  backgroundImage: 'radial-gradient(circle at center, #2E37A4 1px, transparent 1px)',
                  backgroundSize: '16px 16px'
                }}></div>
                <div className="text-center z-10">
                  <MapPin className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-50" />
                  <span className="text-xs font-semibold text-white/40">Interactive Map View</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── CARD 4: ALERTS & FUNCTIONS ─── */}
          <div className="min-w-full w-full shrink-0 snap-center p-4 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4">
            <div className="glass-panel p-5 rounded-3xl space-y-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#2E37A4]" />
                Notifications & Alerts
              </h3>
              
              {isApproaching || isServing ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs space-y-2">
                  <span className="font-bold block text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> 
                    {isServing ? 'It is your turn!' : 'Almost your turn!'}
                  </span>
                  <p className="text-[11px] text-emerald-200/80">
                    Please head to {tokenCounterId} immediately.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-white/40 text-xs">
                  No active alerts.<br />We will notify you via SMS when it's your turn.
                </div>
              )}
              
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60">
                <span className="font-bold block text-white/80 mb-1">Token Generated</span>
                <p className="text-[11px]">Your token {token.code} was successfully generated.</p>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Navigation */}
        <div className="bg-[var(--pc-surface)] border-t border-[var(--pc-border)] p-3 shrink-0 flex items-center justify-around pb-6">
          {[
            { icon: Ticket, label: 'Ticket' },
            { icon: Users, label: 'Queue' },
            { icon: Navigation, label: 'Map' },
            { icon: Bell, label: 'Alerts' },
          ].map((tab, idx) => {
            const isActive = activeIndex === idx;
            return (
              <button
                key={idx}
                onClick={() => scrollToCard(idx)}
                className={`group flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-300 relative ${
                  isActive ? 'text-[var(--pc-primary)]' : 'text-[var(--pc-text-subtle)] hover:text-[var(--pc-text)]'
                }`}
              >
                {/* Glowing hover/active effect */}
                <div className={`absolute inset-0 rounded-xl bg-[var(--pc-tint-lilac)] transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                <tab.icon className={`w-5 h-5 relative z-10 transition-colors ${isActive ? 'text-[#2E37A4]' : 'group-hover:text-[#2E37A4]/70'}`} />
                <span className={`text-[10px] font-medium relative z-10 transition-colors ${isActive ? 'text-[var(--pc-primary)]' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
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

        <TokenManageModal
          isOpen={showManageModal}
          tokenId={token.id}
          tokenCode={token.code}
          currentName={localDetails?.visitorName ?? queueData?.visitorName ?? ('patientName' in token ? token.patientName : '')}
          currentPhone={localDetails?.phone ?? queueData?.phone ?? ''}
          currentServiceName={tokenService}
          onClose={() => setShowManageModal(false)}
          onUpdated={(updated) => {
            // Repaint from the server's response straight away, then confirm
            // with a refetch — no manual refresh needed.
            setLocalDetails({
              visitorName: updated?.visitorName,
              phone: updated?.phone,
              serviceName: updated?.serviceName,
            });
            setQueueData((current: any) => (current ? { ...current, ...updated } : current));
            fetchQueuePosition(true);
          }}
          onCancelled={() => {
            setWasCancelled(true);
            onBackToKiosk();
          }}
        />

      </div>

    </div>
  );
};
