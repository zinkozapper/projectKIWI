import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

const ICONS = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: CircleAlert } as const;

// A big, bold message people actually notice. Use it for things the user needs to read
// (errors, confirmations, "do this next" prompts); leave plain captions as small text.
// Errors announce as alerts and successes as status updates; info and warning banners
// stay quiet unless a role is passed.
export function Banner({ tone = 'info', title, children, action, onDismiss, className, role }: {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
  role?: 'alert' | 'status';
}) {
  const Icon = ICONS[tone];
  const announce = role ?? (tone === 'error' ? 'alert' : tone === 'success' ? 'status' : undefined);
  return (
    <div className={`kiwi-banner kiwi-banner-${tone}${className ? ` ${className}` : ''}`} role={announce}>
      <Icon className="kiwi-banner-icon" size={22} aria-hidden="true" />
      <div className="kiwi-banner-body">
        {title != null && title !== '' && <strong className="kiwi-banner-title">{title}</strong>}
        {children != null && children !== '' && <div className="kiwi-banner-text">{children}</div>}
      </div>
      {action && <div className="kiwi-banner-action">{action}</div>}
      {onDismiss && (
        <button type="button" className="kiwi-banner-close" aria-label="Dismiss message" onClick={onDismiss}>
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
