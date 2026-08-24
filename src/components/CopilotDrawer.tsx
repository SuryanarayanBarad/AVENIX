import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { 
  X, 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  Loader2
} from 'lucide-react';
import { CopilotMessage, Counter, FacilityZone, Token } from '../types';
import { apiFetch } from '../services/apiClient';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  counters: Counter[];
  zones: FacilityZone[];
  tokens: Token[];
  onApplyCounterOptimization?: () => void;
}

const drawerEase = [0.22, 1, 0.36, 1] as const;

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  initialPrompt,
  counters,
  zones,
  tokens,
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'm-1',
      sender: 'ai',
      text: "I'm **QueueMind Copilot**. I read the live queue, today's appointments and who is on shift, and answer from those figures only. Ask me anything about the current state.",
      timestamp: 'Just now',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Follow-ups are derived from live state server-side. They used to be three
  // hardcoded strings repeated under every reply, proposing action on counters
  // this facility does not have.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (initialPrompt && isOpen) {
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Opening questions, chosen from what the queue actually shows right now.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    apiFetch<{ suggestions: string[] }>('/api/copilot/suggestions', { fallback: 'Could not load suggestions' })
      .then((data) => { if (!cancelled) setSuggestions(data.suggestions ?? []); })
      .catch(() => { /* the drawer is still usable without them */ });
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isLoading) return;

    const userMsg: CopilotMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      // The server assembles the live snapshot itself. Sending counters and
      // zones from here meant posting mock data up and getting confident
      // analysis of it back.
      const data = await apiFetch<{ reply: string; suggestions?: string[] }>('/api/copilot/chat', {
        method: 'POST',
        fallback: 'The copilot could not answer',
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-8).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }],
          })),
        }),
      });

      if (data.suggestions) setSuggestions(data.suggestions);

      const aiMsg: CopilotMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      // Say the assistant is unavailable. The old fallback invented a reading —
      // "90% capacity, 147 queued" — which was indistinguishable from a real
      // answer and wrong every time.
      const failureMsg: CopilotMessage = {
        id: `ai-error-${Date.now()}`,
        sender: 'ai',
        text: (err as Error)?.message
          || 'I could not reach the assistant just now. The figures in the panels behind this drawer are still live and accurate.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, failureMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: drawerEase }}
          onClick={onClose}
        >
          {/* Slide-in Drawer Container (Frosted Glass Shell) */}
          <motion.aside
            className="h-full w-full max-w-lg glass-panel-elevated flex flex-col border-l border-white/[0.18] bg-[#0e0e24]/95 text-white shadow-2xl backdrop-blur-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="QueueMind AI Copilot"
            initial={shouldReduceMotion ? false : { opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={shouldReduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: drawerEase }}
            onClick={(event) => event.stopPropagation()}
          >
        
        {/* Header */}
        <div className="p-4 bg-white/[0.04] border-b border-white/[0.10] text-white flex items-center justify-between backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] flex items-center justify-center text-white shadow-md shadow-[#8e7dff]/25 border border-white/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm font-display text-white">QueueMind AI Copilot</h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/40 font-mono backdrop-blur-md">
                  Gemini 2.5 Flash
                </span>
              </div>
              <p className="text-[10px] text-white/60">Autonomous Queue & Crowd Intelligence</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.10] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real-time Status Badge Strip */}
        <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.08] flex items-center justify-between text-[11px] text-white/70 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
            <span>42 LiDAR & Thermal Nodes Connected</span>
          </div>
          <span className="font-mono text-[#8e7dff] font-bold">147 Queued</span>
        </div>

        {/* Chat Message Stream */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 text-xs ${
                m.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {m.sender === 'ai' && (
                <div className="w-8 h-8 rounded-2xl bg-[#8e7dff]/20 border border-[#8e7dff]/40 text-[#8e7dff] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] p-4 rounded-3xl space-y-2 ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-[#8e7dff] to-purple-600 text-white rounded-br-md shadow-lg shadow-[#8e7dff]/20 border border-white/20'
                    : 'glass-panel rounded-tl-md text-white border border-white/[0.12]'
                }`}
              >
                <div className="leading-relaxed whitespace-pre-wrap">
                  {m.text}
                </div>

                <div
                  className={`text-[9px] text-right ${
                    m.sender === 'user' ? 'text-white/70' : 'text-white/40'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>

              {m.sender === 'user' && (
                <div className="w-8 h-8 rounded-2xl bg-white/[0.10] border border-white/[0.15] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 text-xs justify-start">
              <div className="w-8 h-8 rounded-2xl bg-[#8e7dff]/20 border border-[#8e7dff]/40 text-[#8e7dff] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-4 rounded-3xl glass-panel rounded-tl-md text-white/70 flex items-center gap-2 border border-white/[0.12]">
                <Loader2 className="w-4 h-4 animate-spin text-[#8e7dff]" />
                <span>Reading the live queue…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick suggestions — recomputed from live state with every reply, so
            they always name something that exists in this facility right now. */}
        {suggestions.length > 0 && !isLoading && (
          <div className="px-4 pt-3 bg-white/[0.03] border-t border-white/[0.10] backdrop-blur-xl">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block mb-1.5">
              Quick suggestions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendMessage(suggestion)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-[#8e7dff]/25 hover:border-[#8e7dff]/50 text-white text-[10px] font-medium border border-white/[0.12] transition-all text-left cursor-pointer backdrop-blur-md"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar (Frosted Glass Input Bar) */}
        <div className="p-4 bg-white/[0.03] border-t border-white/[0.10] backdrop-blur-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask about the queue, today's appointments, or who is on shift…"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-3 glass-input rounded-2xl text-xs placeholder-white/40 text-white"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="p-3 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:opacity-90 disabled:opacity-40 text-white font-bold shadow-lg shadow-[#8e7dff]/30 active:scale-95 transition-all cursor-pointer border border-white/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
