/**
 * Migration: Restructure school/board/JEE topics into per-class topics
 * and add NEET preparation topics.
 *
 * Actions:
 *   1. Hard-delete 11 old combined topics (they were never published, no subscribers)
 *   2. Insert 34 new per-class topics (all isPublished: false)
 *
 * New structure:
 *   - Class 6-8:  Science + Maths per class
 *   - Class 9-12: Physics + Chemistry + Biology + Maths per class
 *   - JEE Class 11/12: Physics + Chemistry + Maths
 *   - NEET Class 11/12: Physics + Chemistry + Biology
 *
 * Run once:
 *   MONGODB_URI="..." npx ts-node -r tsconfig-paths/register src/database/migrations/restructure-school-topics.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}

// ── Old topics to hard-delete ────────────────────────────────────────────────

const OLD_SLUGS = [
  'maths-class-5-8',
  'maths-class-9-10',
  'science-class-5-8',
  'science-class-9-10',
  'physics-11-12',
  'chemistry-11-12',
  'maths-11-12',
  'biology-11-12',
  'jee-physics',
  'jee-chemistry',
  'jee-maths',
];

// ── New per-class topics ─────────────────────────────────────────────────────

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
  // ── Class 6 ────────────────────────────────────────────────────────────────
  {
    name: 'Class 6 Science',
    slug: 'class-6-science',
    category: 'Class 6',
    description:
      'NCERT Science for Class 6: food, materials, the living world, motion & measurement, electricity & magnets, and our environment.',
    icon: '🔬',
    isActive: true,
    isPublished: false,
    sortOrder: 600,
  },
  {
    name: 'Class 6 Maths',
    slug: 'class-6-maths',
    category: 'Class 6',
    description:
      'NCERT Maths for Class 6: knowing our numbers, whole numbers, basic geometry, fractions, decimals, data handling, and mensuration.',
    icon: '➕',
    isActive: true,
    isPublished: false,
    sortOrder: 601,
  },

  // ── Class 7 ────────────────────────────────────────────────────────────────
  {
    name: 'Class 7 Science',
    slug: 'class-7-science',
    category: 'Class 7',
    description:
      'NCERT Science for Class 7: nutrition, fibre to fabric, heat, acids & bases, physical & chemical changes, weather & climate, and soil.',
    icon: '🔬',
    isActive: true,
    isPublished: false,
    sortOrder: 700,
  },
  {
    name: 'Class 7 Maths',
    slug: 'class-7-maths',
    category: 'Class 7',
    description:
      'NCERT Maths for Class 7: integers, fractions & decimals, data handling, simple equations, lines & angles, triangles, and perimeter & area.',
    icon: '➕',
    isActive: true,
    isPublished: false,
    sortOrder: 701,
  },

  // ── Class 8 ────────────────────────────────────────────────────────────────
  {
    name: 'Class 8 Science',
    slug: 'class-8-science',
    category: 'Class 8',
    description:
      'NCERT Science for Class 8: crop production, microorganisms, synthetic fibres, metals & non-metals, combustion, friction, sound, and light.',
    icon: '🔬',
    isActive: true,
    isPublished: false,
    sortOrder: 800,
  },
  {
    name: 'Class 8 Maths',
    slug: 'class-8-maths',
    category: 'Class 8',
    description:
      'NCERT Maths for Class 8: rational numbers, linear equations, quadrilaterals, data handling, squares & cubes, algebra, and mensuration.',
    icon: '➕',
    isActive: true,
    isPublished: false,
    sortOrder: 801,
  },

  // ── Class 9 ────────────────────────────────────────────────────────────────
  {
    name: 'Class 9 Physics',
    slug: 'class-9-physics',
    category: 'Class 9',
    description:
      'NCERT Physics for Class 9: motion, force & laws of motion, gravitation, work & energy, and sound.',
    icon: '⚡',
    isActive: true,
    isPublished: false,
    sortOrder: 900,
  },
  {
    name: 'Class 9 Chemistry',
    slug: 'class-9-chemistry',
    category: 'Class 9',
    description:
      'NCERT Chemistry for Class 9: matter in our surroundings, is matter around us pure, atoms & molecules, and structure of the atom.',
    icon: '🧪',
    isActive: true,
    isPublished: false,
    sortOrder: 901,
  },
  {
    name: 'Class 9 Biology',
    slug: 'class-9-biology',
    category: 'Class 9',
    description:
      'NCERT Biology for Class 9: the fundamental unit of life, tissues, diversity in living organisms, and improvement in food resources.',
    icon: '🧬',
    isActive: true,
    isPublished: false,
    sortOrder: 902,
  },
  {
    name: 'Class 9 Maths',
    slug: 'class-9-maths',
    category: 'Class 9',
    description:
      'NCERT Maths for Class 9: number systems, polynomials, coordinate geometry, linear equations, triangles, quadrilaterals, circles, and statistics.',
    icon: '📐',
    isActive: true,
    isPublished: false,
    sortOrder: 903,
  },

  // ── Class 10 ───────────────────────────────────────────────────────────────
  {
    name: 'Class 10 Physics',
    slug: 'class-10-physics',
    category: 'Class 10',
    description:
      'NCERT Physics for Class 10: electricity, magnetic effects of current, light — reflection & refraction, and the human eye.',
    icon: '⚡',
    isActive: true,
    isPublished: false,
    sortOrder: 1000,
  },
  {
    name: 'Class 10 Chemistry',
    slug: 'class-10-chemistry',
    category: 'Class 10',
    description:
      'NCERT Chemistry for Class 10: chemical reactions, acids & bases, metals & non-metals, carbon compounds, and periodic classification.',
    icon: '🧪',
    isActive: true,
    isPublished: false,
    sortOrder: 1001,
  },
  {
    name: 'Class 10 Biology',
    slug: 'class-10-biology',
    category: 'Class 10',
    description:
      'NCERT Biology for Class 10: life processes, control & coordination, reproduction, heredity & evolution, and our environment.',
    icon: '🧬',
    isActive: true,
    isPublished: false,
    sortOrder: 1002,
  },
  {
    name: 'Class 10 Maths',
    slug: 'class-10-maths',
    category: 'Class 10',
    description:
      'NCERT Maths for Class 10: real numbers, polynomials, linear equations, quadratic equations, arithmetic progressions, triangles, coordinate geometry, trigonometry, and probability.',
    icon: '📐',
    isActive: true,
    isPublished: false,
    sortOrder: 1003,
  },

  // ── Class 11 ───────────────────────────────────────────────────────────────
  {
    name: 'Class 11 Physics',
    slug: 'class-11-physics',
    category: 'Class 11',
    description:
      'CBSE Physics for Class 11: units & measurements, kinematics, laws of motion, work-energy-power, rotational motion, gravitation, mechanical properties, thermodynamics, oscillations, and waves.',
    icon: '⚡',
    isActive: true,
    isPublished: false,
    sortOrder: 1100,
  },
  {
    name: 'Class 11 Chemistry',
    slug: 'class-11-chemistry',
    category: 'Class 11',
    description:
      'CBSE Chemistry for Class 11: atomic structure, classification of elements, chemical bonding, states of matter, thermodynamics, equilibrium, redox reactions, and hydrocarbons.',
    icon: '🧪',
    isActive: true,
    isPublished: false,
    sortOrder: 1101,
  },
  {
    name: 'Class 11 Biology',
    slug: 'class-11-biology',
    category: 'Class 11',
    description:
      'CBSE Biology for Class 11: the living world, biological classification, plant & animal kingdom, cell structure, biomolecules, cell division, and plant physiology.',
    icon: '🧬',
    isActive: true,
    isPublished: false,
    sortOrder: 1102,
  },
  {
    name: 'Class 11 Maths',
    slug: 'class-11-maths',
    category: 'Class 11',
    description:
      'CBSE Maths for Class 11: sets, relations & functions, trigonometry, complex numbers, linear inequalities, permutations, binomial theorem, sequences, straight lines, conic sections, and statistics.',
    icon: '∫',
    isActive: true,
    isPublished: false,
    sortOrder: 1103,
  },

  // ── Class 12 ───────────────────────────────────────────────────────────────
  {
    name: 'Class 12 Physics',
    slug: 'class-12-physics',
    category: 'Class 12',
    description:
      'CBSE Physics for Class 12: electrostatics, current electricity, magnetism, electromagnetic induction, AC, electromagnetic waves, optics, dual nature of radiation, atoms, nuclei, and semiconductors.',
    icon: '⚡',
    isActive: true,
    isPublished: false,
    sortOrder: 1200,
  },
  {
    name: 'Class 12 Chemistry',
    slug: 'class-12-chemistry',
    category: 'Class 12',
    description:
      'CBSE Chemistry for Class 12: solid state, solutions, electrochemistry, chemical kinetics, surface chemistry, p-block, d & f-block, coordination compounds, organic chemistry, and biomolecules.',
    icon: '🧪',
    isActive: true,
    isPublished: false,
    sortOrder: 1201,
  },
  {
    name: 'Class 12 Biology',
    slug: 'class-12-biology',
    category: 'Class 12',
    description:
      'CBSE Biology for Class 12: reproduction, genetics & evolution, biology in human welfare, biotechnology, and ecology & environment.',
    icon: '🧬',
    isActive: true,
    isPublished: false,
    sortOrder: 1202,
  },
  {
    name: 'Class 12 Maths',
    slug: 'class-12-maths',
    category: 'Class 12',
    description:
      'CBSE Maths for Class 12: relations & functions, inverse trigonometry, matrices, determinants, continuity & differentiability, integrals, differential equations, vectors, 3D geometry, and probability.',
    icon: '∫',
    isActive: true,
    isPublished: false,
    sortOrder: 1203,
  },

  // ── JEE - Class 11 ────────────────────────────────────────────────────────
  {
    name: 'JEE Class 11 Physics',
    slug: 'jee-class-11-physics',
    category: 'JEE - Class 11',
    description:
      'JEE Main & Advanced Physics (Class 11 syllabus): mechanics, rotational motion, gravitation, SHM, waves, and thermodynamics — multi-step problem solving.',
    icon: '🎯',
    isActive: true,
    isPublished: false,
    sortOrder: 1300,
  },
  {
    name: 'JEE Class 11 Chemistry',
    slug: 'jee-class-11-chemistry',
    category: 'JEE - Class 11',
    description:
      'JEE Main & Advanced Chemistry (Class 11 syllabus): atomic structure, bonding, thermodynamics, equilibrium, redox, s-block, p-block, and basic organic chemistry.',
    icon: '⚛️',
    isActive: true,
    isPublished: false,
    sortOrder: 1301,
  },
  {
    name: 'JEE Class 11 Maths',
    slug: 'jee-class-11-maths',
    category: 'JEE - Class 11',
    description:
      'JEE Main & Advanced Maths (Class 11 syllabus): sets, trigonometry, complex numbers, quadratic equations, permutations, binomial theorem, sequences, and straight lines.',
    icon: '📊',
    isActive: true,
    isPublished: false,
    sortOrder: 1302,
  },

  // ── JEE - Class 12 ────────────────────────────────────────────────────────
  {
    name: 'JEE Class 12 Physics',
    slug: 'jee-class-12-physics',
    category: 'JEE - Class 12',
    description:
      'JEE Main & Advanced Physics (Class 12 syllabus): electrostatics, current electricity, magnetism, EMI, optics, modern physics, and semiconductors.',
    icon: '🎯',
    isActive: true,
    isPublished: false,
    sortOrder: 1400,
  },
  {
    name: 'JEE Class 12 Chemistry',
    slug: 'jee-class-12-chemistry',
    category: 'JEE - Class 12',
    description:
      'JEE Main & Advanced Chemistry (Class 12 syllabus): electrochemistry, kinetics, surface chemistry, d-block, coordination chemistry, organic reactions & mechanisms.',
    icon: '⚛️',
    isActive: true,
    isPublished: false,
    sortOrder: 1401,
  },
  {
    name: 'JEE Class 12 Maths',
    slug: 'jee-class-12-maths',
    category: 'JEE - Class 12',
    description:
      'JEE Main & Advanced Maths (Class 12 syllabus): calculus (limits, derivatives, integrals), differential equations, vectors, 3D geometry, probability, and matrices.',
    icon: '📊',
    isActive: true,
    isPublished: false,
    sortOrder: 1402,
  },

  // ── NEET - Class 11 ───────────────────────────────────────────────────────
  {
    name: 'NEET Class 11 Physics',
    slug: 'neet-class-11-physics',
    category: 'NEET - Class 11',
    description:
      'NEET Physics (Class 11 syllabus): units & measurements, kinematics, laws of motion, work & energy, rotational motion, gravitation, mechanical properties, thermodynamics, and waves.',
    icon: '🏥',
    isActive: true,
    isPublished: false,
    sortOrder: 1500,
  },
  {
    name: 'NEET Class 11 Chemistry',
    slug: 'neet-class-11-chemistry',
    category: 'NEET - Class 11',
    description:
      'NEET Chemistry (Class 11 syllabus): basic concepts, atomic structure, chemical bonding, states of matter, thermodynamics, equilibrium, and hydrocarbons.',
    icon: '🧪',
    isActive: true,
    isPublished: false,
    sortOrder: 1501,
  },
  {
    name: 'NEET Class 11 Biology',
    slug: 'neet-class-11-biology',
    category: 'NEET - Class 11',
    description:
      'NEET Biology (Class 11 syllabus): the living world, biological classification, morphology, anatomy, cell biology, biomolecules, cell division, and plant physiology.',
    icon: '🧬',
    isActive: true,
    isPublished: false,
    sortOrder: 1502,
  },

  // ── NEET - Class 12 ───────────────────────────────────────────────────────
  {
    name: 'NEET Class 12 Physics',
    slug: 'neet-class-12-physics',
    category: 'NEET - Class 12',
    description:
      'NEET Physics (Class 12 syllabus): electrostatics, current electricity, magnetic effects, electromagnetic induction, optics, dual nature of radiation, atoms, and nuclei.',
    icon: '🏥',
    isActive: true,
    isPublished: false,
    sortOrder: 1600,
  },
  {
    name: 'NEET Class 12 Chemistry',
    slug: 'neet-class-12-chemistry',
    category: 'NEET - Class 12',
    description:
      'NEET Chemistry (Class 12 syllabus): solid state, solutions, electrochemistry, kinetics, surface chemistry, coordination compounds, organic reactions, and biomolecules.',
    icon: '🧪',
    isActive: true,
    isPublished: false,
    sortOrder: 1601,
  },
  {
    name: 'NEET Class 12 Biology',
    slug: 'neet-class-12-biology',
    category: 'NEET - Class 12',
    description:
      'NEET Biology (Class 12 syllabus): reproduction, genetics & evolution, human health & disease, biotechnology, and ecology & environment.',
    icon: '🧬',
    isActive: true,
    isPublished: false,
    sortOrder: 1602,
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

  const collection = db.collection('topics');

  // Step 1: Hard-delete old combined topics
  const deleteResult = await collection.deleteMany({
    slug: { $in: OLD_SLUGS },
  });
  console.log(`Deleted ${deleteResult.deletedCount} old combined topics`);

  // Step 2: Insert new per-class topics (idempotent via upsert on slug)
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
