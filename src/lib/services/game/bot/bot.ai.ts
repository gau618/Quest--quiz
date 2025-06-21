// src/lib/game/bot/bot.ai.ts
import { GameMode } from '@prisma/client';
import { Question } from '../types';

class BotAI {
  private getBotAccuracy(elo: number): number {
    const minElo = 600, maxElo = 2800, minAcc = 0.7, maxAcc = 0.99;
    if (elo <= minElo) return minAcc;
    if (elo >= maxElo) return maxAcc;
    return minAcc + ((elo - minElo) / (maxElo - minElo)) * (maxAcc - minAcc);
  }

  private getBotDelay(elo: number, gameMode: GameMode): number {
    const minElo = 600, maxElo = 2800;
    let baseMaxDelay: number, baseMinDelay: number, minHumanDelay: number, maxHumanDelay: number;
    if (gameMode === GameMode.FASTEST_FINGER_FIRST) {
      baseMaxDelay = 2500; baseMinDelay = 500; minHumanDelay = 500; maxHumanDelay = 5000;
    } else {
      baseMaxDelay = 4000; baseMinDelay = 1000; minHumanDelay = 800; maxHumanDelay = 12000;
    }
    let baseDelay = elo <= minElo ? baseMaxDelay : elo >= maxElo ? baseMinDelay : baseMaxDelay - ((elo - minElo) / (maxElo - minElo)) * (baseMaxDelay - baseMinDelay);
    let finalDelay = baseDelay + (Math.random() - 0.5) * 2 * (baseDelay * 0.3);
    if (Math.random() < 0.1) finalDelay *= 1.5 + Math.random() * 1.5;
    if (Math.random() < 0.15 && !(Math.random() < 0.1)) finalDelay *= 0.4 + Math.random() * 0.4;
    finalDelay *= 0.7 + Math.max(0.5, (elo - minElo) / (maxElo - minElo)) * 0.6;
    return Math.round(Math.max(minHumanDelay, Math.min(maxHumanDelay, finalDelay)));
  }

  public getBotAnswer(question: Question, gameMode: GameMode, timeLimit?: number) {
    const delay = this.getBotDelay(1200, gameMode);
    const isCorrect = Math.random() < this.getBotAccuracy(1200);
    const incorrectOpts = question.options.filter(o => o.id !== question.correctOptionId);
    const chosenId = isCorrect ? question.correctOptionId : incorrectOpts[Math.floor(Math.random() * incorrectOpts.length)].id;
    
    const finalDelay = (gameMode === GameMode.FASTEST_FINGER_FIRST && timeLimit) ? Math.min(delay, timeLimit - 100) : delay;

    return { chosenOptionId: chosenId, delay: finalDelay };
  }
}

export const botAI = new BotAI();
