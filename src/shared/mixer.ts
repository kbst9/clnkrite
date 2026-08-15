/** Audibility rules for the Tone mixer. Empty selection = all unmuted (plus solo). */

export interface MixerLane {
  id: string;
  muted: boolean;
  soloed: boolean;
}

/**
 * Selected-lanes-together is a transient solo of the selection.
 * Empty selection falls back to standard mute/solo.
 * A muted lane is never audible.
 */
export function isLaneAudible(lane: MixerLane, lanes: MixerLane[], selectedLaneIds: string[]): boolean {
  if (lane.muted) return false;
  if (selectedLaneIds.length > 0) return selectedLaneIds.includes(lane.id);
  const anySolo = lanes.some((item) => item.soloed && !item.muted);
  if (anySolo) return lane.soloed;
  return true;
}

export function audibleLaneIds(lanes: MixerLane[], selectedLaneIds: string[]): string[] {
  return lanes.filter((lane) => isLaneAudible(lane, lanes, selectedLaneIds)).map((lane) => lane.id);
}
