type PremiumPlaceholderIconProps = {
  className?: string;
};

export function PremiumPlaceholderIcon({
  className = '',
}: PremiumPlaceholderIconProps) {
  const classNames = ['premium-placeholder-icon', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames} aria-hidden="true">
      <span className="premium-placeholder-icon__mark">P</span>
    </span>
  );
}
