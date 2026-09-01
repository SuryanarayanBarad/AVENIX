/**
 * Unit checks for the crowd forecast. No database, no server — pure functions
 * with known inputs, so the arithmetic is verified rather than eyeballed on a
 * dashboard where a wrong number looks the same as a right one.
 */
import {
  forecastCrowd, recommendationsFor, riskForWait, worstRisk, minutesOfDay,
  type ArrivalObservation, type CompletionObservation,
} from '../lib/crowdForecast.ts';

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

const NOW = new Date('2026-09-01T10:00:00Z');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** n arrivals spread evenly across the last `windowMinutes`. */
const arrivals = (n: number, windowMinutes = 60): ArrivalObservation[] =>
  Array.from({ length: n }, (_, i) => ({
    issuedAt: minsAgo(Math.floor((i / Math.max(1, n)) * windowMinutes)),
    serviceId: 'svc',
  }));

const completions = (n: number, windowMinutes = 60): CompletionObservation[] =>
  Array.from({ length: n }, (_, i) => ({
    completedAt: minsAgo(Math.floor((i / Math.max(1, n)) * windowMinutes)),
    serviceId: 'svc',
  }));

console.log('1. helpers');
ok('minutesOfDay parses 24h', minutesOfDay('14:30') === 870);
ok('minutesOfDay parses 12h AM', minutesOfDay('9:05 AM') === 545);
ok('minutesOfDay parses 12h PM', minutesOfDay('2:30 PM') === 870);
ok('minutesOfDay parses midnight', minutesOfDay('12:00 AM') === 0);
ok('minutesOfDay parses noon', minutesOfDay('12:00 PM') === 720);
ok('minutesOfDay rejects nonsense', minutesOfDay('later') === null);
ok('riskForWait bands', riskForWait(5) === 'low' && riskForWait(25) === 'moderate'
  && riskForWait(40) === 'high' && riskForWait(90) === 'critical');
ok('worstRisk picks the worst', worstRisk(['low', 'critical', 'moderate']) === 'critical');

console.log('\n2. too little data is admitted, not extrapolated');
const thin = forecastCrowd({
  now: NOW, currentQueue: 3, arrivals: arrivals(2), completions: completions(2),
  scheduled: [], nowMinutesOfDay: 600,
});
ok('basis is insufficient-data', thin.basis === 'insufficient-data', thin.basis);
ok('it says why', thin.basisNote.includes('Too few arrivals'));
ok('no arrivals are invented', thin.horizons.every((h) => h.expectedArrivals === 0));
ok('the queue is not projected upward', thin.horizons.every((h) => h.projectedQueue <= 3));
const thinRecs = recommendationsFor(thin, { openCounters: 2, idleCounters: 1 });
ok('and it recommends no action', thinRecs.length === 1 && thinRecs[0].actionable === false);

console.log('\n3. a growing queue is detected from real rates');
// 60 arrivals/hour = 1.0/min against 30 completions/hour = 0.5/min.
const growing = forecastCrowd({
  now: NOW, currentQueue: 20, arrivals: arrivals(60), completions: completions(30),
  scheduled: [], nowMinutesOfDay: 600,
});
ok('basis is observed', growing.basis === 'observed', growing.basis);
ok('arrival rate is 1.0/min', Math.abs(growing.arrivalRatePerMin - 1) < 0.01, `${growing.arrivalRatePerMin}`);
ok('service rate is 0.5/min', Math.abs(growing.serviceRatePerMin - 0.5) < 0.01, `${growing.serviceRatePerMin}`);
ok('net growth is +0.5/min', Math.abs(growing.netGrowthPerMin - 0.5) < 0.01, `${growing.netGrowthPerMin}`);
// Q(30) = 20 + 30 arrivals - 15 served = 35
const h30 = growing.horizons.find((h) => h.minutes === 30)!;
ok('30-min queue projects to 35', h30.projectedQueue === 35, `${h30.projectedQueue}`);
// W = 35 / 0.5 = 70 min
ok('30-min wait projects to 70 min', h30.projectedWaitMinutes === 70, `${h30.projectedWaitMinutes}`);
ok('that is critical risk', h30.risk === 'critical', h30.risk);
ok('the queue grows across horizons',
   growing.horizons[0].projectedQueue < growing.horizons[2].projectedQueue);

console.log('\n4. a draining queue is not reported as a surge');
const draining = forecastCrowd({
  now: NOW, currentQueue: 10, arrivals: arrivals(20), completions: completions(60),
  scheduled: [], nowMinutesOfDay: 600,
});
ok('net growth is negative', draining.netGrowthPerMin < 0, `${draining.netGrowthPerMin}`);
ok('the queue shrinks', draining.horizons[2].projectedQueue < draining.currentQueue);
ok('it never goes below zero', draining.horizons.every((h) => h.projectedQueue >= 0));
const drainRecs = recommendationsFor(draining, { openCounters: 3, idleCounters: 1 });
ok('and no counter is opened for it', !drainRecs.some((r) => r.id === 'open-counter'));

console.log('\n5. booked appointments count as known arrivals');
const booked = forecastCrowd({
  now: NOW, currentQueue: 5, arrivals: arrivals(30), completions: completions(30),
  // 10:00 now; six booked inside the next 30 minutes, two beyond the hour.
  scheduled: [
    { time: '10:05', serviceId: null }, { time: '10:10', serviceId: null },
    { time: '10:15', serviceId: null }, { time: '10:20', serviceId: null },
    { time: '10:25', serviceId: null }, { time: '10:30', serviceId: null },
    { time: '11:30', serviceId: null }, { time: '12:00', serviceId: null },
  ],
  nowMinutesOfDay: 600,
});
const b15 = booked.horizons.find((h) => h.minutes === 15)!;
const b30 = booked.horizons.find((h) => h.minutes === 30)!;
const b60 = booked.horizons.find((h) => h.minutes === 60)!;
ok('15-min window counts 3 booked', b15.scheduledArrivals === 3, `${b15.scheduledArrivals}`);
ok('30-min window counts 6 booked', b30.scheduledArrivals === 6, `${b30.scheduledArrivals}`);
ok('60-min window excludes the 11:30 and 12:00', b60.scheduledArrivals === 6, `${b60.scheduledArrivals}`);
ok('booked arrivals raise the projection', b30.expectedArrivals > b30.scheduledArrivals);
const bookRecs = recommendationsFor(booked, { openCounters: 2, idleCounters: 0, busiestService: 'General OPD' });
ok('a booked surge is surfaced', bookRecs.some((r) => r.id === 'booked-surge'));

console.log('\n6. recommendations name the number behind them');
const busy = forecastCrowd({
  now: NOW, currentQueue: 40, arrivals: arrivals(60), completions: completions(20),
  scheduled: [], nowMinutesOfDay: 600,
});
const recs = recommendationsFor(busy, { openCounters: 2, idleCounters: 2, quietService: 'Pharmacy' });
ok('an idle counter is offered', recs.some((r) => r.id === 'open-counter'));
ok('the reason cites projected wait', recs.some((r) => /\d+ min/.test(r.reason)));
ok('it is marked actionable', recs.find((r) => r.id === 'open-counter')?.actionable === true);
ok('redirect names the quiet service', recs.some((r) => r.action.includes('Pharmacy')));

const noSpare = recommendationsFor(busy, { openCounters: 4, idleCounters: 0 });
ok('with no idle counter it says so instead', noSpare.some((r) => r.id === 'no-spare-counter'));
ok('and does not offer a counter that does not exist', !noSpare.some((r) => r.id === 'open-counter'));

console.log('\n7. zero throughput does not produce infinity');
const stalled = forecastCrowd({
  now: NOW, currentQueue: 12, arrivals: arrivals(30), completions: [],
  scheduled: [], nowMinutesOfDay: 600,
});
ok('service rate is floored, not zero', stalled.serviceRatePerMin > 0, `${stalled.serviceRatePerMin}`);
ok('waits are finite', Number.isFinite(stalled.currentWaitMinutes)
  && stalled.horizons.every((h) => Number.isFinite(h.projectedWaitMinutes)));
ok('a stalled queue reads as serious', stalled.peakRisk === 'critical', stalled.peakRisk);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
