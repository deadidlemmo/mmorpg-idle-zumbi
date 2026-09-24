export type HuntingXpBaseline = Readonly<{
  sessionKey: string;
  amount: number;
}>;

export function resolveHuntingXpFeedback(
  previous: HuntingXpBaseline | null,
  sessionKey: string,
  rawAmount: number,
) {
  const amount = Number.isFinite(rawAmount)
    ? Math.max(0, Math.floor(rawAmount))
    : 0;
  if (!previous || previous.sessionKey !== sessionKey) {
    return { baseline: { sessionKey, amount }, gain: 0 };
  }
  if (amount <= previous.amount) {
    return { baseline: previous, gain: 0 };
  }
  return {
    baseline: { sessionKey, amount },
    gain: amount - previous.amount,
  };
}
