export class DebugHUD {
  private el: HTMLDivElement;
  private hist: number[] = [];
  constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', top: '8px', left: '8px', zIndex: 2000,
      background: 'rgba(0,0,0,0.55)', color: '#eaeaea',
      font: '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      padding: '6px 8px', borderRadius: '6px', pointerEvents: 'none'
    });
    this.el.textContent = 'HUD';
    document.body.appendChild(this.el);
  }
  tick(dtMs: number, info: Record<string, number> = {}) {
    this.hist.push(dtMs); if (this.hist.length > 180) this.hist.shift();
    const avg = this.hist.reduce((a,b)=>a+b,0)/this.hist.length;
    const sorted = [...this.hist].sort((a,b)=>a-b);
    let p95 = avg;
    if (sorted.length) {
      const idx = Math.min(sorted.length-1, Math.floor(sorted.length*0.95));
      p95 = sorted[idx] ?? avg;
    }
    const lineBase = `avg ${avg.toFixed(2)}ms | p95 ${p95.toFixed(2)} | fps ${(1000/avg).toFixed(1)}`;
    let line = lineBase;
    const extras = Object.entries(info).map(([k,v])=>`${k}:${v}`).join(' ');
    if (extras) line += ` | ${extras}`;
    this.el.textContent = line;
  }
}
