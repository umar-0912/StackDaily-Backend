/**
 * Migration: AI-generate high-quality questions for new topics.
 *
 * Generates 50 questions per topic (15 beginner, 20 intermediate, 15 advanced)
 * using OpenAI gpt-4o-mini with category-specific prompts designed for exam-level quality.
 *
 * Usage:
 *   MONGODB_URI="..." OPENAI_API_KEY="..." npx ts-node -r tsconfig-paths/register src/database/migrations/generate-questions.ts
 *
 * Optional flags:
 *   --topic <slug>        Generate for a single topic only (e.g. --topic jee-physics)
 *   --dry-run             Print prompts without calling OpenAI or writing to DB
 */

import mongoose from 'mongoose';
import OpenAI from 'openai';

const MONGODB_URI = process.env.MONGODB_URI;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MONGODB_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY env var is required');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';
const DELAY_MS = 2_000;

// ── Category-specific prompt instructions ──────────────────────────────

const CATEGORY_PROMPTS: Record<string, string> = {
  // ── Developer / Tech topics ──────────────────────────────────────────
  'Programming Languages': `You are a senior software engineer and expert technical interviewer.
Rules:
- Generate questions that test REAL understanding of the language/framework, not trivia.
- Include code-based conceptual questions (describe what code does, find bugs, predict output).
- Cover core concepts, common pitfalls, best practices, and real-world usage patterns.
- Beginner: fundamentals, syntax, basic concepts.
- Intermediate: closures, async, design patterns, error handling, performance.
- Advanced: memory model, event loop internals, metaprogramming, compiler behavior, edge cases.
- Questions should be the kind asked in top-tier technical interviews (Google, Meta level).`,

  'Frontend': `You are a senior frontend engineer and expert technical interviewer.
Rules:
- Generate questions about component architecture, state management, rendering lifecycle, hooks, performance.
- Include questions on virtual DOM, reconciliation, memoization, code splitting, SSR/CSR.
- Beginner: JSX, props, state, basic hooks.
- Intermediate: custom hooks, context, refs, error boundaries, React patterns.
- Advanced: fiber architecture, concurrent mode, reconciler internals, render optimization, suspense.
- Questions should mirror real senior frontend interview questions.`,

  'Backend': `You are a senior backend engineer and expert technical interviewer.
Rules:
- Generate questions about server architecture, APIs, middleware, authentication, databases, scaling.
- Include questions on event loop, streams, clustering, microservices, caching, security.
- Beginner: HTTP basics, routing, middleware concepts, npm.
- Intermediate: authentication patterns, database integration, error handling, testing, REST design.
- Advanced: event loop internals, worker threads, performance profiling, memory leaks, streaming, cluster module.
- Questions should match senior backend engineering interview standards.`,

  'Architecture': `You are a principal engineer specializing in system design interviews.
Rules:
- Generate questions that test architectural thinking, trade-offs, and scalability reasoning.
- Include questions on load balancing, caching, databases, message queues, CDN, microservices.
- Beginner: client-server model, REST vs GraphQL, monolith vs microservices, basic scaling.
- Intermediate: database sharding, CAP theorem, event-driven architecture, rate limiting, consistent hashing.
- Advanced: distributed consensus, CRDT, leader election, global-scale architecture, multi-region design.
- Each question should require reasoning about trade-offs, not just definitions.`,

  'Computer Science': `You are an expert algorithms and data structures instructor.
Rules:
- Generate questions that test understanding of time/space complexity, optimal data structure choice, and algorithmic thinking.
- Include questions about arrays, linked lists, trees, graphs, heaps, hash tables, tries, stacks, queues.
- Beginner: basic operations, simple traversals, Big-O basics.
- Intermediate: balanced trees, graph traversals, dynamic programming, two pointers, sliding window.
- Advanced: segment trees, Fenwick trees, advanced graph algorithms, amortized analysis, NP-completeness.
- Questions should be conceptual (not "write code"), testing understanding of WHY and WHEN to use each structure.`,

  'Cloud': `You are a certified AWS Solutions Architect (Professional level).
Rules:
- Generate questions that test practical AWS knowledge, not just service definitions.
- Include scenario-based questions: "given these requirements, which service/architecture?"
- Beginner: core services (EC2, S3, RDS, Lambda, IAM basics).
- Intermediate: VPC design, auto-scaling, CloudFront, DynamoDB, SQS/SNS, cost optimization.
- Advanced: multi-region DR, cross-account access, complex IAM policies, Well-Architected Framework, serverless patterns.
- Style should match AWS Certified Solutions Architect exam questions.`,

  'DevOps': `You are a senior DevOps/Platform engineer and Docker/container expert.
Rules:
- Generate questions about containerization, orchestration, CI/CD, and infrastructure.
- Include questions on Dockerfile best practices, multi-stage builds, networking, volumes, security.
- Beginner: basic Docker commands, images vs containers, Dockerfile basics.
- Intermediate: multi-stage builds, Docker Compose, networking modes, volume management, health checks.
- Advanced: container security, runtime internals (cgroups, namespaces), orchestration, image optimization, rootless containers.
- Questions should test practical, production-level Docker knowledge.`,

  'Databases': `You are a senior database architect and SQL expert.
Rules:
- Generate questions that test query writing, optimization, schema design, and database internals.
- Include questions on joins, indexing, transactions, normalization, query plans, replication.
- Beginner: basic SELECT/INSERT/UPDATE, WHERE, GROUP BY, simple joins.
- Intermediate: complex joins, subqueries, window functions, indexing strategies, transactions (ACID).
- Advanced: query plan optimization, lock contention, partitioning, replication lag, sharding, stored procedures.
- Questions should be practical — the kind that separate junior from senior database engineers.`,

  // ── Non-tech categories ──────────────────────────────────────────────
  'Government Exams': `You are an expert question setter for Indian competitive exams (SSC CGL, UPSC Prelims, Banking PO, Railway RRB).
Rules:
- Generate questions at SSC CGL / UPSC Prelims / Banking PO difficulty level.
- Use previous year exam paper style — concise, factual, tricky.
- Distractors must be CLOSE and plausible (not obviously wrong).
- Include questions that test application, not just rote recall.
- For Static GK: focus on Indian history, geography, polity, economy, science facts, constitutional bodies.
- For Current Affairs: focus on important events, schemes, awards, appointments from 2024-2025.
- For Reasoning: include puzzles, coding-decoding, syllogisms, seating arrangement, blood relations.
- For Quantitative Aptitude: include multi-step problems, DI, percentage, ratio, time & work.
- For English Grammar: include sentence correction, fill in the blanks, idioms, reading comprehension style questions.`,

  'School (Class 5-10)': `You are an expert NCERT-based question setter for Indian school students (Class 5-10).
Rules:
- Generate NCERT-based application questions, NOT rote memorization.
- Questions should be at CBSE board exam difficulty — conceptual and thought-provoking.
- Include questions that test understanding of concepts, not just definitions.
- For Maths: include word problems, multi-step calculations, geometry proofs, and application-based questions.
- For Science: include diagram-based conceptual questions, experiment-based reasoning, and NCERT exemplar style.
- Distractors should be common student mistakes (misconception-based).
- Language should be simple and age-appropriate but intellectually challenging.`,

  'Class 11-12 Boards': `You are an expert CBSE board exam question setter for Class 11-12.
Rules:
- Generate CBSE board exam level questions — NCERT + exemplar difficulty.
- Focus on application and HOTS (Higher Order Thinking Skills) questions.
- Include numerical problems, conceptual reasoning, and case-based questions.
- For Physics: include derivation-based conceptual questions, numerical with real-world context.
- For Chemistry: include reaction mechanisms, numerical (mole concept, equilibrium), and application questions.
- For Maths: include multi-step problems, proof-based questions, and graph/diagram interpretation.
- For Biology: include diagram-based, assertion-reason, and case study questions.
- Distractors should exploit common misconceptions students have at this level.`,

  'JEE Preparation': `You are an expert JEE question setter (JEE Main + Advanced level).
Rules:
- Generate JEE Main & Advanced level questions — multi-step problem solving, conceptual depth.
- Questions must test UNDERSTANDING, not just formula recall.
- Include tricky conceptual questions that require deep thinking.
- For Physics: include questions combining 2-3 concepts (e.g., mechanics + energy), numerical with non-obvious approaches.
- For Chemistry: include tricky equilibrium, organic mechanism reasoning, and periodic trend-based logic.
- For Maths: include problems requiring clever substitutions, multi-concept integration, and non-standard approaches.
- Distractors should be values you get from common calculation mistakes or wrong approach paths.
- Some questions should be at Advanced level — paragraph-based or multi-part reasoning.`,
};

// ── Difficulty distribution ────────────────────────────────────────────

interface DifficultyBatch {
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  count: number;
}

const BATCHES: DifficultyBatch[] = [
  { difficulty: 'beginner', count: 15 },
  { difficulty: 'intermediate', count: 20 },
  { difficulty: 'advanced', count: 15 },
];

// ── Helpers ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GeneratedQuestion {
  text: string;
  difficulty: string;
  tags: string[];
}

async function generateBatch(
  topicName: string,
  topicCategory: string,
  difficulty: string,
  count: number,
  dryRun: boolean,
): Promise<GeneratedQuestion[]> {
  const categoryPrompt =
    CATEGORY_PROMPTS[topicCategory] ||
    'You are an expert educator generating high-quality exam questions.';

  const systemPrompt = `${categoryPrompt}

Respond ONLY with valid JSON matching this schema:
{"questions":[{"text":"string","tags":["string"]}]}

Each question object must have:
- "text": A clear, self-contained question (no external references needed). Include any necessary data, figures, or context within the question itself.
- "tags": 2-4 relevant subtopic tags (e.g., ["trigonometry", "identities"] or ["Indian polity", "fundamental rights"]).

Generate exactly ${count} UNIQUE questions at "${difficulty}" difficulty for the topic "${topicName}".
No duplicate or near-duplicate questions. Each question must test a different concept or sub-topic.`;

  const userPrompt = `Generate ${count} ${difficulty}-level questions for: ${topicName}

Category: ${topicCategory}
Difficulty: ${difficulty}

Remember: questions must be exam-quality, not trivial. Test real understanding.`;

  if (dryRun) {
    console.log(`  [DRY RUN] Would call OpenAI for ${count} ${difficulty} questions`);
    console.log(`  System prompt (first 200 chars): ${systemPrompt.substring(0, 200)}...`);
    return [];
  }

  const MAX_RETRIES = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.8,
        max_tokens: 4_000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);
      const tokens = response.usage?.total_tokens ?? 0;

      if (!Array.isArray(parsed.questions)) {
        console.warn(`  Warning: unexpected response shape, retrying...`);
        lastError = new Error('Invalid response shape');
        continue;
      }

      console.log(`  Generated ${parsed.questions.length} ${difficulty} questions (${tokens} tokens)`);

      return parsed.questions.map((q: any) => ({
        text: q.text,
        difficulty,
        tags: Array.isArray(q.tags) ? q.tags : [],
      }));
    } catch (error: any) {
      lastError = error;
      console.warn(`  Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);

      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        await sleep(delayMs);
      }
    }
  }

  console.error(`  FAILED after ${MAX_RETRIES} attempts: ${lastError?.message}`);
  return [];
}

// ── Main ───────────────────────────────────────────────────────────────

async function run() {
  const args = process.argv.slice(2);
  const topicSlugArg = args.includes('--topic')
    ? args[args.indexOf('--topic') + 1]
    : null;
  const dryRun = args.includes('--dry-run');
  const publishedOnly = args.includes('--published');

  await mongoose.connect(MONGODB_URI!);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database reference');
    process.exit(1);
  }

  // Find topics to process
  // --topic <slug>  → single topic
  // --published     → all published (active) topics
  // default         → unpublished topics only
  const topicFilter: Record<string, unknown> = topicSlugArg
    ? { slug: topicSlugArg }
    : publishedOnly
      ? { isPublished: true, isActive: true }
      : { isPublished: false, isActive: true };

  const topics = await db
    .collection('topics')
    .find(topicFilter)
    .sort({ sortOrder: 1 })
    .toArray();

  if (topics.length === 0) {
    console.log('No topics found matching filter. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nProcessing ${topics.length} topic(s):\n`);

  let totalInserted = 0;
  let totalFailed = 0;

  for (const topic of topics) {
    console.log(`\n━━━ ${topic.name} (${topic.category}) ━━━`);

    // Check how many questions already exist for this topic
    const existingCount = await db
      .collection('questions')
      .countDocuments({ topicId: topic._id, isActive: true });

    if (existingCount >= 50) {
      console.log(`  Already has ${existingCount} questions, skipping.`);
      continue;
    }

    const allQuestions: GeneratedQuestion[] = [];

    for (const batch of BATCHES) {
      const questions = await generateBatch(
        topic.name,
        topic.category,
        batch.difficulty,
        batch.count,
        dryRun,
      );
      allQuestions.push(...questions);

      // Rate-limit courtesy
      if (!dryRun) {
        await sleep(DELAY_MS);
      }
    }

    if (dryRun || allQuestions.length === 0) {
      continue;
    }

    // Insert questions into DB
    const docs = allQuestions.map((q) => ({
      topicId: topic._id,
      text: q.text,
      difficulty: q.difficulty,
      tags: q.tags,
      isActive: true,
      usageCount: 0,
      lastUsedDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    try {
      const result = await db.collection('questions').insertMany(docs);
      const inserted = result.insertedCount;
      totalInserted += inserted;
      console.log(`  ✓ Inserted ${inserted} questions for ${topic.name}`);
    } catch (error: any) {
      totalFailed++;
      console.error(`  ✗ Failed to insert questions for ${topic.name}: ${error.message}`);
    }
  }

  console.log(`\n━━━ Summary ━━━`);
  console.log(`Total questions inserted: ${totalInserted}`);
  if (totalFailed > 0) {
    console.log(`Topics with insert failures: ${totalFailed}`);
  }
  if (dryRun) {
    console.log(`(dry run — no questions were actually generated or inserted)`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
