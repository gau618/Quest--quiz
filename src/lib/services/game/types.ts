// src/lib/game/types.ts
import { Difficulty, GameMode } from "@prisma/client";

export interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
}

export interface AnswerData {
  questionId: string;
  timeTaken: number;
  action: "answered" | "skipped" | "timeout";
  correct?: boolean;
}

export interface FastestFingerAnswer {
  participantId: string;
  optionId: string;
  timestamp: number;
  correct: boolean;
}

export interface GameState {
  questions: Question[];
  scores: Record<string, number>;
  difficulty: Difficulty;
  endTime: number;
  results: Record<string, AnswerData[]>;
  gameMode: GameMode;
  userProgress: Record<string, number>;
  questionSentAt: Record<string, number>;
  timePerQuestion?: number;
  currentQuestionIndex?: number;
  questionAnswers?: FastestFingerAnswer[];
  questionStartTime?: number;
}
