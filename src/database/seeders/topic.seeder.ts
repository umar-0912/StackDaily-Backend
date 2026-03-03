import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Topic, TopicDocument } from '../schemas/topic.schema.js';

interface TopicSeed {
  name: string;
  slug: string;
  category: string;
  description: string;
  icon: string;
  sortOrder: number;
}

const INITIAL_TOPICS: TopicSeed[] = [
  {
    name: 'JavaScript & TypeScript',
    slug: 'javascript-typescript',
    category: 'Programming Languages',
    description:
      'Core JavaScript concepts (ES6+, closures, async patterns) and TypeScript type system (generics, utility types, advanced type-level programming).',
    icon: 'javascript',
    sortOrder: 1,
  },
  {
    name: 'React',
    slug: 'react',
    category: 'Frontend',
    description:
      'React fundamentals including hooks, component patterns, state management, performance optimization, and the React ecosystem.',
    icon: 'react',
    sortOrder: 2,
  },
  {
    name: 'Node.js',
    slug: 'nodejs',
    category: 'Backend',
    description:
      'Node.js runtime internals, event loop, streams, clustering, package management, and server-side JavaScript patterns.',
    icon: 'nodejs',
    sortOrder: 3,
  },
  {
    name: 'Python',
    slug: 'python',
    category: 'Programming Languages',
    description:
      'Python language features, data structures, decorators, generators, concurrency, and Pythonic best practices.',
    icon: 'python',
    sortOrder: 4,
  },
  {
    name: 'System Design',
    slug: 'system-design',
    category: 'Architecture',
    description:
      'Distributed systems, scalability patterns, load balancing, caching strategies, database sharding, and microservices architecture.',
    icon: 'system-design',
    sortOrder: 5,
  },
  {
    name: 'Data Structures',
    slug: 'data-structures',
    category: 'Computer Science',
    description:
      'Arrays, linked lists, trees, graphs, hash tables, heaps, and their time/space complexity trade-offs.',
    icon: 'data-structures',
    sortOrder: 6,
  },
  {
    name: 'AWS',
    slug: 'aws',
    category: 'Cloud',
    description:
      'Amazon Web Services core services including EC2, S3, Lambda, DynamoDB, CloudFormation, and cloud architecture best practices.',
    icon: 'aws',
    sortOrder: 7,
  },
  {
    name: 'Docker',
    slug: 'docker',
    category: 'DevOps',
    description:
      'Container fundamentals, Dockerfile best practices, multi-stage builds, Docker Compose, networking, and container orchestration.',
    icon: 'docker',
    sortOrder: 8,
  },
  {
    name: 'SQL',
    slug: 'sql',
    category: 'Databases',
    description:
      'SQL querying, joins, indexing strategies, query optimization, transactions, normalization, and relational database design.',
    icon: 'sql',
    sortOrder: 9,
  },
  {
    name: 'MySQL',
    slug: 'mysql',
    category: 'Databases',
    description:
      'MySQL relational database: queries, joins, indexing, stored procedures, replication, and performance tuning.',
    icon: 'mysql',
    sortOrder: 10,
  },
  {
    name: 'MongoDB',
    slug: 'mongodb',
    category: 'Databases',
    description:
      'MongoDB document database: CRUD operations, aggregation pipelines, indexing, schema design, replication, and sharding.',
    icon: 'mongodb',
    sortOrder: 11,
  },
];

@Injectable()
export class TopicSeeder implements OnModuleInit {
  private readonly logger = new Logger(TopicSeeder.name);

  constructor(
    @InjectModel(Topic.name)
    private readonly topicModel: Model<TopicDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    const count = await this.topicModel.countDocuments();

    if (count > 0) {
      this.logger.log(
        `Topics collection already has ${count} documents. Skipping seed.`,
      );
      return;
    }

    this.logger.log('Seeding initial topics...');

    try {
      const result = await this.topicModel.insertMany(INITIAL_TOPICS);
      this.logger.log(
        `Successfully seeded ${result.length} topics.`,
      );
    } catch (error) {
      this.logger.error('Failed to seed topics', error);
      throw error;
    }
  }
}
