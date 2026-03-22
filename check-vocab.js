const { MongoClient } = require("mongodb");
(async () => {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db("stackdaily");
  const topic = await db.collection("topics").findOne({ slug: "english-vocabulary" });
  if (!topic) { console.log("No topic found"); await client.close(); return; }
  console.log("Topic:", topic.name, "| ID:", topic._id.toString());
  console.log("contentType:", topic.contentType, "| isPublished:", topic.isPublished);
  const qCount = await db.collection("questions").countDocuments({ topicId: topic._id });
  const qIds = (await db.collection("questions").find({ topicId: topic._id }).project({ _id: 1 }).toArray()).map(q => q._id);
  const aCount = await db.collection("aianswers").countDocuments({ questionId: { $in: qIds } });
  console.log("Questions:", qCount);
  console.log("AI Answers:", aCount);
  const sample = await db.collection("questions").findOne({ topicId: topic._id });
  console.log("Sample words count:", sample.words ? sample.words.length : 0);
  if (sample.words && sample.words[0]) console.log("First word:", sample.words[0].word);
  await client.close();
})();
