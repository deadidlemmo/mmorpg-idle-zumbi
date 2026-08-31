import premiumIconUrl from '../assets/images/items/consumables/passe-premium-de-30-dias.svg';

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
      <img
        className="premium-placeholder-icon__mark"
        src={premiumIconUrl}
        alt=""
      />
    </span>
  );
}
