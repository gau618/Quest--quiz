// src/lib/game/elo.ts

const K_FACTOR = 32;

export function calculateElo(playerElo: number, opponentElo: number, score: number): [number, number] {
  const expectedPlayerScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const newPlayerElo = Math.round(playerElo + K_FACTOR * (score - expectedPlayerScore));
  const newOpponentElo = Math.round(opponentElo + K_FACTOR * ((1 - score) - (1 - expectedPlayerScore)));
  return [newPlayerElo, newOpponentElo];
}
