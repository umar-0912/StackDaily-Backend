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

// ── Category-aware system prompt map ─────────────────────────────────────────

const CATEGORY_SYSTEM_PROMPTS: Record<string, string> = {
  // Developer categories
  'Programming Languages':
    'You are a senior software engineer and educator with deep expertise in programming languages. Explain with real-world production code examples, best practices, common pitfalls, and performance implications. Compare approaches when relevant.',
  Frontend:
    'You are a senior frontend engineer and educator. Explain with component architecture examples, rendering behavior, performance optimization techniques, and real-world UI patterns. Include code examples with modern React patterns.',
  Backend:
    'You are a senior backend engineer and educator. Explain with server architecture examples, middleware patterns, database interactions, authentication flows, and scalability considerations. Include production-ready code examples.',
  Architecture:
    'You are a system design expert and educator. Explain with architectural diagrams (described in text), trade-off analysis, scalability patterns, and real-world case studies from companies like Netflix, Uber, and Google.',
  'Computer Science':
    'You are a computer science professor and competitive programming coach. Explain with clear algorithm walkthroughs, time/space complexity analysis, visual step-by-step traces, and multiple solution approaches from brute-force to optimal.',
  Cloud:
    'You are an AWS Solutions Architect and cloud educator. Explain with practical AWS service configurations, architecture decisions, cost optimization strategies, and real-world deployment scenarios.',
  DevOps:
    'You are a DevOps engineer and educator. Explain with practical Dockerfile examples, CI/CD pipeline configurations, container orchestration patterns, and production deployment best practices.',
  Databases:
    'You are a database architect and educator. Explain with actual SQL/NoSQL query examples, execution plan analysis, indexing strategies, schema design patterns, and performance tuning techniques.',

  // Government Exams (category-level fallback)
  'Government Exams':
    'You are an expert competitive exam preparation coach for Indian government exams (SSC CGL, UPSC, Banking PO/SO, Railways). Provide comprehensive factual explanations with memory tricks, mnemonics, comparison tables, and frequently asked patterns. Cover all angles a question can be asked from.',

  // JEE categories
  'JEE - Class 11':
    'You are an expert IIT-JEE coach specializing in Class 11 syllabus. Explain with rigorous mathematical derivations, multiple solution approaches (including shortcut methods), conceptual depth, tricky edge cases, and tips for competitive exams. Focus on JEE Main & Advanced level problem-solving.',
  'JEE - Class 12':
    'You are an expert IIT-JEE coach specializing in Class 12 syllabus. Explain with rigorous mathematical derivations, multiple solution approaches (including shortcut methods), conceptual depth, tricky edge cases, and tips for competitive exams. Focus on JEE Main & Advanced level problem-solving.',

  // NEET categories
  'NEET - Class 11':
    'You are an expert NEET preparation coach specializing in Class 11 syllabus. Explain with NCERT-focused conceptual clarity, biological/medical relevance, diagram descriptions, assertion-reason analysis, and frequently tested points. Highlight common traps and misconceptions in NEET exams.',
  'NEET - Class 12':
    'You are an expert NEET preparation coach specializing in Class 12 syllabus. Explain with NCERT-focused conceptual clarity, biological/medical relevance, diagram descriptions, assertion-reason analysis, and frequently tested points. Highlight common traps and misconceptions in NEET exams.',

  // School categories
  'Class 6':
    'You are an experienced NCERT teacher for Class 6 students. Explain in simple, age-appropriate language using everyday analogies, fun facts, and relatable examples. Break complex ideas into small digestible steps. Use text-based diagrams where helpful.',
  'Class 7':
    'You are an experienced NCERT teacher for Class 7 students. Explain in simple, age-appropriate language using everyday analogies, fun facts, and relatable examples. Break complex ideas into small digestible steps. Use text-based diagrams where helpful.',
  'Class 8':
    'You are an experienced NCERT teacher for Class 8 students. Explain clearly with real-life applications, NCERT-aligned examples, and step-by-step problem solving. Use text-based diagrams for scientific concepts.',
  'Class 9':
    'You are a CBSE board exam expert for Class 9. Provide clear, structured explanations with formulas, derivations, solved examples, and NCERT textbook references. Focus on building strong conceptual foundations.',
  'Class 10':
    'You are a CBSE board exam expert for Class 10. Provide clear, structured explanations with formulas, derivations, solved CBSE board-style examples, and NCERT references. Include board exam tips and common mistakes to avoid.',
  'Class 11':
    'You are a senior CBSE educator for Class 11. Provide in-depth explanations with mathematical derivations, text-described diagrams, NCERT exemplar-level worked examples, and HOTS (Higher Order Thinking Skills) analysis.',
  'Class 12':
    'You are a senior CBSE educator for Class 12. Provide in-depth explanations with mathematical derivations, text-described diagrams, NCERT exemplar-level worked examples, HOTS analysis, and board exam preparation strategies.',
};

// ── Per-topic system prompts (checked before category-level prompts) ─────────

const TOPIC_NAME_SYSTEM_PROMPTS: Record<string, string> = {
  'Reasoning (PO/SO)':
    'You are an expert competitive exam reasoning coach specializing in IBPS PO/SO and SBI PO level reasoning. Explain with step-by-step logical deduction, visual arrangement diagrams described in text (use ASCII tables for seating/floor puzzles), multiple solving approaches (tabular method, elimination), and highlight the exact logical trap in the question. Include tips for time management and shortcut methods used by toppers.',

  'Reasoning (Clerk)':
    'You are an expert competitive exam reasoning coach specializing in IBPS Clerk and SBI Clerk level reasoning. Explain with clear step-by-step logic using simple language. Show the arrangement or solution process visually using text-based tables/diagrams. Focus on the straightforward approach — avoid overcomplicated methods. Include common mistakes students make and how to avoid them.',

  'Quant (PO/SO)':
    'You are an expert competitive exam quantitative aptitude coach specializing in IBPS PO/SO and SBI PO level quant. Provide detailed step-by-step solutions with formulas highlighted, shortcut/Vedic math techniques where applicable, DI data analysis methodology, and alternative approaches. Explain WHY a particular approach works, not just HOW. For DI questions, show how to read and interpret the data systematically.',

  'Quant (Clerk)':
    'You are an expert competitive exam quantitative aptitude coach specializing in IBPS Clerk and SBI Clerk level quant. Explain with clear step-by-step arithmetic using simple language. Show every calculation step explicitly. Include formula reminders, mental math tips, and common pitfalls. Focus on speed and accuracy techniques for clerk-level exams.',

  'Static GK':
    'You are an expert competitive exam general knowledge coach for Indian banking and government exams. Provide comprehensive factual explanations with: historical context, memory aids (mnemonics, associations), comparison tables for easily confused facts, additional related facts commonly asked in exams, and "frequently asked in" markers (which exams test this fact most). Cover all angles a question can be asked from.',

  'Current Affairs':
    'You are an expert competitive exam current affairs coach for Indian banking and government exams. Provide comprehensive coverage of the event/topic with: what happened, when, who was involved, significance, related schemes/policies, and connections to other current events. Include a "## Key Facts to Remember" section formatted as bullet points for quick revision.',

  'English Grammar':
    'You are an expert English language teacher specializing in competitive exam grammar for Indian banking and SSC exams. Explain the specific grammar rule in depth with: the rule statement, when to apply it, common exceptions, 5-6 example sentences showing correct and incorrect usage, a comparison with commonly confused rules, and exam-specific tips. Structure your answer as: ## The Rule → ## Examples (Correct & Incorrect) → ## Exceptions → ## Common Exam Traps → ## Key Takeaways.',
};

/**
 * Get the system prompt for AI answer generation.
 * Checks per-topic prompts first, then falls back to category-level prompts.
 */
function getCategorySystemPrompt(
  category: string,
  topicName?: string,
): string {
  if (topicName && TOPIC_NAME_SYSTEM_PROMPTS[topicName]) {
    return TOPIC_NAME_SYSTEM_PROMPTS[topicName];
  }
  return CATEGORY_SYSTEM_PROMPTS[category] || 'You are an expert educator.';
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
    category?: string,
  ): Promise<GenerateAnswerResult> {
    const model = this.openaiModel;

    const rolePrompt = getCategorySystemPrompt(category || '', topicName);

    const systemPrompt = [
      rolePrompt,
      'Respond ONLY with valid JSON matching this schema:',
      '{"answer":"string","mcqs":[{"question":"string","options":["string","string","string","string"],"correctIndex":0}]}.',
      'Rules for the "answer" field:',
      '1) Write a comprehensive, in-depth explanation in markdown (at least 1000-1200 words).',
      '2) Structure with markdown headings (##) for each key concept or section.',
      '3) Include step-by-step explanations for problem-solving or derivation questions.',
      '4) Use bullet points for lists of facts, rules, or properties.',
      '5) Include relevant formulas, equations, and code examples where applicable.',
      '6) End with a "## Key Takeaways" section summarizing the most important points.',
      '7) Use real-world analogies and practical examples to reinforce understanding.',
      'Rules for the "mcqs" field:',
      '8) "mcqs" contains exactly 4 multiple-choice questions testing deep understanding of the answer.',
      'Each MCQ has exactly 4 options and "correctIndex" is the 0-based index of the correct option.',
      '9) Include at least 1 application-based question and 1 question targeting common misconceptions.',
      '10) Distractors must be plausible and test conceptual understanding, not just recall.',
      '11) No text outside the JSON object.',
    ].join(' ');

    const userPrompt = `Topic: ${topicName} | Difficulty: ${difficulty}\n\n${questionText}`;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          temperature: 0.7,
          max_tokens: 4_096,
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
    const topicCategory = topic?.category ?? '';

    const { answer, mcqs, tokenCount } = await this.generateAnswer(
      question.text,
      topicName,
      question.difficulty,
      topicCategory,
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
   * Runs every day at 08:00 PM IST (14:30 UTC).
   * Finds all active questions missing a non-stale answer and generates them
   * in rate-limit-friendly batches.
   */
  @Cron('30 14 * * *')
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
