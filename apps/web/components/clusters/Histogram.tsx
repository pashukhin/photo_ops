import type { TimeBin } from './histogram';

// Inline SVG bar chart of the per-photo time distribution — one
// <rect data-testid="histogram-bar"> per bin, height proportional to count. Pure /
// dependency-free, so it renders natively in jsdom (unlike the Leaflet map).
export default function Histogram({ bins }: { bins: TimeBin[] }) {
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const w = 100 / Math.max(bins.length, 1);
  return (
    <svg viewBox="0 0 100 40" className="h-32 w-full" role="img" aria-label="Photos over time">
      {bins.map((b, i) => {
        const h = (b.count / maxCount) * 38;
        return (
          <rect
            key={b.startMs}
            data-testid="histogram-bar"
            x={i * w + w * 0.1}
            y={40 - h}
            width={w * 0.8}
            height={h}
            className="fill-primary"
          />
        );
      })}
    </svg>
  );
}
