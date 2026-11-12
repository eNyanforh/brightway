const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Ratios are width / height. Preserve upload order and give the first photo
// visual emphasis; use the other dimensions to size the surrounding frame.
export function photoLayout(measurements) {
  const ratios = measurements.map(value => Number.isFinite(value) && value > 0 ? value : 1);
  const count = ratios.length;
  if (count === 1) return { layout: "single", aspect: clamp(ratios[0], .8, 1.91) };
  if (count === 2) return { layout: "pair", aspect: clamp(2 * Math.min(...ratios), .8, 3) };
  const first = ratios[0] || 1;
  const remaining = ratios.slice(1);
  if (first >= 4 / 3) {
    const topHeight = 1 / first;
    // Equal-width secondary photos use the shortest natural height.
    const bottomHeight = 1 / (remaining.length * Math.max(...remaining));
    return { layout: "landscape", aspect: clamp(1 / (topHeight + bottomHeight), .8, 1.91),
      lead: clamp(topHeight / (topHeight + bottomHeight), .4, .75) };
  }
  const secondaryWidth = 1 / remaining.reduce((sum, ratio) => sum + 1 / ratio, 0);
  return { layout: "portrait", aspect: clamp(first + secondaryWidth, .8, 1.91),
    lead: clamp(first / (first + secondaryWidth), .5, .67) };
}
