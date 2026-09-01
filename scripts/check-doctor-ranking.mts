/** Unit checks for doctor ranking. Pure functions, no database. */
import { rankDoctors, matchDepartment, estimateWait, type RankableDoctor } from '../lib/doctorRanking.ts';

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, e = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${l}${e ? ' — ' + e : ''}`); c ? pass++ : fail++; };

const doc = (over: Partial<RankableDoctor> & { id: string; name: string }): RankableDoctor => ({
  departmentId: 'cardio', departmentName: 'Cardiology', isActive: true,
  status: 'Available', queueDepth: 0, freeSlotsToday: 5, experienceYears: 5, ...over,
});

console.log('1. availability outranks a short queue');
const r1 = rankDoctors([
  doc({ id: 'a', name: 'Away Doc', status: 'Unavailable', queueDepth: 0 }),
  doc({ id: 'b', name: 'Busy Doc', status: 'Available', queueDepth: 4 }),
]);
ok('an unavailable doctor is dropped entirely', !r1.some(d => d.id === 'a'), `${r1.length} returned`);
ok('the available one is recommended', r1[0]?.id === 'b');

console.log('\n2. among available doctors, the shorter queue wins');
const r2 = rankDoctors([
  doc({ id: 'long', name: 'Long Queue', queueDepth: 8 }),
  doc({ id: 'short', name: 'Short Queue', queueDepth: 1 }),
]);
ok('shorter queue ranks first', r2[0].id === 'short', r2.map(d => d.id).join(' > '));
ok('the wait reflects the queue', r2[0].estimatedWaitMinutes < r2[1].estimatedWaitMinutes);

console.log('\n3. a delay is penalised and explained');
const r3 = rankDoctors([
  doc({ id: 'ontime', name: 'On Time', queueDepth: 2 }),
  doc({ id: 'late', name: 'Late Doc', queueDepth: 2, status: 'Delayed', delayMinutes: 40 }),
]);
ok('the on-time doctor ranks first', r3[0].id === 'ontime');
ok('the delay is stated', r3.find(d => d.id === 'late')?.reasons.some(x => x.includes('40 min')) === true);
ok('the delay is added to the wait', estimateWait({ ...doc({ id: 'x', name: 'x' }), queueDepth: 2, delayMinutes: 40 }) === 64);

console.log('\n4. department filtering');
const mixed = [doc({ id: 'c', name: 'Cardio' }), doc({ id: 'n', name: 'Neuro', departmentId: 'neuro', departmentName: 'Neurology' })];
ok('only the requested department is returned', rankDoctors(mixed, { departmentId: 'neuro' }).every(d => d.id === 'n'));
ok('no filter returns both', rankDoctors(mixed).length === 2);

console.log('\n5. an unpublished schedule is not treated as absence');
const r5 = rankDoctors([doc({ id: 'unknown', name: 'Unknown', status: null })]);
ok('the doctor is still offered', r5.length === 1);
ok('but flagged as unknown', r5[0].scheduleKnown === false);
ok('and says so', r5[0].reasons.some(x => x.includes('not published')));

console.log('\n6. every result explains itself');
ok('reasons are populated', rankDoctors([doc({ id: 'a', name: 'A', queueDepth: 3 })])[0].reasons.length >= 2);
ok('a fully booked doctor says so', rankDoctors([doc({ id: 'a', name: 'A', freeSlotsToday: 0 })])[0].reasons.some(x => x.includes('Fully booked')));

console.log('\n7. ranking is deterministic');
const twins = [doc({ id: 'x', name: 'Zed' }), doc({ id: 'y', name: 'Amy' })];
ok('ties break by name, stably',
   rankDoctors(twins)[0].name === 'Amy' && rankDoctors([...twins].reverse())[0].name === 'Amy');

console.log('\n8. department matching against the real catalogue');
const depts = [{ id: 'd1', name: 'Cardiology' }, { id: 'd2', name: 'General Medicine' }];
ok('exact match', matchDepartment('Cardiology', depts)?.id === 'd1');
ok('case-insensitive', matchDepartment('cardiology', depts)?.id === 'd1');
ok('handles a wordier answer', matchDepartment('Cardiology Department', depts)?.id === 'd1');
ok('an unknown department matches nothing', matchDepartment('Oncology', depts) === null);
ok('empty input matches nothing', matchDepartment('', depts) === null && matchDepartment(null, depts) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
