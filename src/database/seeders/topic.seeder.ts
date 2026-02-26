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
    name: 'JavaScript',
    slug: 'javascript',
    category: 'Programming Languages',
    description:
      'Core JavaScript concepts including ES6+, closures, prototypes, async patterns, and modern language features.',
    icon: 'javascript',
    sortOrder: 1,
  },
  {
    name: 'TypeScript',
    slug: 'typescript',
    category: 'Programming Languages',
    description:
      'TypeScript type system, generics, utility types, declaration files, and advanced type-level programming.',
    icon: 'typescript',
    sortOrder: 2,
  },
  {
    name: 'React',
    slug: 'react',
    category: 'Frontend',
    description:
      'React fundamentals including hooks, component patterns, state management, performance optimization, and the React ecosystem.',
    icon: 'react',
    sortOrder: 3,
  },
  {
    name: 'Node.js',
    slug: 'nodejs',
    category: 'Backend',
    description:
      'Node.js runtime internals, event loop, streams, clustering, package management, and server-side JavaScript patterns.',
    icon: 'nodejs',
    sortOrder: 4,
  },
  {
    name: 'Python',
    slug: 'python',
    category: 'Programming Languages',
    description:
      'Python language features, data structures, decorators, generators, concurrency, and Pythonic best practices.',
    icon: 'python',
    sortOrder: 5,
  },
  {
    name: 'System Design',
    slug: 'system-design',
    category: 'Architecture',
    description:
      'Distributed systems, scalability patterns, load balancing, caching strategies, database sharding, and microservices architecture.',
    icon: 'system-design',
    sortOrder: 6,
  },
  {
    name: 'Data Structures',
    slug: 'data-structures',
    category: 'Computer Science',
    description:
      'Arrays, linked lists, trees, graphs, hash tables, heaps, and their time/space complexity trade-offs.',
    icon: 'data-structures',
    sortOrder: 7,
  },
  {
    name: 'AWS',
    slug: 'aws',
    category: 'Cloud',
    description:
      'Amazon Web Services core services including EC2, S3, Lambda, DynamoDB, CloudFormation, and cloud architecture best practices.',
    icon: 'aws',
    sortOrder: 8,
  },
  {
    name: 'Docker',
    slug: 'docker',
    category: 'DevOps',
    description:
      'Container fundamentals, Dockerfile best practices, multi-stage builds, Docker Compose, networking, and container orchestration.',
    icon: 'docker',
    sortOrder: 9,
  },
  {
    name: 'SQL',
    slug: 'sql',
    category: 'Databases',
    description:
      'SQL querying, joins, indexing strategies, query optimization, transactions, normalization, and relational database design.',
    icon: 'sql',
    sortOrder: 10,
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
