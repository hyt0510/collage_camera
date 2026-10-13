/**
 * 撮影する枠の選択に関するユーティリティ
 */

/**
 * 現在の枠の次から順に（末尾まで行ったら先頭に戻って）探し、撮影できる最初の枠を返す。
 * 現在の枠そのものは返さない。見つからなければ null。
 */
export function findNextSlotId(
  slotIds: string[],
  currentId: string | null,
  isAvailable: (id: string) => boolean,
): string | null {
  const start = currentId ? slotIds.indexOf(currentId) : -1;
  for (let step = 1; step <= slotIds.length; step++) {
    const id = slotIds[(start + step) % slotIds.length]!;
    if (id !== currentId && isAvailable(id)) return id;
  }
  return null;
}
