// Illustrative local response, not a hydraulic solver. An unrelated stage cannot
// change a pipe. A stalled endpoint takes precedence over an overspeed endpoint.
export function flowSpeed(states, time) {
  const active=states.filter(s=>s&&s.state!=='repairing'&&s.state!=='resolved');
  if(!active.length)return 2.2;
  return Math.min(...active.map(s=>s.variant===1?0:s.variant===2?2.2*(.15+.85*Math.max(0,Math.sin(time*2))):4.4));
}
