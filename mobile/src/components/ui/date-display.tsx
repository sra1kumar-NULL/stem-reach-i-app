import { Text as UIText } from '@/components/ui/text';

interface Props {
  date: string | Date;
  format: 'short' | 'long' | 'relative';
}

const SHORT_FMT = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });
const LONG_FMT = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function formatDate(d: Date, format: 'short' | 'long' | 'relative'): string {
  if (format === 'short') return SHORT_FMT.format(d);
  if (format === 'long') return LONG_FMT.format(d);

  // relative: ±7 days, fallback to short
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dMs - todayMs) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

  return SHORT_FMT.format(d);
}

export function DateDisplay({ date, format }: Props) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const text = formatDate(d, format);
  return <UIText>{text}</UIText>;
}
