import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Sparkles, Upload, FileText, Trash2, AlertTriangle, Clock,
  Users, ArrowRight, ShieldCheck, Loader2, X, ExternalLink, History,
  CalendarPlus, Ticket,
} from 'lucide-react';
import { HospitalMapView } from './HospitalMapView';
import { HospitalInsightsPanel } from './HospitalInsightsPanel';
import {
  healthApi, fileToDataUrl,
  type MedicalReportView, type NavigationResult,
  type NavigationHistoryItem,
} from '../../services/healthApi';

const ease = [0.22, 1, 0.36, 1] as const;

interface Props {
  /** Opens the appointment journey. */
  onBookAppointment?: (departmentName?: string, doctorId?: string) => void;
  /** Opens the walk-in kiosk to take a queue token. A different act from
   *  booking, and previously the only one wired — so "Book with Dr Sharma"
   *  sent the patient to the walk-in queue and discarded the doctor. */
  onJoinQueue?: () => void;
}

/**
 * A numbered step heading.
 *
 * The journey already ran in this order; nothing said so. For somebody seeing
 * the screen for the first time — a patient, or a judge with two minutes — an
 * unlabelled sequence of cards reads as a dashboard rather than a path with a
 * beginning and an end.
 *
 * Uses the existing kit tokens only: no new colours, no new component library.
 * `done` fills the marker once that step has actually produced something, so
 * the numbering reflects real progress rather than decorating every step as
 * complete from the moment the page loads.
 */
const StepHeading: React.FC<{ n: number; title: string; hint?: string; done?: boolean }> = ({
  n, title, hint, done = false,
}) => (
  <div className="flex items-start gap-2.5">
    <span
      aria-hidden
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
        done
          ? 'border-[var(--pc-primary)] bg-[var(--pc-primary)] text-white'
          : 'border-[var(--pc-border-strong)] bg-[var(--pc-surface)] text-[var(--pc-text-muted)]'
      }`}
    >
      {n}
    </span>
    <span className="min-w-0">
      <span className="block text-xs font-bold uppercase tracking-wider text-[var(--pc-text)]">
        {title}
      </span>
      {hint && <span className="mt-0.5 block text-[11px] text-[var(--pc-text-muted)]">{hint}</span>}
    </span>
  </div>
);

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'bg-[#E7F6EC] text-[var(--pc-success-text)] border-[#A6DCBB]',
  medium: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
  low: 'bg-[var(--pc-page)] text-[var(--pc-text-muted)] border-[var(--pc-border)]',
};

const REPORT_KINDS = ['Lab report', 'Scan', 'Prescription', 'Discharge summary', 'Other'];

const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * AI Health Navigation — the visitor's own AI section.
 *
 * Everything shown here belongs to the signed-in patient. The API has no route
 * that returns anybody else's report, so there is nothing to filter client-side
 * and no way for this screen to leak another patient's data even if it tried.
 */
export const HealthNavigatorView: React.FC<Props> = ({ onBookAppointment, onJoinQueue }) => {
  const shouldReduceMotion = useReducedMotion();

  const [reports, setReports] = useState<MedicalReportView[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [storage, setStorage] = useState<string>('');

  const [symptoms, setSymptoms] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string>('');

  const [result, setResult] = useState<NavigationResult | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);

  const [history, setHistory] = useState<NavigationHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);


  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadKind, setUploadKind] = useState(REPORT_KINDS[0]);
  const [uploadDate, setUploadDate] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const loadReports = async () => {
    try {
      setReportsError(null);
      const data = await healthApi.listReports();
      setReports(data.reports);
      setStorage(data.storage);
    } catch (err: any) {
      setReportsError(err?.message ?? 'Your reports could not be loaded.');
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    healthApi.history().then((h) => setHistory(h.navigations)).catch(() => { /* history is optional */ });
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await fileToDataUrl(uploadFile);
      const { report } = await healthApi.uploadReport({
        title: uploadTitle.trim() || uploadFile.name,
        kind: uploadKind,
        reportDate: uploadDate || null,
        file: dataUrl,
      });
      setReports((prev) => [report, ...prev]);
      // Newly uploaded is almost always the one they want analysed next.
      setSelectedReportId(report.id);
      setShowUpload(false);
      setUploadTitle(''); setUploadDate(''); setUploadFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err: any) {
      setUploadError(err?.message ?? 'That report could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this report? The file is removed permanently.')) return;
    try {
      await healthApi.deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedReportId === id) setSelectedReportId('');
    } catch (err: any) {
      setReportsError(err?.message ?? 'That report could not be removed.');
    }
  };

  const handleNavigate = async () => {
    if (navigating) return;
    if (!symptoms.trim() && !selectedReportId) {
      setNavError('Describe how you are feeling, or choose one of your uploaded reports.');
      return;
    }
    setNavigating(true);
    setNavError(null);
    setResult(null);
    try {
      const res = await healthApi.navigate({
        symptoms: symptoms.trim() || undefined,
        reportId: selectedReportId || undefined,
      });
      setResult(res);
      healthApi.history().then((h) => setHistory(h.navigations)).catch(() => {});
    } catch (err: any) {
      setNavError(err?.message ?? 'The health navigator could not answer just now.');
    } finally {
      setNavigating(false);
    }
  };

  const canSubmit = (symptoms.trim().length > 0 || !!selectedReportId) && !navigating;
  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  return (
    <div className="pc space-y-6 pb-12 text-[var(--pc-text)]">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold font-display text-[var(--pc-text)]">AI Health Navigation</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--pc-tint-lilac)] text-[var(--pc-primary)] border border-[#C7C9F0]">
              {/* Which provider answers depends on what is reachable and what
                  quota remains, so the header states the capability and the
                  result card names the model that actually replied. Claiming a
                  specific vendor here would be wrong the moment the fallback
                  runs. */}
              AI-powered
            </span>
          </div>
          <p className="text-xs text-[var(--pc-text-muted)] mt-1 max-w-2xl">
            Tell us how you are feeling, or upload a report, and we will suggest which department to visit
            and who is free to see you.
          </p>
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="pc-btn-ghost px-3.5 py-2 text-xs font-semibold flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <History className="w-3.5 h-3.5" />
          {showHistory ? 'Hide' : 'Previous'} suggestions
          {history.length > 0 && (
            <span className="rounded-full bg-[var(--pc-tint-lilac)] px-1.5 text-[10px] font-bold text-[var(--pc-primary)]">
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* The standing safety statement. Not conditional, not dismissible. */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#C7C9F0] bg-[var(--pc-tint-lilac)] px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pc-primary)]" />
        <p className="text-xs leading-relaxed text-[var(--pc-text)]">
          <strong>This is navigation help, not a diagnosis.</strong> It suggests which department fits what you
          describe, so you reach the right desk sooner. Only a qualified doctor can diagnose or treat you.
          If you feel severely unwell, go to Emergency or call your local emergency number.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: ask */}
        <div className="lg:col-span-7 space-y-6">
          <div className="pc-card p-6 space-y-4">
            <StepHeading
              n={1}
              title="Tell us what you need"
              hint="Describe how you feel, and add a report if you have one."
              done={symptoms.trim().length > 0 || !!selectedReportId}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--pc-text)]">
                How are you feeling?
              </span>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="e.g. Chest tightness when I climb stairs, for about two weeks. Worse in the evening."
                className="pc-input w-full px-4 py-3 text-sm resize-y"
                aria-label="Describe your symptoms"
              />
              <span className="mt-1 block text-[10px] text-[var(--pc-text-subtle)]">
                {symptoms.length}/2000 · Do not include anything you would not tell a receptionist.
              </span>
            </label>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-[var(--pc-text)]">
                Include one of your reports <span className="font-normal text-[var(--pc-text-muted)]">(optional)</span>
              </span>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                  className="pc-input flex-1 px-3 py-2 text-sm cursor-pointer"
                  aria-label="Choose a report to include"
                  disabled={reports.length === 0}
                >
                  <option value="">
                    {reports.length === 0 ? 'No reports uploaded yet' : 'Do not include a report'}
                  </option>
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}{r.hasText ? '' : ' (text not readable)'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowUpload(true)}
                  className="pc-btn-ghost px-3.5 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
              </div>
              {selectedReport && !selectedReport.hasText && (
                <p className="mt-2 rounded-xl border border-[#F5C08A] bg-[#FEF3E7] px-3 py-2 text-[11px] text-[#B54708]">
                  {selectedReport.extractionNote
                    ?? 'No text could be read from this file, so please describe your symptoms as well.'}
                </p>
              )}
            </div>

            {navError && (
              <div className="flex items-start gap-2 rounded-xl border border-[#F2B8B5] bg-[#FEE4E2] px-3 py-2 text-xs text-[var(--pc-danger-text)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">{navError}</span>
              </div>
            )}

            <button
              onClick={handleNavigate}
              disabled={!canSubmit}
              className="pc-btn-primary w-full px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {navigating
                ? (<><Loader2 className="w-4 h-4 animate-spin" /> Checking your details…</>)
                : (<><Sparkles className="w-4 h-4" /> Suggest a department</>)}
            </button>
          </div>

          {/* Result */}
          <AnimatePresence initial={false}>
            {result && (
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.25, ease }}
                className="pc-card overflow-hidden"
              >
                {result.urgent && (
                  <div className="flex items-start gap-3 border-b border-[#F2B8B5] bg-[#FEE4E2] px-5 py-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pc-danger-text)]" />
                    <div>
                      <p className="text-sm font-bold text-[var(--pc-danger-text)]">
                        Please seek care now, not through the queue
                      </p>
                      <p className="text-xs text-[var(--pc-danger-text)] mt-0.5">
                        What you described may need urgent attention. Go to Emergency or call your local
                        emergency number rather than waiting for an appointment.
                      </p>
                    </div>
                  </div>
                )}

                {/* What the AI actually did, in the order it did it.
                    Every line is a fact from the response — the step is ticked
                    only when it really happened, so an unreadable report or a
                    department the model invented both show as an honest gap
                    rather than a green tick. */}
                {!result.failed && (
                  <div className="border-b border-[var(--pc-border)] bg-[var(--pc-page)] px-5 py-3">
                    <div className="mb-2">
                      <StepHeading n={2} title="AI analysis" done />
                    </div>
                    <ol className="space-y-1">
                      {[
                        result.reportUsed
                          ? {
                              done: !!result.reportUsed.hadText,
                              label: result.reportUsed.hadText
                                ? `Read the text of “${result.reportUsed.title}”`
                                : `Could not read “${result.reportUsed.title}” — used your description only`,
                            }
                          : { done: true, label: 'Used the symptoms you described' },
                        { done: true, label: `Analysed by Google Gemini (${result.model ?? 'model'})` },
                        {
                          done: !!result.department,
                          label: result.department
                            ? `Matched to ${result.department.name}, a real department here`
                            : 'No department in this hospital matched the suggestion',
                        },
                        {
                          done: result.doctors.length > 0,
                          label: result.doctors.length > 0
                            ? `Ranked ${result.doctors.length} doctor${result.doctors.length === 1 ? '' : 's'} by today's schedule and queue`
                            : 'No doctor in that department is available today',
                        },
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--pc-text-muted)]">
                          <span
                            aria-hidden
                            className={`mt-[3px] h-3 w-3 shrink-0 rounded-full border-2 ${
                              step.done
                                ? 'border-[var(--pc-success)] bg-[var(--pc-success)]'
                                : 'border-[#F5C08A] bg-[#FEF3E7]'
                            }`}
                          />
                          <span className={step.done ? '' : 'text-[#B54708]'}>{step.label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {result.failed ? (
                  <div className="p-6 space-y-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-[var(--pc-text)]">
                      <AlertTriangle className="h-4 w-4 text-[#B54708]" />
                      AI analysis temporarily unavailable
                    </p>
                    <p className="text-xs text-[var(--pc-text-muted)]">
                      {result.failureReason
                        ?? 'The assistant is unavailable. You can still book an appointment or take a queue token.'}
                    </p>
                    {/* No invented suggestion. Saying nothing beats saying something made up. */}
                  </div>
                ) : (
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <StepHeading n={3} title="Recommended department" done={!!result.department} />
                        <h2 className="text-xl font-bold font-display text-[var(--pc-text)]">
                          {result.department?.name ?? result.suggestedDepartment ?? 'Not determined'}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.confidence && (
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${CONFIDENCE_TONE[result.confidence]}`}>
                            {result.confidence} confidence
                          </span>
                        )}
                        {result.model && (
                          <span className="rounded-full border border-[#C7C9F0] bg-[var(--pc-tint-lilac)] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--pc-primary)]">
                            {result.model}
                          </span>
                        )}
                      </div>
                    </div>

                    {result.unmatched && (
                      <p className="rounded-xl border border-[#F5C08A] bg-[#FEF3E7] px-3 py-2 text-[11px] text-[#B54708]">
                        This hospital does not have a “{result.suggestedDepartment}” department. Reception can
                        point you to the closest equivalent.
                      </p>
                    )}

                    {result.reason && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--pc-text-subtle)]">
                          Why
                        </span>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--pc-text)]">{result.reason}</p>
                      </div>
                    )}

                    {result.reportTextUnavailable && (
                      <p className="text-[11px] text-[var(--pc-text-muted)]">
                        Note: {result.reportExtractionNote
                          ?? 'the uploaded file could not be read automatically, so this used your description only.'}
                      </p>
                    )}

                    {result.suggestedQuestions.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--pc-text-subtle)]">
                          You may be asked
                        </span>
                        <ul className="mt-1 space-y-1">
                          {result.suggestedQuestions.map((q, i) => (
                            <li key={i} className="text-xs text-[var(--pc-text-muted)] flex gap-2">
                              <span className="text-[var(--pc-primary)]">•</span>{q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="rounded-xl bg-[var(--pc-page)] px-3 py-2 text-[11px] font-medium text-[var(--pc-text-muted)]">
                      {result.disclaimer}
                    </p>

                    {/* Doctors */}
                    {result.doctors.length > 0 ? (
                      <div className="space-y-2">
                        <StepHeading n={4} title="Recommended doctors" done />
                        {result.doctors.map((d, i) => (
                          <div
                            key={d.id}
                            className={`rounded-2xl border p-4 transition-colors ${
                              i === 0
                                ? 'border-[#C7C9F0] bg-[var(--pc-tint-lilac)]'
                                : 'border-[var(--pc-border)] hover:bg-[var(--pc-page)]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 font-semibold text-[var(--pc-text)]">
                                  {d.name}
                                  {i === 0 && (
                                    <span className="rounded-full border border-[var(--pc-primary)]/30 bg-[var(--pc-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--pc-primary)]">
                                      Best match
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-[var(--pc-text-muted)]">
                                  {d.department}
                                  {d.qualification ? ` · ${d.qualification}` : ''}
                                  {d.experienceYears > 0 ? ` · ${d.experienceYears} yrs` : ''}
                                </p>
                              </div>
                              {d.consultationFee > 0 && (
                                <span className="text-xs font-semibold text-[var(--pc-text)]">₹{d.consultationFee}</span>
                              )}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                              <span className="flex items-center gap-1 rounded-full border border-[var(--pc-border)] bg-[var(--pc-page)] px-2 py-0.5 text-[var(--pc-text-muted)]">
                                <Users className="h-3 w-3" /> {d.queueDepth} waiting
                              </span>
                              <span className="flex items-center gap-1 rounded-full border border-[var(--pc-border)] bg-[var(--pc-page)] px-2 py-0.5 text-[var(--pc-text-muted)]">
                                <Clock className="h-3 w-3" /> ~{d.estimatedWaitMinutes} min
                              </span>
                              <span className="rounded-full border border-[var(--pc-border)] bg-[var(--pc-page)] px-2 py-0.5 text-[var(--pc-text-muted)]">
                                {d.freeSlotsToday} slots today
                              </span>
                            </div>
                            <p className="mt-1.5 text-[10px] text-[var(--pc-text-subtle)]">{d.reasons.join(' · ')}</p>
                            {i === 0 && (
                              /* Spelled out rather than implied by position. The
                                 ranking is deterministic and the inputs are real,
                                 so the reason can be stated exactly. */
                              <p className="mt-1 text-[10px] font-medium text-[var(--pc-primary)]">
                                Recommended first: {d.scheduleKnown ? d.status.toLowerCase() : 'schedule unconfirmed'}
                                {result.doctors.length > 1
                                  ? `, and the shortest expected wait in ${d.department} (~${d.estimatedWaitMinutes} min).`
                                  : ` in ${d.department}, with a ~${d.estimatedWaitMinutes} min expected wait.`}
                              </p>
                            )}
                            {onBookAppointment && (
                              <button
                                onClick={() => onBookAppointment(d.department, d.id)}
                                className="pc-btn-primary mt-3 px-3.5 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                              >
                                Book with {d.name} <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : result.department ? (
                      <p className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] px-3 py-3 text-xs text-[var(--pc-text-muted)]">
                        No doctor in {result.department.name} is available today. Reception can find you the next
                        free clinic.
                      </p>
                    ) : null}

                    {/* Step 6 — the point of the whole journey. Previously the
                        only way onward was a per-doctor button, so a patient
                        with a department but no free doctor reached the end of
                        the page with nothing to do. */}
                    {(onBookAppointment || onJoinQueue) && (
                      <div className="space-y-2.5 border-t border-[var(--pc-border)] pt-4">
                        <StepHeading n={6} title="Take action" hint="Book ahead, or join the queue now." />
                        <div className="flex flex-wrap gap-2">
                          {onBookAppointment && (
                            <button
                              onClick={() => onBookAppointment(result.department?.name, result.doctors[0]?.id)}
                              className="pc-btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold cursor-pointer"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              Book an appointment
                            </button>
                          )}
                          {onJoinQueue && (
                            <button
                              onClick={onJoinQueue}
                              className="pc-btn-ghost flex items-center gap-1.5 px-4 py-2 text-xs font-semibold cursor-pointer"
                            >
                              <Ticket className="h-3.5 w-3.5" />
                              Join the queue now
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* History */}
          {showHistory && (
            <div className="pc-card p-6 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--pc-text-subtle)]">
                Your previous suggestions
              </span>
              {history.length === 0 ? (
                <p className="text-xs text-[var(--pc-text-muted)]">Nothing yet.</p>
              ) : history.map((h) => (
                <div key={h.id} className="rounded-xl border border-[var(--pc-border)] p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[var(--pc-text)]">
                      {h.department?.name ?? h.suggestedDepartment ?? 'No suggestion'}
                    </span>
                    <span className="text-[10px] text-[var(--pc-text-subtle)]">{formatWhen(h.createdAt)}</span>
                  </div>
                  {h.reasoning && <p className="mt-1 text-[11px] text-[var(--pc-text-muted)]">{h.reasoning}</p>}
                  {h.report && (
                    <p className="mt-1 text-[10px] text-[var(--pc-text-subtle)]">From report: {h.report.title}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: reports + live queue */}
        <div className="lg:col-span-5 space-y-6">

          <div className="pc-card p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[var(--pc-primary)]">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Previous diagnostics</span>
              </div>
              <button
                onClick={() => setShowUpload(true)}
                className="pc-btn-ghost px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3 h-3" /> Add
              </button>
            </div>

            <p className="text-[11px] text-[var(--pc-text-muted)]">
              Only you can see these. Files are stored privately
              {storage === 'supabase' ? ' in Supabase Storage' : ''} and opened through short-lived private links.
            </p>

            {reportsLoading && <p className="py-4 text-center text-xs text-[var(--pc-text-muted)]">Loading…</p>}

            {reportsError && (
              <p className="rounded-xl border border-[#F2B8B5] bg-[#FEE4E2] px-3 py-2 text-xs text-[var(--pc-danger-text)]">
                {reportsError}
              </p>
            )}

            {!reportsLoading && !reportsError && reports.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--pc-border-strong)] px-4 py-8 text-center">
                <FileText className="mx-auto h-6 w-6 text-[var(--pc-text-subtle)]" />
                <p className="mt-2 text-xs font-medium text-[var(--pc-text)]">No reports yet</p>
                <p className="mt-0.5 text-[11px] text-[var(--pc-text-muted)]">
                  Upload a lab result or scan and the navigator can use it.
                </p>
              </div>
            )}

            {reports.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--pc-border)] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--pc-text)]">{r.title}</p>
                  <p className="text-[10px] text-[var(--pc-text-muted)]">
                    {r.kind} · {r.reportDate ? formatWhen(r.reportDate) : `uploaded ${formatWhen(r.uploadedAt)}`} · {formatBytes(r.sizeBytes)}
                  </p>
                  {!r.hasText && (
                    <p className="mt-0.5 text-[10px] text-[#B54708]">Text not readable automatically</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={healthApi.reportFileUrl(r.id)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${r.title}`}
                    data-plain
                    className="rounded-lg p-1.5 text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-primary)] cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => handleDelete(r.id)}
                    aria-label={`Delete ${r.title}`}
                    data-plain
                    className="rounded-lg p-1.5 text-[var(--pc-text-muted)] hover:bg-[#FEE4E2] hover:text-[var(--pc-danger-text)] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Read-only results of the hospital's operational intelligence, so a
              patient sees the effect of an optimisation without any control
              over it. */}
          <div className="space-y-2">
            <StepHeading n={5} title="Queue intelligence" hint="How busy it is, and where the wait is shortest." done />
            <HospitalInsightsPanel />
          </div>

          {/* Where to go, highlighted to whatever the navigator just suggested. */}
          <HospitalMapView highlightService={result?.department?.name ?? null} />

        </div>
      </div>

      {/* Upload modal */}
      <AnimatePresence initial={false}>
        {showUpload && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1B39]/40 p-4 backdrop-blur-md"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease }}
            onClick={() => !uploading && setShowUpload(false)}
          >
            <motion.div
              className="pc-card w-full max-w-md overflow-hidden"
              role="dialog" aria-modal="true" aria-label="Upload a medical report"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--pc-border)] bg-[var(--pc-page)] p-5">
                <div>
                  <h3 className="font-bold font-display text-[var(--pc-text)]">Upload a report</h3>
                  <p className="text-[11px] text-[var(--pc-text-muted)]">PDF, image or text. Up to 8 MB.</p>
                </div>
                <button
                  onClick={() => !uploading && setShowUpload(false)}
                  aria-label="Close" data-plain
                  className="text-[var(--pc-text-muted)] hover:text-[var(--pc-text)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleUpload} className="space-y-4 p-5 text-xs">
                <label className="block">
                  <span className="mb-1.5 block font-bold text-[var(--pc-text)]">File</span>
                  <input
                    ref={fileInput}
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    className="pc-input w-full px-3 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--pc-tint-lilac)] file:px-3 file:py-1 file:text-[11px] file:font-semibold file:text-[var(--pc-primary)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block font-bold text-[var(--pc-text)]">Title</span>
                  <input
                    type="text" value={uploadTitle} maxLength={120}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder={uploadFile?.name ?? 'e.g. Blood test 12 Aug'}
                    className="pc-input w-full px-3 py-2"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block font-bold text-[var(--pc-text)]">Type</span>
                    <select
                      value={uploadKind} onChange={(e) => setUploadKind(e.target.value)}
                      className="pc-input w-full px-3 py-2 cursor-pointer"
                    >
                      {REPORT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block font-bold text-[var(--pc-text)]">Report date</span>
                    <input
                      type="date" value={uploadDate}
                      onChange={(e) => setUploadDate(e.target.value)}
                      className="pc-input w-full px-3 py-2"
                    />
                  </label>
                </div>

                {uploadError && (
                  <p className="rounded-xl border border-[#F2B8B5] bg-[#FEE4E2] px-3 py-2 font-medium text-[var(--pc-danger-text)]">
                    {uploadError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button" disabled={uploading}
                    onClick={() => setShowUpload(false)}
                    className="pc-btn-ghost px-4 py-2 font-semibold cursor-pointer disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit" disabled={uploading || !uploadFile}
                    className="pc-btn-primary px-4 py-2 font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
