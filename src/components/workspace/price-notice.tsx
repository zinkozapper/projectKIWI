import { Banner } from './banner';

export function PriceNotice({ status, refreshUnavailable = false }: { status: 'none' | 'fresh' | 'stale' | 'unknown'; refreshUnavailable?: boolean }) {
  if (status !== 'stale' && status !== 'unknown' && !refreshUnavailable) return null;
  return <Banner tone="warning" role="status" className="page-banner" title="Prices may be out of date">
    {status === 'stale' && 'Local prices are over 30 days old. Estimates may be out of date. '}
    {status === 'unknown' && 'The age of local prices is unavailable. Estimates may be out of date. '}
    {refreshUnavailable && 'Local price updates are unavailable right now.'}
  </Banner>;
}
