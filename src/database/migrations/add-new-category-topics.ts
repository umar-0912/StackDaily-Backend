/**
 * Migration: Add 16 new topics across 4 categories.
 *
 * All new topics are created with `isPublished: false` — hidden from users
 * until questions & AI answers are generated and reviewed.
 * Admin flips `isPublished: true` in DB when content is ready.
 *
 * Categories:
 *   - Government Exams (5 topics)
 *   - School (Class 5-10) (4 topics)
 *   - Class 11-12 Boards (4 topics)
 *   - JEE Preparation (3 topics)
 *
 * Run once against the production database:
 *   MONGODB_URI="..." npx ts-node -r tsconfig-paths/register src/database/migrations/add-new-category-topics.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}

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
  // ── Government Exams ─────────────────────────────────────────────────
  {
    name: 'Static GK',
    slug: 'static-gk',
    category: 'Government Exams',
    description:
      'Static General Knowledge: Indian history, geography, polity, economy, science facts, important dates, and constitutional bodies for SSC, UPSC, Banking exams.',
    icon: '📖',
    isActive: true,
    isPublished: false,
    sortOrder: 101,
  },
  {
    name: 'Current Affairs',
    slug: 'current-affairs',
    category: 'Government Exams',
    description:
      'Daily current affairs: national & international events, government schemes, awards, appointments, sports, and summits for competitive exams.',
    icon: '📰',
    isActive: true,
    isPublished: false,
    sortOrder: 102,
  },
  {
    name: 'Reasoning & Aptitude',
    slug: 'reasoning-aptitude',
    category: 'Government Exams',
    description:
      'Logical reasoning, verbal & non-verbal reasoning, puzzles, seating arrangement, syllogisms, coding-decoding for SSC CGL, Banking PO, and UPSC CSAT.',
    icon: '🧩',
    isActive: true,
    isPublished: false,
    sortOrder: 103,
  },
  {
    name: 'Quantitative Aptitude',
    slug: 'quantitative-aptitude',
    category: 'Government Exams',
    description:
      'Number system, percentage, profit & loss, ratio, time & work, mensuration, DI, and simplification for SSC, Banking, and Railway exams.',
    icon: '🔢',
    isActive: true,
    isPublished: false,
    sortOrder: 104,
  },
  {
    name: 'English Grammar',
    slug: 'english-grammar',
    category: 'Government Exams',
    description:
      'English grammar rules, sentence correction, fill in the blanks, reading comprehension, idioms & phrases, and vocabulary for competitive exams.',
    icon: '📝',
    isActive: true,
    isPublished: false,
    sortOrder: 105,
  },

  // ── School (Class 5-10) ──────────────────────────────────────────────
  {
    name: 'Maths (Class 5-8)',
    slug: 'maths-class-5-8',
    category: 'School (Class 5-10)',
    description:
      'NCERT Maths for Class 5-8: fractions, decimals, integers, geometry basics, mensuration, data handling, and algebraic expressions.',
    icon: '➕',
    isActive: true,
    isPublished: false,
    sortOrder: 201,
  },
  {
    name: 'Maths (Class 9-10)',
    slug: 'maths-class-9-10',
    category: 'School (Class 5-10)',
    description:
      'NCERT Maths for Class 9-10: real numbers, polynomials, coordinate geometry, trigonometry, statistics, probability, and surface areas & volumes.',
    icon: '📐',
    isActive: true,
    isPublished: false,
    sortOrder: 202,
  },
  {
    name: 'Science (Class 5-8)',
    slug: 'science-class-5-8',
    category: 'School (Class 5-10)',
    description:
      'NCERT Science for Class 5-8: living world, food, materials, motion, light, electricity basics, and environmental science.',
    icon: '🔬',
    isActive: true,
    isPublished: false,
    sortOrder: 203,
  },
  {
    name: 'Science (Class 9-10)',
    slug: 'science-class-9-10',
    category: 'School (Class 5-10)',
    description:
      'NCERT Science for Class 9-10: matter, atoms & molecules, motion & force, work & energy, heredity, electricity, magnetic effects, and carbon compounds.',
    icon: '⚗️',
    isActive: true,
    isPublished: false,
    sortOrder: 204,
  },

  // ── Class 11-12 Boards ───────────────────────────────────────────────
  {
    name: 'Physics (11-12)',
    slug: 'physics-11-12',
    category: 'Class 11-12 Boards',
    description:
      'CBSE Physics for Class 11-12: mechanics, thermodynamics, waves, optics, electrostatics, current electricity, magnetism, and modern physics.',
    icon: '⚡',
    isActive: true,
    isPublished: false,
    sortOrder: 301,
  },
  {
    name: 'Chemistry (11-12)',
    slug: 'chemistry-11-12',
    category: 'Class 11-12 Boards',
    description:
      'CBSE Chemistry for Class 11-12: atomic structure, chemical bonding, thermodynamics, equilibrium, organic chemistry, polymers, and electrochemistry.',
    icon: '🧪',
    isActive: true,
    isPublished: false,
    sortOrder: 302,
  },
  {
    name: 'Maths (11-12)',
    slug: 'maths-11-12',
    category: 'Class 11-12 Boards',
    description:
      'CBSE Maths for Class 11-12: sets, relations, trigonometry, calculus (limits, derivatives, integrals), probability, vectors, and 3D geometry.',
    icon: '∫',
    isActive: true,
    isPublished: false,
    sortOrder: 303,
  },
  {
    name: 'Biology (11-12)',
    slug: 'biology-11-12',
    category: 'Class 11-12 Boards',
    description:
      'CBSE Biology for Class 11-12: cell biology, genetics, evolution, ecology, human physiology, plant physiology, biotechnology, and reproduction.',
    icon: '🧬',
    isActive: true,
    isPublished: false,
    sortOrder: 304,
  },

  // ── JEE Preparation ──────────────────────────────────────────────────
  {
    name: 'JEE Physics',
    slug: 'jee-physics',
    category: 'JEE Preparation',
    description:
      'JEE Main & Advanced Physics: mechanics, SHM, waves, thermodynamics, electrostatics, magnetism, optics, modern physics — multi-step problem solving.',
    icon: '🎯',
    isActive: true,
    isPublished: false,
    sortOrder: 401,
  },
  {
    name: 'JEE Chemistry',
    slug: 'jee-chemistry',
    category: 'JEE Preparation',
    description:
      'JEE Main & Advanced Chemistry: physical chemistry (equilibrium, kinetics, electrochemistry), organic reactions & mechanisms, inorganic chemistry concepts.',
    icon: '⚛️',
    isActive: true,
    isPublished: false,
    sortOrder: 402,
  },
  {
    name: 'JEE Maths',
    slug: 'jee-maths',
    category: 'JEE Preparation',
    description:
      'JEE Main & Advanced Maths: algebra, calculus, coordinate geometry, trigonometry, probability, vectors, complex numbers — conceptual depth & multi-step solving.',
    icon: '📊',
    isActive: true,
    isPublished: false,
    sortOrder: 403,
  },
];

async function run() {
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database reference');
    process.exit(1);
  }

  const collection = db.collection('topics');

  // Use bulkWrite with upsert on slug to make this idempotent
  const operations = NEW_TOPICS.map((topic) => ({
    updateOne: {
      filter: { slug: topic.slug },
      update: { $setOnInsert: topic },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(operations);

  console.log(
    `Topics migration complete: ${result.upsertedCount} inserted, ${result.matchedCount} already existed`,
  );

  await mongoose.disconnect();
  console.log('Done');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
