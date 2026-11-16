// Geometry for the board's clue drawing, in cell units (the SVG's viewBox is 0 0 9 9).

/** Centre of a cell. */
export const centre = (i: number, width = 9): [number, number] => [(i % width) + .5, Math.floor(i / width) + .5];

/** Arrow shafts start at the circle edge, never through the circled digit. */
export function arrowPoints(circle: number, cells: number[]): string {
  const a = centre(circle), b = centre(cells[0]), length = Math.hypot(b[0]-a[0], b[1]-a[1]);
  const start = [a[0]+(b[0]-a[0])*.38/length, a[1]+(b[1]-a[1])*.38/length];
  return [start, ...cells.map(i => centre(i))].map(p => p.join(',')).join(' ');
}

/** Points of a thermometer's line, bulb to tip. */
export const thermoPoints = (t: number[]): string => t.map(i => centre(i).join(',')).join(' ');

/** The dashed outline of a killer cage, as segments inset from the cage's border. */
export function cageEdges(cells: number[], d = .09, width = 9): [number, number, number, number][] {
  const set = new Set(cells), out: [number, number, number, number][] = [];
  const has = (r: number, c: number) => r >= 0 && r < width && c >= 0 && c < width && set.has(r * width + c);
  const sides: [number, number, number, number][] = [[-1, 0, 0, 1], [0, 1, 1, 0], [1, 0, 0, 1], [0, -1, 1, 0]]; // [dr, dc, tr, tc]
  for (const i of cells) {
    const r = Math.floor(i / width), c = i % width;
    for (const [dr, dc, tr, tc] of sides) {
      if (has(r + dr, c + dc)) continue;
      // How far each end is pulled in: past the corner when the outline turns, flush when it continues.
      const pull = (e: 1 | -1) => {
        const along = has(r + e * tr, c + e * tc);
        return along ? (has(r + e * tr + dr, c + e * tc + dc) ? -d : 0) : d;
      };
      const a = pull(-1), b = pull(1);
      if (tr === 0) { // horizontal side (top or bottom), runs along x
        const y = dr < 0 ? r + d : r + 1 - d;
        out.push([c + a, y, c + 1 - b, y]);
      } else {
        const x = dc > 0 ? c + 1 - d : c + d;
        out.push([x, r + a, x, r + 1 - b]);
      }
    }
  }
  return out;
}
