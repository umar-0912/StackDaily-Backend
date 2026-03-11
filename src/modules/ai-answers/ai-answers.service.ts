import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import {
  AiAnswer,
  AiAnswerDocument,
} from '../../database/schemas/ai-answer.schema.js';
import {
  Question,
  QuestionDocument,
} from '../../database/schemas/question.schema.js';
import { Topic, TopicDocument } from '../../database/schemas/topic.schema.js';

interface McqItem {
  question: string;
  options: string[];
  correctIndex: number;
}

interface GenerateAnswerResult {
  answer: string;
  mcqs: McqItem[];
  tokenCount: number;
}

interface GenerationStats {
  totalAnswers: number;
  staleAnswers: number;
  questionsWithoutAnswers: number;
  lastGenerationRun: Date | null;
}

interface NightlySummary {
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
}

/** Maximum number of retry attempts for OpenAI API calls. */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff between retries. */
const BASE_RETRY_DELAY_MS = 1_000;

/** Default delay in milliseconds between processing batches (rate-limit courtesy). */
const DEFAULT_BATCH_DELAY_MS = 2_000;

/** Default number of questions to process per batch during nightly generation. */
const DEFAULT_BATCH_SIZE = 10;

@Injectable()
export class AiAnswersService implements OnModuleInit {
  private readonly logger = new Logger(AiAnswersService.name);
  private openai: OpenAI;
  private openaiModel: string;

  constructor(
    @InjectModel(AiAnswer.name)
    private readonly aiAnswerModel: Model<AiAnswerDocument>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
    @InjectModel(Topic.name)
    private readonly topicModel: Model<TopicDocument>,
    private readonly configService: ConfigService,
  ) {}

  // ───────────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────────

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('openai.apiKey');
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not configured. AI answer generation will fail at runtime.',
      );
    }
    this.openai = new OpenAI({ apiKey });
    this.openaiModel = this.configService.get<string>('openai.model', 'gpt-4');
    this.logger.log('OpenAI client initialised');
  }

  // ───────────────────────────────────────────────────────────────
  // Core generation
  // ───────────────────────────────────────────────────────────────

  /**
   * Call the OpenAI chat completions API with exponential-backoff retry logic.
   *
   * @returns The generated answer text and total token usage.
   */
  async generateAnswer(
    questionText: string,
    topicName: string,
    difficulty: string,
  ): Promise<GenerateAnswerResult> {
    const model = this.openaiModel;

    const systemPrompt = [
      'You are an expert developer educator.',
      'Respond ONLY with valid JSON matching this schema:',
      '{"answer":"string","mcqs":[{"question":"string","options":["string","string","string","string"],"correctIndex":0}]}.',
      'Rules:',
      '1) "answer" is a practical, scenario-driven explanation in markdown (under 500 words, include code examples where relevant).',
      '2) "mcqs" contains exactly 4 multiple-choice questions testing understanding of the answer.',
      'Each has exactly 4 options and "correctIndex" is the 0-based index of the correct option.',
      '3) MCQs should test application of concepts, not just definitions. Include code-based questions where relevant.',
      '4) No text outside the JSON object.',
    ].join(' ');

    const userPrompt = `Topic: ${topicName} | Difficulty: ${difficulty}\n\n${questionText}`;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          temperature: 0.7,
          max_tokens: 1_500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });

        const raw = response.choices[0]?.message?.content ?? '{}';
        const tokenCount = response.usage?.total_tokens ?? 0;

        const parsed = this.parseAiResponse(raw);
        return { ...parsed, tokenCount };
      } catch (error: any) {
        lastError = error;
        const isRetryable = this.isRetryableError(error);

        this.logger.warn(
          {
            attempt,
            maxRetries: MAX_RETRIES,
            isRetryable,
            errorMessage: error.message,
            errorStatus: error.status,
            topicName,
            difficulty,
          },
          `OpenAI API call failed (attempt ${attempt}/${MAX_RETRIES})`,
        );

        if (!isRetryable || attempt === MAX_RETRIES) {
          break;
        }

        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await this.sleep(delayMs);
      }
    }

    this.logger.error(
      {
        errorMessage: lastError?.message,
        topicName,
        difficulty,
        questionTextSnippet: questionText.substring(0, 120),
      },
      'OpenAI API call failed after all retry attempts',
    );
    throw lastError;
  }

  // ───────────────────────────────────────────────────────────────
  // Per-question generation (idempotent)
  // ───────────────────────────────────────────────────────────────

  /**
   * Generate (or return existing) AI answer for a specific question.
   * Idempotent: returns the cached answer when one exists and is not stale.
   */
  async generateForQuestion(questionId: string): Promise<AiAnswerDocument> {
    // Return early if a fresh answer already exists
    const existing = await this.aiAnswerModel
      .findOne({
        questionId: new Types.ObjectId(questionId),
        isStale: false,
      })
      .exec();

    if (existing) {
      this.logger.debug(
        { questionId },
        'Non-stale answer already exists; returning cached version',
      );
      return existing;
    }

    // Load the question with its topic
    const question = await this.questionModel
      .findById(questionId)
      .populate<{ topicId: TopicDocument }>('topicId')
      .exec();

    if (!question) {
      throw new NotFoundException(
        `Question with id "${questionId}" not found`,
      );
    }

    const topic = question.topicId as unknown as TopicDocument;
    const topicName = topic?.name ?? 'General';

    const { answer, mcqs, tokenCount } = await this.generateAnswer(
      question.text,
      topicName,
      question.difficulty,
    );

    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4');

    const saved = await this.aiAnswerModel.findOneAndUpdate(
      { questionId: new Types.ObjectId(questionId) },
      {
        $set: {
          answer,
          mcqs,
          generatedAt: new Date(),
          model,
          tokenCount,
          isStale: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();

    this.logger.log(
      { questionId, model, tokenCount },
      'AI answer generated successfully',
    );

    return saved;
  }

  // ───────────────────────────────────────────────────────────────
  // Read operations
  // ───────────────────────────────────────────────────────────────

  /**
   * Retrieve the AI answer for a given question.
   * @throws NotFoundException if no answer has been generated yet.
   */
  async findByQuestionId(questionId: string): Promise<AiAnswerDocument> {
    const answer = await this.aiAnswerModel
      .findOne({ questionId: new Types.ObjectId(questionId) })
      .lean<AiAnswerDocument>()
      .exec();

    if (!answer) {
      throw new NotFoundException(
        `AI answer for question "${questionId}" not found`,
      );
    }

    return answer;
  }

  /**
   * Mark an existing answer as stale so it will be regenerated by the
   * nightly job or a manual trigger.
   */
  async markAsStale(questionId: string): Promise<void> {
    const result = await this.aiAnswerModel
      .updateOne(
        { questionId: new Types.ObjectId(questionId) },
        { $set: { isStale: true } },
      )
      .exec();

    if (result.matchedCount === 0) {
      this.logger.warn(
        { questionId },
        'Attempted to mark answer as stale but none exists',
      );
    } else {
      this.logger.log({ questionId }, 'AI answer marked as stale');
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Nightly batch generation (cron)
  // ───────────────────────────────────────────────────────────────

  /**
   * Runs every day at 04:30 PM IST (11:00 UTC).
   * Finds all active questions missing a non-stale answer and generates them
   * in rate-limit-friendly batches.
   */
  @Cron('0 11 * * *')
  async nightlyGeneration(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Starting nightly AI answer generation');

    const batchSize = this.configService.get<number>(
      'AI_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
    );

    // Aggregation: active questions that have NO answer or a stale answer
    const questionsToProcess = await this.questionModel
      .aggregate<{ _id: Types.ObjectId }>([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'aianswers',
            localField: '_id',
            foreignField: 'questionId',
            as: 'aiAnswer',
          },
        },
        {
          $match: {
            $or: [
              { aiAnswer: { $size: 0 } },
              { 'aiAnswer.isStale': true },
            ],
          },
        },
        { $project: { _id: 1 } },
      ])
      .exec();

    const total = questionsToProcess.length;

    if (total === 0) {
      this.logger.log('Nightly generation: no questions require answers');
      return;
    }

    this.logger.log(
      { total },
      `Nightly generation: ${total} question(s) to process`,
    );

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < total; i += batchSize) {
      const batch = questionsToProcess.slice(i, i + batchSize);

      for (const item of batch) {
        try {
          await this.generateForQuestion(item._id.toString());
          succeeded++;
        } catch (error: any) {
          failed++;
          this.logger.error(
            {
              questionId: item._id.toString(),
              errorMessage: error.message,
            },
            'Failed to generate answer for question during nightly run',
          );
        }
      }

      // Rate-limit courtesy: pause between batches (skip after the last batch)
      const isLastBatch = i + batchSize >= total;
      if (!isLastBatch) {
        await this.sleep(DEFAULT_BATCH_DELAY_MS);
      }
    }

    const durationMs = Date.now() - startTime;
    const summary: NightlySummary = { total, succeeded, failed, durationMs };

    const failureRate = total > 0 ? failed / total : 0;

    if (failureRate > 0.5) {
      this.logger.error(
        summary,
        `CRITICAL: Nightly generation completed with >${Math.round(failureRate * 100)}% failure rate`,
      );
    } else {
      this.logger.log(summary, 'Nightly AI answer generation completed');
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Statistics
  // ───────────────────────────────────────────────────────────────

  /**
   * Return high-level statistics about AI answer generation coverage.
   */
  async getGenerationStats(): Promise<GenerationStats> {
    const [totalAnswers, staleAnswers, questionsWithoutAnswers, lastGenerated] =
      await Promise.all([
        this.aiAnswerModel.countDocuments().exec(),
        this.aiAnswerModel.countDocuments({ isStale: true }).exec(),
        this.countQuestionsWithoutAnswers(),
        this.aiAnswerModel
          .findOne()
          .sort({ generatedAt: -1 })
          .select('generatedAt')
          .lean()
          .exec(),
      ]);

    return {
      totalAnswers,
      staleAnswers,
      questionsWithoutAnswers,
      lastGenerationRun: lastGenerated?.generatedAt ?? null,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────

  /**
   * Count active questions that have no corresponding AI answer.
   */
  private async countQuestionsWithoutAnswers(): Promise<number> {
    const result = await this.questionModel
      .aggregate<{ count: number }>([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'aianswers',
            localField: '_id',
            foreignField: 'questionId',
            as: 'aiAnswer',
          },
        },
        { $match: { aiAnswer: { $size: 0 } } },
        { $count: 'count' },
      ])
      .exec();

    return result[0]?.count ?? 0;
  }

  /**
   * Safely parse the structured JSON response from OpenAI.
   * Validates each MCQ for correct shape. Falls back to raw text with
   * empty MCQs on parse failure.
   */
  private parseAiResponse(raw: string): { answer: string; mcqs: McqItem[] } {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(
        { rawSnippet: raw.substring(0, 200) },
        'Failed to parse AI response as JSON; falling back to raw text',
      );
      return { answer: raw, mcqs: [] };
    }

    const answer: string =
      typeof parsed.answer === 'string' ? parsed.answer : raw;

    const mcqs: McqItem[] = [];
    if (Array.isArray(parsed.mcqs)) {
      for (const item of parsed.mcqs) {
        if (
          typeof item.question === 'string' &&
          Array.isArray(item.options) &&
          item.options.length === 4 &&
          item.options.every((o: unknown) => typeof o === 'string') &&
          typeof item.correctIndex === 'number' &&
          item.correctIndex >= 0 &&
          item.correctIndex <= 3
        ) {
          mcqs.push({
            question: item.question,
            options: item.options,
            correctIndex: item.correctIndex,
          });
        } else {
          this.logger.warn(
            { invalidMcq: item },
            'Skipping invalid MCQ item from AI response',
          );
        }
      }
    }

    return { answer, mcqs };
  }

  /**
   * Determine whether an OpenAI SDK error is transient and worth retrying.
   * Retries on rate-limit (429), server errors (5xx), and network/timeout issues.
   */
  private isRetryableError(error: any): boolean {
    // OpenAI SDK errors expose a `status` property
    const status: number | undefined = error.status ?? error.statusCode;

    if (status === 429) return true; // Rate limited
    if (status !== undefined && status >= 500) return true; // Server error

    // Network-level errors (ECONNRESET, ETIMEDOUT, etc.)
    const code: string | undefined = error.code;
    if (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Async sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
