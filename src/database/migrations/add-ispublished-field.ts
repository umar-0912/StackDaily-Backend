/**
 * Migration: Add `isPublished` field to existing topics.
 *
 * All 12 existing topics are already live, so they get `isPublished: true`.
 * New topics added later will default to `isPublished: false` via schema.
 *
 * Run once against the production database:
 *   MONGODB_URI="..." npx ts-node -r tsconfig-paths/register src/database/migrations/add-ispublished-field.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database reference');
    process.exit(1);
  }

  // Set isPublished=true for all existing topics that don't have the field yet
  const result = await db.collection('topics').updateMany(
    { isPublished: { $exists: false } },
    { $set: { isPublished: true } },
  );

  console.log(`Backfilled isPublished=true for ${result.modifiedCount} topics`);

  await mongoose.disconnect();
  console.log('Done');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
