import type { CloseMatches } from '@/hooks/use-close-matches';
import { Banner } from './banner';

// Shown above search results when nothing matched exactly. Replaces the old fixed
// "Try beans, rice, or yogurt" hint with what the close-match search found.
export function CloseMatchNote({ query, close }: { query: string; close: CloseMatches }) {
  const text = query.trim();
  let message: string;
  if (close.foods.length) message = `No exact match for “${text}”. Close matches:`;
  else if (close.searching) message = `No exact match for “${text}”. Looking for close matches…`;
  else message = `No match for “${text}”.`;
  return <Banner tone="warning" role="status" className="compact close-match-note" title={message} />;
}
