/**
 * Migration: Backfill `name` field for existing users.
 *
 * Existing users created before the name field was added have no `name` value.
 * This script copies `username` into `name` for every user where `name` is
 * missing or empty.
 *
 * Run once against the production database:
 *   npx ts-node -r tsconfig-paths/register src/database/migrations/backfill-user-name.ts
 *
 * Or via mongosh:
 *   db.users.updateMany(
 *     { name: { $exists: false } },
 *     [{ $set: { name: "$username" } }]
 *   )
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

  const result = await db.collection('users').updateMany(
    { $or: [{ name: { $exists: false } }, { name: '' }, { name: null }] },
    [{ $set: { name: '$username' } }],
  );

  console.log(`Backfilled name for ${result.modifiedCount} users`);

  await mongoose.disconnect();
  console.log('Done');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
