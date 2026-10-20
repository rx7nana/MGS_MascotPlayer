function mergeRanges(ranges, begin, end) {
  if (!(end > begin)) return ranges;
  const result = [];
  for (const r of [...ranges, [begin, end]].sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else result.push([...r]);
  }
  return result;
}
function rangeEnd(ranges, sample) {
  return ranges.find(([a, b]) => a <= sample && sample < b)?.[1] ?? sample;
}
function containsRange(ranges, begin, end) {
  return end <= begin || ranges.some(([a, b]) => a <= begin && b >= end);
}
export {
  containsRange,
  mergeRanges,
  rangeEnd
};
