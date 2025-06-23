// src/lib/game/question/question.manager.ts
import prisma from '@/lib/prisma/client'; // Using absolute path
import { Difficulty } from '@prisma/client';
import { Question } from '../types';

const QUESTIONS_PER_BATCH = 50; // Default for competitive modes

class QuestionManager {
  /**
   * Fetches questions based on difficulty, and optionally a list of categories and a specific count.
   * This is designed to be backward compatible for existing competitive modes while providing
   * new multi-category selection functionality for the practice mode.
   *
   * @param difficulty The difficulty level of questions to fetch.
   * @param categories (Optional) An array of category names (string) to filter questions by.
   * @param count (Optional) The exact number of questions to fetch. Defaults to QUESTIONS_PER_BATCH.
   * @returns A promise that resolves to an array of Question objects.
   */
  public async fetchQuestions(difficulty: Difficulty, categories?: string[], count?: number): Promise<Question[]> {
    // 1. Build the WHERE clause dynamically. It always includes difficulty.
    const whereClause: any = { difficulty };

    // 2. Add the category filter ONLY if the 'categories' array is provided and not empty.
    // This is the key to ensuring backward compatibility.
    if (categories && categories.length > 0) {
      // This assumes a relation like: model Question { category Category? @relation(...) }
      // It filters for questions where the related category's name is IN the provided array.
      whereClause.category = {
        name: {
          in: categories,
        },
      };
    }

    // 3. Determine how many questions to take. Use 'count' if provided, otherwise default to the old behavior.
    const take = count || QUESTIONS_PER_BATCH;

    // 4. Calculate a random starting point based on the total questions matching the criteria.
    const totalAvailable = await prisma.question.count({ where: whereClause });
    const skip = totalAvailable > take ? Math.floor(Math.random() * (totalAvailable - take)) : 0;
    
    // 5. Fetch questions from the database. The select includes all necessary fields.
    const rawQuestions = await prisma.question.findMany({
      where: whereClause,
      take: take,
      skip,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], // Consistent ordering
      select: {
        id: true,
        text: true,
        // The correct syntax for selecting from a related model is preserved.
        options: {
          select: {
            id: true,
            text: true,
            isCorrect: true, // Temporarily needed to find the correct option ID
          },
        },
        // Include new fields for Practice Mode. This is safe for old modes as they will just ignore them.
        explanation: true, 
        learningTip: true,
      },
    });

    // 6. Map the raw Prisma result to the internal Question type.
    // This mapping remains compatible with all game modes.
    return rawQuestions.map((q) => {
        const correctOption = q.options.find(opt => opt.isCorrect);
        
        if (!correctOption) {
            console.error(`Data integrity issue: Question with ID ${q.id} has no correct option.`);
            return {
                ...q,
                correctOptionId: '',
                options: q.options.map(({ isCorrect, ...rest }) => rest),
            };
        }

        return {
            ...q,
            correctOptionId: correctOption.id,
            options: q.options.map(({ isCorrect, ...rest }) => rest),
        }
    });
  }

  public getDifficultyFromElo(elo: number): Difficulty {
    if (elo < 1300) return Difficulty.EASY;
    if (elo < 1600) return Difficulty.MEDIUM;
    return Difficulty.HARD;
  }
}

export const questionManager = new QuestionManager();
