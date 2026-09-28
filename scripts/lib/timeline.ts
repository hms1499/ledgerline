/**
 * Where a moment of the recording lands in the encoded video. Each captured
 * frame lasts until the next one arrived, divided by the playback speed at
 * that moment (waits on the network play faster), so the video's clock and
 * the wall clock drift apart; captions and the poster are marked on the wall
 * clock and must be moved onto the video's.
 */
export function buildTimeline(
  frames: { at: number }[],
  end: number,
  speedAt: (t: number) => number,
): { durations: number[]; outputTime(t: number): number } {
  const durations: number[] = [];
  const starts: number[] = [];
  let clock = 0;
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.at ?? end;
    const d = Math.max(next - f.at, 0.001) / speedAt(f.at);
    starts.push(clock);
    durations.push(d);
    clock += d;
  });
  return {
    durations,
    outputTime(t) {
      let i = -1;
      for (let j = 0; j < frames.length; j++) if (frames[j]!.at <= t) i = j;
      if (i < 0) return 0;
      const next = frames[i + 1]?.at ?? end;
      const share = Math.min(1, (t - frames[i]!.at) / Math.max(next - frames[i]!.at, 0.001));
      return starts[i]! + share * durations[i]!;
    },
  };
}
