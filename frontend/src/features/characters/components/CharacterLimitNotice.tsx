interface CharacterLimitNoticeProps {
  reachedLimit: boolean;
  maxCharacters: number;
}

export function CharacterLimitNotice({
  reachedLimit,
  maxCharacters,
}: CharacterLimitNoticeProps) {
  if (!reachedLimit) {
    return null;
  }

  return (
    <div className="character-limit-notice">
      Você atingiu o limite de {maxCharacters} personagens por conta.
    </div>
  );
}