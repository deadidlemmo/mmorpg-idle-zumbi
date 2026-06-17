import { useId } from 'react';

type PremiumPlaceholderIconProps = {
  className?: string;
};

export function PremiumPlaceholderIcon({
  className = '',
}: PremiumPlaceholderIconProps) {
  const rawId = useId().replace(/:/g, '');
  const bgGradientId = `premium-bg-${rawId}`;
  const ringGradientId = `premium-ring-${rawId}`;
  const crownGradientId = `premium-crown-${rawId}`;
  const shadowId = `premium-shadow-${rawId}`;
  const classNames = ['premium-placeholder-icon', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames} aria-hidden="true">
      <svg
        className="premium-placeholder-icon__mark"
        viewBox="0 0 64 64"
        focusable="false"
      >
        <defs>
          <radialGradient id={bgGradientId} cx="32%" cy="24%" r="72%">
            <stop offset="0%" stopColor="#fff7bb" />
            <stop offset="24%" stopColor="#efd15d" />
            <stop offset="58%" stopColor="#9f741f" />
            <stop offset="100%" stopColor="#1d2b1a" />
          </radialGradient>
          <linearGradient id={ringGradientId} x1="12" y1="8" x2="52" y2="58">
            <stop offset="0%" stopColor="#f7e47c" />
            <stop offset="52%" stopColor="#97d75b" />
            <stop offset="100%" stopColor="#436b2d" />
          </linearGradient>
          <linearGradient id={crownGradientId} x1="18" y1="17" x2="46" y2="46">
            <stop offset="0%" stopColor="#fff3a8" />
            <stop offset="48%" stopColor="#e4b83d" />
            <stop offset="100%" stopColor="#8e5f18" />
          </linearGradient>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow
              dx="0"
              dy="3"
              stdDeviation="2"
              floodColor="#000000"
              floodOpacity="0.45"
            />
          </filter>
        </defs>

        <circle
          cx="32"
          cy="32"
          r="29"
          fill={`url(#${bgGradientId})`}
          stroke="#f7df7d"
          strokeWidth="2"
        />
        <circle
          cx="32"
          cy="32"
          r="24.5"
          fill="#050d0a"
          opacity="0.52"
          stroke={`url(#${ringGradientId})`}
          strokeWidth="3"
        />
        <path
          d="M32 7.5v7.2M32 49.3v7.2M7.5 32h7.2M49.3 32h7.2M14.7 14.7l5.1 5.1M44.2 44.2l5.1 5.1M49.3 14.7l-5.1 5.1M19.8 44.2l-5.1 5.1"
          stroke="#e7d166"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.62"
        />
        <g filter={`url(#${shadowId})`}>
          <path
            d="M18.5 39.3l3.4-17.5 7.5 9.2L32 16.6 34.6 31l7.5-9.2 3.4 17.5H18.5z"
            fill={`url(#${crownGradientId})`}
            stroke="#fff0a1"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M21 43.2h22"
            stroke="#fff0a1"
            strokeWidth="4.8"
            strokeLinecap="round"
          />
          <path
            d="M21 43.2h22"
            stroke="#9f6d1e"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="32" cy="29.8" r="2.6" fill="#9bed5b" />
          <circle cx="24.2" cy="34.7" r="1.8" fill="#fff0a1" />
          <circle cx="39.8" cy="34.7" r="1.8" fill="#fff0a1" />
        </g>
        <path
          d="M20.8 48.5c4.8 3.6 17.6 3.6 22.4 0"
          fill="none"
          stroke="#8fcb56"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </span>
  );
}
