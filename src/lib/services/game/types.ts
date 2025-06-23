// src/lib/game/types.ts
import { GameMode, Difficulty } from '@prisma/client';

// Define the shape of a Question received from the backend
export interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string; // The correct answer ID (should not be sent to client initially)
  explanation?: string;
  learningTip?: string;
  difficulty: Difficulty;
}

// Define the shape of AnswerData for results tracking
export interface AnswerData {
  questionId: string;
  timeTaken: number; // in milliseconds
  action: 'answered' | 'skipped' | 'timeout';
  correct?: boolean; // only for 'answered' action
}

// Define the overall GameState stored in Redis/cache
export interface GameState {
  questions: Question[];
  userProgress: Record<string, number>; // participantId -> current question index
  scores: Record<string, number>; // participantId -> score
  results: Record<string, AnswerData[]>; // participantId -> array of results
  difficulty: Difficulty;
  gameMode: GameMode;
  endTime: number; // Timestamp when the game should end (ms)
  questionSentAt: Record<string, number>; // participantId -> timestamp when last question was sent (for time tracking)

  // Fastest Finger specific state
  currentQuestionIndex?: number;
  timePerQuestion?: number; // In milliseconds
  questionAnswers?: { participantId: string; optionId: string; timestamp: number; correct: boolean }[]; // Answers for current FFF question
  questionStartTime?: number; // Timestamp when current FFF question started
}
