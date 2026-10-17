export const MIN_RECEIVED_FOR_INGRATE = 3;

export function mostObsessed(matrix) {
  return matrix.filter((cell) => cell.from_id !== cell.to_id).reduce((best, cell) => (!best || cell.total > best.total ? cell : best), null);
}

export function bestDuo(matrix) {
  const byPair = new Map(matrix.map((cell) => [`${cell.from_id}|${cell.to_id}`, cell]));
  return matrix.reduce((best, cell) => {
    if (cell.from_id >= cell.to_id) return best;
    const reverse = byPair.get(`${cell.to_id}|${cell.from_id}`);
    if (!reverse) return best;
    const score = cell.total + reverse.total;
    return !best || score > best.score ? { a: cell.from_name, b: cell.to_name, score } : best;
  }, null);
}

export function biggestIngrate(givers, receivers) {
  const givenById = new Map(givers.map((giver) => [giver.id, giver.total]));
  return receivers.reduce((best, receiver) => {
    if (receiver.total < MIN_RECEIVED_FOR_INGRATE) return best;
    const score = receiver.total - (givenById.get(receiver.id) ?? 0);
    return score > 0 && (!best || score > best.score) ? { name: receiver.name, score } : best;
  }, null);
}

export function heatmapGrid(matrix) {
  const names = [...new Set(matrix.flatMap((cell) => [cell.from_name, cell.to_name]))].sort();
  const totals = new Map(matrix.map((cell) => [`${cell.from_name}|${cell.to_name}`, cell.total]));
  const maxCell = Math.max(...matrix.map((cell) => cell.total), 1);
  const valueOf = (from, to) => (from === to ? null : totals.get(`${from}|${to}`) ?? 0);
  return { names, maxCell, valueOf };
}

export const percentOf = (value, max) => (max > 0 ? Math.round((value / max) * 100) : 0);
