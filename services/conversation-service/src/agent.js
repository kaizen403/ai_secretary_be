// services/conversation-service/src/agent.js
require("dotenv").config();
const { ChatGroq } = require("@langchain/groq");
const { initializeAgentExecutor, runnableTool } = require("langchain/agents");
const { Pinecone } = require("@pinecone-database/pinecone");
const { db } = require("../../common/src/db");

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT,
});
const index = pc.Index(process.env.PINECONE_INDEX);

async function runAgent(phone, text) {
  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL_NAME || "llama3-70b-8192",
    streaming: true,
  });

  const calendarTool = runnableTool({
    name: "getFreeBusy",
    description: "Returns next 3 free slots in user's Google Calendar",
    func: async () => {
      // TODO: integrate real Google Calendar
      return "2025-06-21T10:00,2025-06-21T15:00,2025-06-22T09:00";
    },
  });

  const memorySearch = runnableTool({
    name: "memorySearch",
    description: "Search user notes for relevant context",
    func: async (query) => {
      const res = await index.query({
        topK: 5,
        includeMetadata: true,
        query,
        namespace: phone,
      });
      return JSON.stringify(res.matches);
    },
  });

  const executor = await initializeAgentExecutor(
    [calendarTool, memorySearch],
    llm,
    { agentType: "zero-shot-react" },
  );

  return executor.invoke({ input: text });
}

module.exports = { runAgent };
