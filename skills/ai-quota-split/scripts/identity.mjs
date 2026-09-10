export function normalizeName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function distance(left, right, limit) {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let best = current[0];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      best = Math.min(best, current[column]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

export function rankMemberChoices(input, members) {
  const normalized = normalizeName(input);
  const exact = members.find((member) => normalizeName(member.displayName) === normalized);
  if (exact) return [{ kind: "exact", member: exact }];
  const limit = Math.max(1, Math.floor(normalized.length * 0.25));
  const similar = members
    .map((member) => ({ member, score: distance(normalized, normalizeName(member.displayName), limit) }))
    .filter(({ score }) => score <= limit)
    .sort((left, right) => left.score - right.score || left.member.displayName.localeCompare(right.member.displayName));
  if (similar.length) return similar.map(({ member }) => ({ kind: "similar", member }));
  return [{ kind: "new", displayName: input.trim() }];
}
