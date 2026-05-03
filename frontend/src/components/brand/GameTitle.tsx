interface GameTitleProps {
  subtitle: string;
}

export function GameTitle({ subtitle }: GameTitleProps) {
  return (
    <div className="game-title-block">
      <p className="auth-main-subtitle">{subtitle}</p>
    </div>
  );
}