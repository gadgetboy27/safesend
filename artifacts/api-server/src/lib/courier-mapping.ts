/**
 * Maps SafeSend courier slugs to TrackingMore courier_code values.
 * Returns null if the slug isn't supported by TrackingMore.
 */
const SLUG_TO_TM_CODE: Record<string, string> = {
  nzpost: "nzpost",
  courierpost: "courierpost-nz",
  "nz-couriers": "nzc-courier",
  aramex: "aramex-australia",
  "post-haste": "post-haste",
};

export function mapToTrackingMoreCourierCode(safesendSlug: string): string | null {
  return SLUG_TO_TM_CODE[safesendSlug] ?? null;
}
