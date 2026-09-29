/**
 * Where a moment of the recording lands in the encoded video. Each captured
 * frame lasts until the next one arrived, and time spent waiting on the
 * network plays `factor` times faster, so the video's clock and the wall
 * clock drift apart; captions, focuses and the poster are marked on the wall
 * clock and must be moved onto the video's.
 *
 * The speed-up is integrated over each frame's own span. A still page sends
 * no frames, so one frame can last many seconds; applying the speed at the
 * frame's start to all of it (as this once did) compressed whole seconds of a
 * held shot because they began inside a short wait.
 */
export interface Speedup { waits: readonly { from: number; to: number }[]; factor: number }

/** Sorted, with overlapping waits merged, so none is counted twice. */
function merged(waits: Speedup["waits"]) {
  const out: { from: number; to: number }[] = [];
  for (const w of [...waits].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && w.from <= last.to) last.to = Math.max(last.to, w.to);
    else out.push({ ...w });
  }
  return out;
}

export function buildTimeline(
  frames: { at: number }[],
  end: number,
  speed: Speedup,
): { durations: number[]; total: number; outputTime(t: number): number; frameAt(t: number): number } {
  const waits = merged(speed.waits);
  /** Output seconds between two wall-clock moments. */
  const span = (from: number, to: number) => {
    let d = to - from;
    for (const w of waits) {
      const overlap = Math.min(to, w.to) - Math.max(from, w.from);
      if (overlap > 0) d -= overlap * (1 - 1 / speed.factor);
    }
    return d;
  };

  const durations: number[] = [];
  const starts: number[] = [];
  let clock = 0;
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.at ?? end;
    const d = Math.max(span(f.at, Math.max(next, f.at)), 0.001);
    starts.push(clock);
    durations.push(d);
    clock += d;
  });
  return {
    durations,
    total: clock,
    outputTime(t) {
      let i = -1;
      for (let j = 0; j < frames.length; j++) if (frames[j]!.at <= t) i = j;
      if (i < 0) return 0;
      const next = frames[i + 1]?.at ?? end;
      return starts[i]! + Math.min(durations[i]!, Math.max(0, span(frames[i]!.at, Math.min(t, next))));
    },
    /** The frame on screen at output time `t`: 0 before the start, the last
     *  one after the end. */
    frameAt(t) {
      let i = 0;
      for (let j = 0; j < starts.length; j++) if (starts[j]! <= t) i = j;
      return i;
    },
  };
}
