export function newlyTriggeredDares(previousMembers, nextMembers) {
  if (!previousMembers.length) return [];
  const previousDares = new Map(previousMembers.map((member) => [String(member.id), member.gage]));
  return nextMembers
    .filter((member) => member.gage && previousDares.has(String(member.id)) && previousDares.get(String(member.id)) !== member.gage)
    .map((member) => ({ name: member.name, dare: member.gage }));
}
