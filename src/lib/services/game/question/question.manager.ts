// src/lib/game/question/question.manager.ts
import prisma from '@/lib/prisma/client'; // Using absolute path
import { Difficulty } from '@prisma/client';
import { Question } from '../types';

const QUESTIONS_PER_BATCH = 50;

class QuestionManager {
  public async fetchQuestions(difficulty: Difficulty): Promise<Question[]> {
    const total = await prisma.question.count({ where: { difficulty } });
    const skip = total > QUESTIONS_PER_BATCH ? Math.floor(Math.random() * (total - QUESTIONS_PER_BATCH)) : 0;
    
    const rawQuestions = await prisma.question.findMany({
      where: { difficulty },
      take: QUESTIONS_PER_BATCH,
      skip,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        text: true,
        options: { select: { id: true, text: true, isCorrect: true } },
      },
    });

    return rawQuestions.map((q) => ({
      ...q,
      correctOptionId: q.options.find((opt) => opt.isCorrect)!.id,
      options: q.options.map(({ isCorrect, ...rest }) => rest),
    }));
  }

  public getDifficultyFromElo(elo: number): Difficulty {
    if (elo < 1300) return Difficulty.EASY;
    if (elo < 1600) return Difficulty.MEDIUM;
    return Difficulty.HARD;
  }
}

export const questionManager = new QuestionManager();
