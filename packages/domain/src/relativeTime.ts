const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;
const YEAR = 31536000;

export function relativeTime(dateString?: string | null): string {
  if (!dateString) return 'just now';

  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < MINUTE) return 'just now';
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return m === 1 ? 'about 1 minute ago' : `${m} minutes ago`;
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return h === 1 ? 'about 1 hour ago' : `${h} hours ago`;
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return d === 1 ? '1 day ago' : `${d} days ago`;
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return w === 1 ? '1 week ago' : `${w} weeks ago`;
  }
  if (seconds < YEAR) {
    const m = Math.floor(seconds / MONTH);
    return m === 1 ? 'about 1 month ago' : `about ${m} months ago`;
  }
  const y = Math.floor(seconds / YEAR);
  return y === 1 ? 'about 1 year ago' : `about ${y} years ago`;
}
