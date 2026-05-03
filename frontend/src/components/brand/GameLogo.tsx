import logoHorizontal from '../../assets/images/brand/dead-idle-logo-horizontal.png';

interface GameLogoProps {
  variant?: 'horizontal' | 'compact';
}

export function GameLogo({ variant = 'horizontal' }: GameLogoProps) {
  return (
    <div className={`game-logo game-logo--${variant}`}>
      <img src={logoHorizontal} alt="Dead Idle" className="game-logo__image" />
    </div>
  );
}