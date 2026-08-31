import type { MouseEventHandler } from "react";
import topIdleVoteBadge from "../../assets/images/brand/topidle-vote-badge.svg";
import "./styles/top-idle-vote.css";

interface TopIdleVoteBadgeProps {
  href: string;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function TopIdleVoteBadge({
  href,
  className,
  onClick,
}: TopIdleVoteBadgeProps) {
  const classes = ["topidle-vote-badge", className]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      className={classes}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Votar no Dead Idle pelo TopIdle"
      onClick={onClick}
    >
      <img
        src={topIdleVoteBadge}
        width="240"
        height="52"
        alt="Vote em Dead Idle no TopIdle"
        draggable="false"
      />
    </a>
  );
}
