export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export interface SM2State {
  interval: number;
  repetition: number;
  ease_factor: number;
}

export function calculateSM2(state: SM2State, grade: Grade) {
  let { interval, repetition, ease_factor } = state;

  if (grade >= 3) {
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease_factor);
    }
    repetition += 1;
  } else {
    repetition = 0;
    interval = 1;
  }

  ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + interval);

  return {
    interval,
    repetition,
    ease_factor,
    due_date: nextDue.toISOString().split('T')[0],
  };
}
