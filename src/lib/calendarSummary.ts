/**
 * One-line summary for a month of the target calendar: how many finished days hit the
 * target, the streak, and the best day. Today and days to come are not counted.
 */

export interface SummaryDay {
  date: string; // YYYY-MM-DD
  orders: number;
  status: 'hit' | 'near' | 'missed' | 'today' | 'future';
}

export interface MonthSummary {
  finished: number; // finished days in the month
  hit: number;
  /** In the month that contains today: days in a row hit up to yesterday (can run back over earlier months).
   *  In any other month: the longest run inside that month. */
  streak: number;
  streakIsCurrent: boolean;
  best: { date: string; orders: number } | null;
}

const finishedStatus = (s: SummaryDay['status']) => s === 'hit' || s === 'near' || s === 'missed';

export function summariseMonth(days: SummaryDay[], month: string, today: string): MonthSummary {
  const inMonth = days.filter((d) => d.date.startsWith(month) && finishedStatus(d.status));
  const hit = inMonth.filter((d) => d.status === 'hit').length;

  let best: MonthSummary['best'] = null;
  for (const d of inMonth) if (!best || d.orders > best.orders) best = { date: d.date, orders: d.orders };

  const isCurrentMonth = today.startsWith(month);
  let streak = 0;
  if (isCurrentMonth) {
    // Walk back from the most recent finished day, across month boundaries
    const finished = days.filter((d) => finishedStatus(d.status)).sort((a, b) => b.date.localeCompare(a.date));
    for (const d of finished) {
      if (d.status !== 'hit') break;
      streak++;
    }
  } else {
    let run = 0;
    for (const d of [...inMonth].sort((a, b) => a.date.localeCompare(b.date))) {
      run = d.status === 'hit' ? run + 1 : 0;
      if (run > streak) streak = run;
    }
  }

  return { finished: inMonth.length, hit, streak, streakIsCurrent: isCurrentMonth, best };
}
