/**
 * One-time migration: Insert 25 IBPS PO/SO level English comprehension questions
 * into the English Grammar topic. These are real exam-pattern questions scraped
 * from public competitive exam prep sites.
 *
 * Run once:
 *   MONGODB_URI="..." npx ts-node -r tsconfig-paths/register src/database/migrations/insert-comprehension-questions.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}

// ── Passage 1: India's Plastic Waste Management ─────────────────────────────

const PASSAGE_1 = `Directions: Read the following passage carefully and answer the question.

India, like other large economies, faces a significant plastic waste problem. According to a 2020-21 report by the Central Pollution Control Board (CPCB), four million tonnes of plastic waste are generated annually. Unfortunately, only a quarter of this waste is recycled or treated, with the rest ending up in landfills or being disposed of unsustainably. Since 2016, the Plastic Waste Management Rules have mandated that users of plastics are responsible for collecting and recycling their waste. These requirements, or the Extended Producer Responsibility (EPR) rules, were initially voluntary but are now enforced through an online EPR trading platform. The EPR system involves packagers, importers, and large industrial users of plastic packaging, as well as professional recyclers, registering with the CPCB. Recyclers, who have networks to collect plastic waste, recycle the waste and receive validated certificates for each tonne recycled. These certificates can be uploaded to a dedicated CPCB portal and purchased by plastic packaging companies that fall short of their annual recycling targets. In 2022-23, the CPCB estimated that certificates for nearly 3.7 million tonnes of recycled plastic were generated. However, it was discovered that not all of these certificates were legitimate — there were approximately 6,00,000 fraudulent certificates. Additionally, hackers reportedly stole several thousand certificates last year and sold them to companies. A criminal investigation is ongoing, and it remains unclear how much of the claimed 3.7 million tonnes was genuinely recycled.

In response, the CPCB has taken two significant actions. First, it commissioned an audit of nearly 800 firms, representing almost a fourth of the 2,300 registered recyclers who had traded certificates. Second, it undertook a comprehensive overhaul of the security features on the EPR trading platform, although this has delayed the process of filing returns for 2023-24 by several months. The CPCB has described these problems as "teething issues" associated with implementing a large-scale electronic system. While the audit is necessary, it should be a one-time initiative to avoid undermining trust in the system with annual, lengthy investigations. Although the CPCB has the authority to impose heavy fines, the process is lengthy and fraught with legal challenges. A market-driven approach to solving plastic waste has a significant but limited effect. Greater efforts must be made to curb plastic production and promote sustainable alternatives.`;

// ── Passage 2: Gandhi's Vision of Social Order ──────────────────────────────

const PASSAGE_2 = `Directions: Read the following passage carefully and answer the question.

Gandhi's mission was not merely the political independence of India. He wanted to establish a social order based on truth and non-violence, unity and peace, equality and universal brotherhood, and maximum freedom for all. This new social order was to be based not on materialism but on the spiritual values of life. The implementation of this social restructuring posed greater challenges than the political struggle, as it risked conflict between domestic groups over property distribution. History demonstrates that individuals value possessions as means to ensure their descendants' survival. Fundamental change requires altering attitudes toward property; eventually the wealthy must yield to the disadvantaged.

Attempts at creating egalitarian societies have employed physical force, yet this approach contains inherent contradictions. It is difficult, if not impossible, to say that the instinct to possess has been rooted out or will not resurface in worse forms. Forced equality resembles compressed gas — when barriers break, violent backlash follows with equivalent intensity. This system carries seeds of self-destruction.

Class conflict stems from possessiveness. Pursuing maximum material satisfaction perpetuates acquisition instincts regardless of distribution method. True egalitarianism requires voluntary, enlightened renunciation of goods creating inequality. Gandhi proposed "trusteeship," where wealthy individuals become stewards ensuring collective welfare rather than personal accumulation. The wealthy hold their possessions in trust for society's benefit, using their resources not for personal gain but for the upliftment of the underprivileged. This approach, grounded in moral persuasion rather than force, represents Gandhi's unique contribution to the discourse on social equality.`;

// ── Passage 3: Competitive Examination System ───────────────────────────────

const PASSAGE_3 = `Directions: Read the following passage carefully and answer the question.

Most of the competitive examinations conducted for admission for higher education or job recruitments are objective in nature. They have several advantages over the subjective ones, for both the examining authorities and the examinees. The multiple choice questions (MCQs) are the predominant type of objective questions. For each question a number of alternative answers, usually four, coded as (a), (b), and so on are given, one of which would be the correct or the 'most fitting' answer and the rest distractors.

Electronic evaluation offers almost error-free evaluation compared to subjective evaluation, which involves human elements and is therefore sometimes subject to vagaries. Objective examinations also allow efficient answering by examinees who may have good knowledge but lack language proficiency, and enable considerable saving in time for evaluation. However, question preparation requires great care — questions should suit the level of candidates and include both straightforward recall-type and application-oriented items. All the answer codes must have almost equal probability of being the correct answer and the correct answer must be randomly distributed among the codes.

A negative marking scheme is employed in many competitive examinations to discourage random guessing. Consider a candidate who randomly marks answers for all questions: without negative marking, such a candidate would score approximately 25% marks by sheer luck in a four-option test. With negative marking of 1/(k-1) marks per wrong answer (where k is the number of options), the expected score from random guessing becomes zero. This distinguishes between candidates who guess wisely (by eliminating obviously wrong options) versus those who guess wildly, thereby ensuring that examinations correctly assess the relative merits of candidates.`;

// ── Questions ───────────────────────────────────────────────────────────────

interface ComprehensionQ {
  text: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
}

const QUESTIONS: ComprehensionQ[] = [
  // ── Passage 1: Plastic Waste (5 questions) ──────────────────────────────
  {
    text: `${PASSAGE_1}\n\nQuestion: Which of the following words is OPPOSITE in meaning to "fraudulent" as used in the passage?\n(a) Genuine\n(b) Suspicious\n(c) Corrupt\n(d) Counterfeit`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'vocabulary', 'antonyms', 'environment'],
  },
  {
    text: `${PASSAGE_1}\n\nQuestion: Which of the following words is SIMILAR in meaning to "overhaul" as used in the passage?\n(a) Neglect\n(b) Transfer\n(c) Review\n(d) Renovation`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'vocabulary', 'synonyms', 'environment'],
  },
  {
    text: `${PASSAGE_1}\n\nQuestion: According to the passage, which of the following statements is INCORRECT?\n(a) The CPCB estimated 3.7 million tonnes of recycled plastic certificates in 2022-23\n(b) Hackers stole certificates but it did not raise any concerns with the authorities\n(c) The audit covered approximately one-fourth of registered recyclers\n(d) The EPR rules were initially voluntary before being enforced`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'inference', 'fact-based', 'environment'],
  },
  {
    text: `${PASSAGE_1}\n\nQuestion: Which of the following can be inferred from the passage?\n(a) India's plastic crisis stems solely from recycling inefficiencies\n(b) The EPR platform presents initial challenges but serves an essential purpose\n(c) The CPCB plans to conduct annual audits of all registered recyclers\n(d) Market-driven approaches alone can solve the plastic waste problem`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'inference', 'critical analysis', 'environment'],
  },
  {
    text: `${PASSAGE_1}\n\nQuestion: What were the TWO significant actions taken by the CPCB in response to the fraudulent certificates?\n(a) Imposing heavy fines on all recyclers and shutting down the platform\n(b) Commissioning an audit of ~800 firms and overhauling EPR platform security\n(c) Banning all plastic production and arresting the hackers\n(d) Deregistering all recyclers and starting a new system from scratch`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'factual', 'detail-based', 'environment'],
  },

  // ── Passage 2: Gandhi's Social Order (10 questions) ─────────────────────
  {
    text: `${PASSAGE_2}\n\nQuestion: Gandhi's primary aims, as described in the passage, included:\n(a) Achieving only political freedom for India\n(b) Establishing a society based on materialism and economic growth\n(c) Establishing a social order based on truth, non-violence, equality, and universal brotherhood\n(d) Creating a military-based governance system`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'factual', 'Gandhi', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: The word "egalitarianism" as used in the passage most nearly means:\n(a) Suppression of individual rights\n(b) A belief in social and political equality for all people\n(c) Economic dominance by the wealthy\n(d) A system of hereditary privileges`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'vocabulary', 'synonyms', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: Which of the following statements is FALSE according to the passage?\n(a) Possessive instincts cause class conflicts\n(b) Possessive instincts cannot be completely eliminated through force\n(c) Pursuing maximum material satisfaction ensures lasting peace and equality\n(d) Voluntary renunciation is essential for true egalitarianism`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'inference', 'critical analysis', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: The word "guise" as used in context most similarly means:\n(a) Illusion\n(b) Disappearance\n(c) Outward appearance or pretense\n(d) Approval`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'vocabulary', 'synonyms', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: According to the passage, people ultimately reject social orders that are:\n(a) Based on coercion and oppression\n(b) Failing to satisfy basic needs\n(c) Emphasizing conciliation and dialogue\n(d) Aligned with spiritual values`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'inference', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: What does Gandhi's "ideal of trusteeship" mean according to the passage?\n(a) Equating material satisfaction with social progress\n(b) The government seizing all private property\n(c) Wealthy individuals voluntarily managing their resources for collective welfare\n(d) Replacing spiritual values with material ones`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'concept', 'Gandhi', 'trusteeship'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: The phrase "rooted out" as used in the passage means:\n(a) To destroy something completely\n(b) To plant something deeply\n(c) To find and completely remove something\n(d) To flatten something to the ground`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'vocabulary', 'phrasal expression', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: The expression "haves yielding to have-nots" in the passage broadly means:\n(a) Gandhi's principles replacing all existing political ideologies\n(b) Complete elimination of all foreign influence\n(c) Mandatory confiscation of all private wealth\n(d) The wealthy contributing their resources toward societal progress`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'inference', 'expression', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: What would be the most suitable title for this passage?\n(a) Material versus Spiritual Values in Modern India\n(b) Class Conflicts in an Egalitarian Society\n(c) Gandhi's Vision of a Just Social Order\n(d) The Economics of Renouncing Possessive Instinct`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'main idea', 'title', 'social order'],
  },
  {
    text: `${PASSAGE_2}\n\nQuestion: Why does the author compare forced equality to "compressed gas"?\n(a) To show that equality is a scientific concept\n(b) To illustrate that suppressed instincts will eventually explode with greater force\n(c) To argue that physical force is the best method for equality\n(d) To demonstrate that gas dynamics apply to social systems`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'analogy', 'critical analysis', 'social order'],
  },

  // ── Passage 3: Competitive Examination System (10 questions) ────────────
  {
    text: `${PASSAGE_3}\n\nQuestion: Why is electronic evaluation preferred over subjective evaluation according to the passage?\n(a) It is faster but less accurate\n(b) It eliminates human error and provides almost error-free results\n(c) It requires fewer qualified evaluators\n(d) It is cheaper to implement`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'factual', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: What is the nearest meaning of the word "VAGARIES" as used in the passage?\n(a) Error-ridden evaluation procedures\n(b) Unpredictable and uncontrollable changes or fluctuations\n(c) Deliberate mistakes in specific papers\n(d) Systematic biases in the evaluation process`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'vocabulary', 'synonyms', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: What term does the passage use for the wrong answer options besides the correct one in an MCQ?\n(a) Attention-grabbers\n(b) Diversions\n(c) Distractors\n(d) Decoys`,
    difficulty: 'beginner',
    tags: ['reading comprehension', 'factual', 'vocabulary', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: Which of the following statements is INCORRECT based on the passage?\n(a) Objective questions require careful preparation and skill in framing\n(b) Negative marking is adopted in several competitive tests\n(c) Selecting the "most fitting" answer involves arbitrary guesswork\n(d) Examinations aim to assess the relative merits of candidates`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'inference', 'fact-checking', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: What is an important consideration in preparing answer options according to the passage?\n(a) Making the correct answer always the first option\n(b) All option codes must have equal probability and the correct answer must be randomly distributed\n(c) Using the same distractor in multiple questions\n(d) Ensuring only one option is grammatically correct`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'factual', 'detail-based', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: According to the passage, what is the key consideration in question preparation for competitive exams?\n(a) Questions should include both straightforward and application-oriented items suited to the candidate level\n(b) Having four options makes questions sufficiently complex\n(c) Most questions should test only practical knowledge\n(d) Theoretical knowledge tests are better than application-based tests`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'factual', 'detail-based', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: How does the passage distinguish between "wise guessing" and "wild guessing"?\n(a) Wise guessing involves selecting the longest option\n(b) Wise guessing involves eliminating obviously wrong options to narrow down choices\n(c) Wild guessing is encouraged when time is running out\n(d) There is no meaningful difference between the two`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'inference', 'concept', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: What is the best inference from the passage's discussion on negative marking?\n(a) Negative marking penalizes knowledgeable candidates\n(b) Negative marking ensures that random guessing yields zero expected score, thus rewarding genuine knowledge\n(c) Negative marking should be abolished from all exams\n(d) Negative marking benefits candidates who mark all options as (a)`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'inference', 'critical analysis', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: One advantage of objective examinations mentioned in the passage is that they:\n(a) Test only language proficiency\n(b) Allow efficient answering by examinees who have knowledge but may lack language proficiency\n(c) Require more time for evaluation than subjective exams\n(d) Are easier to prepare than subjective questions`,
    difficulty: 'intermediate',
    tags: ['reading comprehension', 'factual', 'advantage', 'examination system'],
  },
  {
    text: `${PASSAGE_3}\n\nQuestion: What is the expected score of a candidate who randomly marks all answers in a four-option MCQ test WITH negative marking of 1/3 per wrong answer?\n(a) 25% of total marks\n(b) Approximately zero\n(c) 50% of total marks\n(d) It depends on the number of questions`,
    difficulty: 'advanced',
    tags: ['reading comprehension', 'analytical', 'negative marking', 'examination system'],
  },
];

// ── Main ───────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database reference');
    process.exit(1);
  }

  // Find the English Grammar topic
  const topic = await db.collection('topics').findOne({ slug: 'english-grammar' });
  if (!topic) {
    console.error('English Grammar topic not found!');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found topic: ${topic.name} (${topic._id})`);

  // Prepare documents
  const docs = QUESTIONS.map((q) => ({
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

  const result = await db.collection('questions').insertMany(docs);
  console.log(`\n✓ Inserted ${result.insertedCount} comprehension questions for English Grammar`);

  // Show difficulty breakdown
  const beginner = QUESTIONS.filter((q) => q.difficulty === 'beginner').length;
  const intermediate = QUESTIONS.filter((q) => q.difficulty === 'intermediate').length;
  const advanced = QUESTIONS.filter((q) => q.difficulty === 'advanced').length;
  console.log(`  Beginner: ${beginner} | Intermediate: ${intermediate} | Advanced: ${advanced}`);

  // Show updated total
  const totalCount = await db
    .collection('questions')
    .countDocuments({ topicId: topic._id, isActive: true });
  console.log(`\nTotal English Grammar questions now: ${totalCount}`);

  await mongoose.disconnect();
  console.log('Done');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
