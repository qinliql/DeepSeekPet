/** Quiet hours support same-day and overnight ranges; equal endpoints mean all-day quiet. */
export function inQuietHours(at: number, start: number, end: number): boolean {
  const date = new Date(at);
  const minute = date.getHours() * 60 + date.getMinutes();
  return start === end || (start < end ? minute >= start && minute < end : minute >= start || minute < end);
}
