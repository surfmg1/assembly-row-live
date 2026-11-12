// Goals: small things to aim for, checked against the simulation's counters. Completed goals are
// remembered in the browser; each pays a one-time score bonus.
import { Player } from './sim/player';
import { World } from './sim/world';

export interface Goal { id: string; text: string; target: number; pts: number; value: (p: Player, w: World) => number; when?: (w: World) => boolean; }

export const GOALS: Goal[] = [
  { id: 'combo1k', text: 'Bank a 1,000-point combo', target: 1000, pts: 300, value: p => p.best },
  { id: 'combo5k', text: 'Bank a 5,000-point combo', target: 5000, pts: 1500, value: p => p.best },
  { id: 'tokens25', text: 'Collect 25 T tokens', target: 25, pts: 400, value: p => p.st.tokens },
  { id: 'lines3', text: 'Clear 3 whole token lines', target: 3, pts: 800, value: p => p.st.lines },
  { id: 'streak10', text: 'Land 10 tricks without a bail', target: 10, pts: 500, value: p => p.st.streakBest },
  { id: 'grind10', text: 'Grind for 10 seconds in total', target: 10, pts: 500, value: p => Math.floor(p.st.grind) },
  { id: 'air', text: 'Stay in the air for 1.5 seconds', target: 1.5, pts: 400, value: p => Math.round(p.st.air * 10) / 10 },
  { id: 'close3', text: 'Three close calls with traffic', target: 3, pts: 600, value: p => p.st.close },
  { id: 'lap', text: 'Ride a full lap on the bungee', target: 1, pts: 600, value: p => p.st.laps },
  { id: 'sling3', text: 'Three bungee slingshots', target: 3, pts: 500, value: p => p.st.sling },
  { id: 'rivets5', text: 'Find 5 Ford rivets', target: 5, pts: 500, value: p => p.rivetN },
  { id: 'rivets20', text: 'Find all 20 Ford rivets', target: 20, pts: 5000, value: p => p.rivetN },
  { id: 'field', text: 'Mow half the lawns', target: 50, pts: 800, value: p => p.fieldTotal ? Math.floor(p.fieldN / p.fieldTotal * 100) : 0, when: w => !w.env.snow },
  { id: 'plow', text: 'Plow half the Marketplace lot', target: 50, pts: 800, value: p => p.fieldTotal ? Math.floor(p.fieldN / p.fieldTotal * 100) : 0, when: w => w.env.snow },
  { id: 'smash', text: 'Smash 5 snowmen or leaf piles', target: 5, pts: 400, value: p => p.st.soft, when: w => w.env.snow || w.env.season === 'fall' },
  { id: 'trial', text: 'Station to the boathouse', target: 1, pts: 1500, value: p => p.trialBest > 0 ? 1 : 0 },
];

/** Medal thresholds for the two-minute run. */
export const MEDALS: [string, number][] = [['Gold', 12000], ['Silver', 6000], ['Bronze', 2500]];
export const medalFor = (score: number) => { for (const [n, s] of MEDALS) if (score >= s) return n; return ''; };
