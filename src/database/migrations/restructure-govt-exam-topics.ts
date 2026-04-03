/**
 * Migration: Restructure Government Exams topics
 *
 * Actions:
 *   1. Delete ALL questions + AI answers for the 5 current govt exam topics (clean slate)
 *   2. Hard-delete old "Reasoning & Aptitude" and "Quantitative Aptitude" topics
 *   3. Insert 4 new split topics (Reasoning PO/SO, Reasoning Clerk, Quant PO/SO, Quant Clerk)
 *   4. Update English Grammar sortOrder
 *   5. Clean up orphaned DailySelection records
 *
 * New structure (7 topics):
 *   - Static GK (100 Qs)
 *   - Current Affairs (100 Qs)
 *   - Reasoning (PO/SO) (100 Qs)
 *   - Reasoning (Clerk) (100 Qs)
 *   - Quant (PO/SO) (100 Qs)
 *   - Quant (Clerk) (100 Qs)
 *   - English Grammar (120 Qs)
 *
 * Run once:
 *   MONGODB_URI="..." npx ts-node -r tsconfig-paths/register src/database/migrations/restructure-govt-exam-topics.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}

// ── All current govt exam topic slugs ────────────────────────────────────────

const ALL_GOVT_SLUGS = [
  'static-gk',
  'current-affairs',
  'reasoning-aptitude',
  'quantitative-aptitude',
  'english-grammar',
];

// Topics being replaced (hard-deleted)
const SLUGS_TO_DELETE = ['reasoning-aptitude', 'quantitative-aptitude'];

// ── New split topics ─────────────────────────────────────────────────────────

interface NewTopic {
  name: string;
  slug: string;
  category: string;
  description: string;
  icon: string;
  isActive: boolean;
  isPublished: boolean;
  sortOrder: number;
}

const NEW_TOPICS: NewTopic[] = [
  {
    name: 'Reasoning (PO/SO)',
    slug: 'reasoning-po-so',
    category: 'Government Exams',
    description:
      'Logical reasoning for IBPS PO/SO, SBI PO, RBI Grade B: puzzles, seating arrangement, syllogisms, coding-decoding, blood relations, direction sense, inequalities, input-output, data sufficiency, and critical reasoning at officer-level difficulty.',
    icon: '🧩',
    isActive: true,
    isPublished: false,
    sortOrder: 103,
  },
  {
    name: 'Reasoning (Clerk)',
    slug: 'reasoning-clerk',
    category: 'Government Exams',
    description:
      'Logical reasoning for IBPS Clerk, SBI Clerk, RRB Clerk: puzzles, seating arrangement, syllogisms, coding-decoding, blood relations, direction sense, inequalities, alphabet & number series at clerical-level difficulty.',
    icon: '🧩',
    isActive: true,
    isPublished: false,
    sortOrder: 104,
  },
  {
    name: 'Quant (PO/SO)',
    slug: 'quant-po-so',
    category: 'Government Exams',
    description:
      'Quantitative aptitude for IBPS PO/SO, SBI PO, RBI Grade B: data interpretation, number series, quadratic equations, simplification, approximation, arithmetic (percentage, profit & loss, ratio, time & work, SI/CI, mensuration), probability, permutation & combination, and data sufficiency at officer-level difficulty.',
    icon: '🔢',
    isActive: true,
    isPublished: false,
    sortOrder: 105,
  },
  {
    name: 'Quant (Clerk)',
    slug: 'quant-clerk',
    category: 'Government Exams',
    description:
      'Quantitative aptitude for IBPS Clerk, SBI Clerk, RRB Clerk: simplification, number series, percentage, ratio & proportion, time & work, time speed & distance, SI/CI, average, mensuration, number system, and basic data interpretation at clerical-level difficulty.',
    icon: '🔢',
    isActive: true,
    isPublished: false,
    sortOrder: 106,
  },
];

// ── Migration runner ─────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database reference');
    process.exit(1);
  }

  const topicsCol = db.collection('topics');
  const questionsCol = db.collection('questions');
  const aiAnswersCol = db.collection('aianswers');
  const dailySelectionsCol = db.collection('dailyselections');
  const progressCol = db.collection('usertopicprogresses');

  // Step 1: Collect all current govt exam topic IDs
  const govtTopics = await topicsCol
    .find({ slug: { $in: ALL_GOVT_SLUGS } })
    .toArray();

  const govtTopicIds = govtTopics.map((t) => t._id);
  const govtTopicNames = govtTopics.map((t) => `${t.name} (${t.slug})`);

  console.log(`\nFound ${govtTopics.length} govt exam topics: ${govtTopicNames.join(', ')}`);

  if (govtTopicIds.length === 0) {
    console.log('No government exam topics found. Nothing to clean.');
  } else {
    // Step 2: Delete AI answers for questions belonging to these topics
    const questionIds = await questionsCol
      .find({ topicId: { $in: govtTopicIds } })
      .project({ _id: 1 })
      .toArray();

    const qIds = questionIds.map((q) => q._id);
    console.log(`\nFound ${qIds.length} questions across all govt exam topics`);

    if (qIds.length > 0) {
      const aiDeleteResult = await aiAnswersCol.deleteMany({
        questionId: { $in: qIds },
      });
      console.log(`Deleted ${aiDeleteResult.deletedCount} AI answers`);
    }

    // Step 3: Delete all questions for these topics
    const qDeleteResult = await questionsCol.deleteMany({
      topicId: { $in: govtTopicIds },
    });
    console.log(`Deleted ${qDeleteResult.deletedCount} questions`);

    // Step 4: Clean up orphaned DailySelection records
    const dsDeleteResult = await dailySelectionsCol.deleteMany({
      topicId: { $in: govtTopicIds },
    });
    console.log(`Deleted ${dsDeleteResult.deletedCount} daily selections`);

    // Step 5: Clean up orphaned UserTopicProgress records for topics being deleted
    const deletedTopics = govtTopics.filter((t) =>
      SLUGS_TO_DELETE.includes(t.slug),
    );
    const deletedTopicIds = deletedTopics.map((t) => t._id);

    if (deletedTopicIds.length > 0) {
      const progressDeleteResult = await progressCol.deleteMany({
        topicId: { $in: deletedTopicIds },
      });
      console.log(
        `Deleted ${progressDeleteResult.deletedCount} progress records for replaced topics`,
      );
    }
  }

  // Step 6: Hard-delete old combined topics
  const topicDeleteResult = await topicsCol.deleteMany({
    slug: { $in: SLUGS_TO_DELETE },
  });
  console.log(
    `\nHard-deleted ${topicDeleteResult.deletedCount} old topics (${SLUGS_TO_DELETE.join(', ')})`,
  );

  // Step 7: Insert new split topics (idempotent via upsert on slug)
  const operations = NEW_TOPICS.map((topic) => ({
    updateOne: {
      filter: { slug: topic.slug },
      update: { $setOnInsert: topic },
      upsert: true,
    },
  }));

  const bulkResult = await topicsCol.bulkWrite(operations);
  console.log(
    `\nNew topics: ${bulkResult.upsertedCount} inserted, ${bulkResult.matchedCount} already existed`,
  );

  // Step 8: Update English Grammar sortOrder to 107 (last in folder)
  const egUpdateResult = await topicsCol.updateOne(
    { slug: 'english-grammar' },
    { $set: { sortOrder: 107 } },
  );
  console.log(
    `Updated English Grammar sortOrder: ${egUpdateResult.modifiedCount} modified`,
  );

  // Summary
  console.log('\n━━━ Summary ━━━');
  console.log('Government Exams topics after migration:');
  const finalTopics = await topicsCol
    .find({ category: 'Government Exams', isActive: true })
    .sort({ sortOrder: 1 })
    .toArray();
  for (const t of finalTopics) {
    console.log(`  ${t.sortOrder}: ${t.name} (${t.slug}) — isPublished: ${t.isPublished}`);
  }

  await mongoose.disconnect();
  console.log('\nDone');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
