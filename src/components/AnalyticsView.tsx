import React, { useState } from 'react';
import {
  Download,
  Clock,
  Users,
  Heart,
  Activity,
} from 'lucide-react';

type AnalyticsRange = 'today' | '7d' | '30d' | 'quarter';

interface QueueLoadPoint {
  time: string;
  volume: number;
  wait: number;
}

interface DepartmentPerformance {
  dept: string;
  patients: number;
  avgWait: string;
  compliance: number;
  color: string;
}

interface AnalyticsReport {
  label: string;
  periodDescription: string;
  fileName: string;
  aggregationLabel: string;
  throughputLabel: string;
  throughput: number;
  throughputTrend: string;
  waitReduction: number;
  baselineWait: number;
  currentWait: number;
  slaCompliance: number;
  csat: number;
  csatTrend: string;
  chartTitle: string;
  chartDescription: string;
  queueLoad: QueueLoadPoint[];
  departments: DepartmentPerformance[];
}

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Past 7 Days' },
  { value: '30d', label: 'Past 30 Days' },
  { value: 'quarter', label: 'Q3' },
];

const departmentColors = [
  'bg-gradient-to-r from-[#2E37A4] to-purple-600',
  'bg-gradient-to-r from-blue-400 to-indigo-500',
  'bg-gradient-to-r from-emerald-400 to-teal-500',
  'bg-gradient-to-r from-[#00D3C7] to-rose-500',
  'bg-gradient-to-r from-cyan-400 to-blue-500',
];

const ANALYTICS_REPORTS: Record<AnalyticsRange, AnalyticsReport> = {
  today: {
    label: 'Today',
    periodDescription: 'Current operating day',
    fileName: 'today',
    aggregationLabel: 'Today',
    throughputLabel: 'Daily Throughput',
    throughput: 1420,
    throughputTrend: '+14% vs 30-day daily baseline',
    waitReduction: 42.8,
    baselineWait: 32,
    currentWait: 18,
    slaCompliance: 96.4,
    csat: 4.8,
    csatTrend: '+0.6 rating boost post-AI',
    chartTitle: 'Hourly Queue Load & Wait Durations',
    chartDescription: 'Patient arrival volume vs average waiting duration',
    queueLoad: [
      { time: '08:00', volume: 35, wait: 8 },
      { time: '10:00', volume: 72, wait: 16 },
      { time: '12:00', volume: 95, wait: 24 },
      { time: '14:00', volume: 64, wait: 14 },
      { time: '16:00', volume: 48, wait: 10 },
      { time: '18:00', volume: 28, wait: 6 },
    ],
    departments: [
      { dept: 'General Consultation', patients: 480, avgWait: '12 min', compliance: 98, color: departmentColors[0] },
      { dept: 'Pediatrics Wing', patients: 290, avgWait: '9 min', compliance: 99, color: departmentColors[1] },
      { dept: 'Pharmacy & Dispensing', patients: 360, avgWait: '14 min', compliance: 94, color: departmentColors[2] },
      { dept: 'Specialist Clinics', patients: 190, avgWait: '16 min', compliance: 95, color: departmentColors[3] },
      { dept: 'Billing & Discharge', patients: 100, avgWait: '6 min', compliance: 100, color: departmentColors[4] },
    ],
  },
  '7d': {
    label: 'Past 7 Days',
    periodDescription: 'Rolling seven-day operating period',
    fileName: 'past-7-days',
    aggregationLabel: '7-Day Aggregated',
    throughputLabel: '7-Day Throughput',
    throughput: 9240,
    throughputTrend: '+11% vs previous 7 days',
    waitReduction: 38.3,
    baselineWait: 30,
    currentWait: 18.5,
    slaCompliance: 95.8,
    csat: 4.7,
    csatTrend: '+0.4 rating boost post-AI',
    chartTitle: 'Daily Queue Load & Wait Durations',
    chartDescription: 'Daily arrivals and average waiting duration',
    queueLoad: [
      { time: 'Mon', volume: 61, wait: 17 },
      { time: 'Tue', volume: 74, wait: 19 },
      { time: 'Wed', volume: 83, wait: 21 },
      { time: 'Thu', volume: 78, wait: 18 },
      { time: 'Fri', volume: 94, wait: 23 },
      { time: 'Sat', volume: 58, wait: 15 },
    ],
    departments: [
      { dept: 'General Consultation', patients: 3120, avgWait: '13 min', compliance: 97, color: departmentColors[0] },
      { dept: 'Pediatrics Wing', patients: 1740, avgWait: '10 min', compliance: 98, color: departmentColors[1] },
      { dept: 'Pharmacy & Dispensing', patients: 2380, avgWait: '15 min', compliance: 93, color: departmentColors[2] },
      { dept: 'Specialist Clinics', patients: 1210, avgWait: '17 min', compliance: 94, color: departmentColors[3] },
      { dept: 'Billing & Discharge', patients: 790, avgWait: '7 min', compliance: 99, color: departmentColors[4] },
    ],
  },
  '30d': {
    label: 'Past 30 Days',
    periodDescription: 'Rolling 30-day operating period',
    fileName: 'past-30-days',
    aggregationLabel: '30-Day Aggregated',
    throughputLabel: '30-Day Throughput',
    throughput: 37860,
    throughputTrend: '+9% vs prior 30 days',
    waitReduction: 35.6,
    baselineWait: 28,
    currentWait: 18,
    slaCompliance: 94.9,
    csat: 4.6,
    csatTrend: '+0.3 rating boost post-AI',
    chartTitle: 'Weekly Queue Load & Wait Durations',
    chartDescription: 'Weekly arrivals and average waiting duration',
    queueLoad: [
      { time: 'Week 1', volume: 68, wait: 19 },
      { time: 'Week 2', volume: 76, wait: 20 },
      { time: 'Week 3', volume: 82, wait: 21 },
      { time: 'Week 4', volume: 72, wait: 18 },
      { time: 'Week 5', volume: 46, wait: 16 },
      { time: 'Avg', volume: 69, wait: 19 },
    ],
    departments: [
      { dept: 'General Consultation', patients: 12780, avgWait: '14 min', compliance: 96, color: departmentColors[0] },
      { dept: 'Pediatrics Wing', patients: 7210, avgWait: '11 min', compliance: 97, color: departmentColors[1] },
      { dept: 'Pharmacy & Dispensing', patients: 9810, avgWait: '16 min', compliance: 92, color: departmentColors[2] },
      { dept: 'Specialist Clinics', patients: 4710, avgWait: '18 min', compliance: 93, color: departmentColors[3] },
      { dept: 'Billing & Discharge', patients: 3350, avgWait: '7 min', compliance: 99, color: departmentColors[4] },
    ],
  },
  quarter: {
    label: 'Q3 (Jul–Sep)',
    periodDescription: 'Third-quarter operational report',
    fileName: 'q3',
    aggregationLabel: 'Q3 Aggregated',
    throughputLabel: 'Q3 Throughput',
    throughput: 112340,
    throughputTrend: '+12% vs Q2',
    waitReduction: 31.4,
    baselineWait: 27,
    currentWait: 18.5,
    slaCompliance: 94.2,
    csat: 4.6,
    csatTrend: '+0.2 rating boost vs Q2',
    chartTitle: 'Monthly Queue Load & Wait Durations',
    chartDescription: 'Monthly arrivals and average waiting duration',
    queueLoad: [
      { time: 'Jul', volume: 74, wait: 20 },
      { time: 'Aug', volume: 81, wait: 19 },
      { time: 'Sep', volume: 88, wait: 17 },
      { time: 'Q2 Avg', volume: 70, wait: 23 },
      { time: 'Q3 Avg', volume: 81, wait: 19 },
      { time: 'Target', volume: 62, wait: 18 },
    ],
    departments: [
      { dept: 'General Consultation', patients: 38420, avgWait: '14 min', compliance: 95, color: departmentColors[0] },
      { dept: 'Pediatrics Wing', patients: 21580, avgWait: '11 min', compliance: 97, color: departmentColors[1] },
      { dept: 'Pharmacy & Dispensing', patients: 29240, avgWait: '16 min', compliance: 91, color: departmentColors[2] },
      { dept: 'Specialist Clinics', patients: 14260, avgWait: '18 min', compliance: 92, color: departmentColors[3] },
      { dept: 'Billing & Discharge', patients: 8840, avgWait: '8 min', compliance: 98, color: departmentColors[4] },
    ],
  },
};

const toCsvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

const createCsv = (report: AnalyticsReport) => {
  const rows: Array<Array<string | number>> = [
    ['QueueMind Hospital Queue Analytics Report'],
    ['Report period', report.label],
    ['Period description', report.periodDescription],
    ['Generated at', new Date().toLocaleString()],
    [],
    ['Metric', 'Value'],
    [report.throughputLabel, report.throughput],
    ['Wait time reduction', `${report.waitReduction}%`],
    ['Baseline wait', `${report.baselineWait} min`],
    ['Current average wait', `${report.currentWait} min`],
    ['SLA compliance', `${report.slaCompliance}%`],
    ['Patient CSAT', `${report.csat} / 5.0`],
    [],
    ['Queue interval', 'Queue load index', 'Average wait (min)'],
    ...report.queueLoad.map(({ time, volume, wait }) => [time, volume, wait]),
    [],
    ['Department', 'Patients', 'Average wait', 'SLA compliance'],
    ...report.departments.map(({ dept, patients, avgWait, compliance }) => [dept, patients, avgWait, `${compliance}%`]),
  ];

  return rows.map((row) => row.map(toCsvCell).join(',')).join('\n');
};

export const AnalyticsView: React.FC = () => {
  const [timeRange, setTimeRange] = useState<AnalyticsRange>('7d');
  const [downloading, setDownloading] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const report = ANALYTICS_REPORTS[timeRange];

  const handleExport = () => {
    const blob = new Blob([createCsv(report)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `queuemind-analytics-${report.fileName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);

    setDownloading(true);
    setExportStatus(`${report.label} report downloaded as CSV.`);
    window.setTimeout(() => setDownloading(false), 800);
  };

  const handleRangeChange = (range: AnalyticsRange) => {
    setTimeRange(range);
    setExportStatus('');
  };

  return (
    <div className="space-y-6 pb-12 text-white">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-display">Hospital Queue Analytics & Reports</h1>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 backdrop-blur-md">
              SLA Compliance: {report.slaCompliance}%
            </span>
          </div>
          <p className="mt-1 text-xs text-white/60">
            {report.periodDescription}. Historical operational metrics, patient wait durations, counter utilization benchmarks, and throughput audits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full items-center overflow-x-auto rounded-2xl border border-white/[0.12] bg-white/[0.06] p-1 text-xs font-medium backdrop-blur-md">
            {RANGE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleRangeChange(value)}
                aria-pressed={timeRange === value}
                className={`shrink-0 rounded-xl px-3 py-1.5 transition-all cursor-pointer ${
                  timeRange === value
                    ? 'liquid-glass-active font-semibold'
                    : 'text-white/60 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-2xl border border-white/20 bg-gradient-to-r from-[#2E37A4] to-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#2E37A4]/30 transition-all cursor-pointer hover:from-[#3538CD] hover:to-purple-500 disabled:cursor-wait disabled:opacity-70"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{downloading ? 'Exporting...' : 'Export Report'}</span>
          </button>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{exportStatus}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2 rounded-3xl p-5 glass-panel-elevated">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">{report.throughputLabel}</span>
            <Users className="h-4 w-4 text-[#2E37A4]" />
          </div>
          <div className="text-3xl font-light text-white font-display">
            {report.throughput.toLocaleString()} <span className="text-xs font-normal text-white/50">patients</span>
          </div>
          <span className="block text-[11px] font-semibold text-emerald-400">{report.throughputTrend}</span>
        </div>

        <div className="space-y-2 rounded-3xl p-5 glass-panel-elevated">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Wait Time Reduction</span>
            <Clock className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-light text-emerald-400 font-display">
            -{report.waitReduction}% <span className="text-xs font-normal text-white/50">saved</span>
          </div>
          <span className="block text-[11px] font-semibold text-white/60">From {report.baselineWait} min avg down to {report.currentWait} min</span>
        </div>

        <div className="space-y-2 rounded-3xl p-5 glass-panel-elevated">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Peak Flow Efficiency</span>
            <Activity className="h-4 w-4 text-[#2E37A4]" />
          </div>
          <div className="text-3xl font-light text-white font-display">
            {report.slaCompliance}% <span className="text-xs font-normal text-white/50">SLA met</span>
          </div>
          <span className="block text-[11px] font-semibold text-emerald-400">&lt; 20m target adherence</span>
        </div>

        <div className="space-y-2 rounded-3xl p-5 glass-panel-elevated">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Patient CSAT Rating</span>
            <Heart className="h-4 w-4 text-[#00D3C7]" />
          </div>
          <div className="text-3xl font-light text-white font-display">
            {report.csat} <span className="text-xs font-normal text-white/50">/ 5.0</span>
          </div>
          <span className="block text-[11px] font-semibold text-[#00D3C7]">{report.csatTrend}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-3xl p-6 glass-panel-elevated">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white font-display">{report.chartTitle}</h3>
              <p className="text-xs text-white/60">{report.chartDescription}</p>
            </div>
            <span className="shrink-0 rounded-full border border-[#2E37A4]/30 bg-[#2E37A4]/20 px-2.5 py-0.5 text-xs font-semibold text-[#2E37A4] backdrop-blur-md">
              {report.aggregationLabel}
            </span>
          </div>

          <div className="h-56 w-full pt-4">
            <svg className="h-full w-full overflow-visible" viewBox="0 0 450 180" role="img" aria-label={`${report.label} queue load and wait duration chart`}>
              <line x1="0" y1="30" x2="450" y2="30" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <line x1="0" y1="80" x2="450" y2="80" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <line x1="0" y1="130" x2="450" y2="130" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

              {report.queueLoad.map((point, index) => {
                const x = 35 + index * 70;
                const barHeight = point.volume * 1.2;
                const waitY = 150 - point.wait * 4;

                return (
                  <g key={point.time}>
                    <rect x={x} y={150 - barHeight} width="24" height={barHeight} rx="6" fill="#2E37A4" opacity="0.7" />
                    <circle cx={x + 12} cy={waitY} r="4.5" fill="#00D3C7" stroke="#ffffff" strokeWidth="1.5" />
                    <text x={x + 12} y="168" fontSize="10" fill="rgba(255,255,255,0.5)" textAnchor="middle">{point.time}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl p-6 glass-panel-elevated">
          <div>
            <h3 className="text-base font-bold text-white font-display">Department Service Performance</h3>
            <p className="text-xs text-white/60">Wait times and SLA compliance across hospital units</p>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            {report.departments.map((department) => (
              <div key={department.dept} className="space-y-2 rounded-2xl p-3.5 glass-panel">
                <div className="flex items-center justify-between gap-3 font-semibold">
                  <span className="text-white">{department.dept}</span>
                  <span className="shrink-0 text-white/60">{department.patients.toLocaleString()} patients • avg {department.avgWait}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.10]">
                  <div className={`h-full rounded-full ${department.color}`} style={{ width: `${department.compliance}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
