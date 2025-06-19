// services/conversation-service/src/agent.js
require("dotenv").config();
const { ChatGroq } = require("@langchain/groq");
const { initializeAgentExecutor, runnableTool } = require("langchain/agents");
const { db } = require("../../common/src/db");
const { producer } = require("./kafka");

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
      const notes = await db.note.findMany({
        where: {
          user: { phone },
          content: { contains: query, mode: "insensitive" },
        },
        take: 5,
      });
      return notes.map((n) => n.content).join("\n");
    },
  });

  const addNote = runnableTool({
    name: "addNote",
    description: "Save a note for future reference",
    func: async (content) => {
      const user = await db.user.upsert({
        where: { phone },
        create: { phone, name: phone },
        update: {},
      });
      await db.note.create({ data: { userId: user.id, content } });
      return "Note saved";
    },
  });

  const createReminder = runnableTool({
    name: "createReminder",
    description:
      "Schedule a reminder. Input JSON: {text: string, when: ISO8601 string}",
    func: async (data) => {
      let payload;
      try {
        payload = typeof data === "string" ? JSON.parse(data) : data;
      } catch {
        return "Invalid reminder payload";
      }
      await producer.send({
        topic: "reminders",
        messages: [
          {
            key: phone,
            value: JSON.stringify([
              { metadata: { phone, text: payload.text, when: payload.when } },
            ]),
          },
        ],
      });
      return `Reminder scheduled for ${payload.when}`;
    },
  });

  const executor = await initializeAgentExecutor(
    [calendarTool, memorySearch, addNote, createReminder],
    llm,
    { agentType: "zero-shot-react" },
  );

  return executor.invoke({ input: text });
}

module.exports = { runAgent };
