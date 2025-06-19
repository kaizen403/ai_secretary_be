// services/api-gateway/src/index.js
require("dotenv").config();
const Fastify = require("fastify");
const { Kafka } = require("kafkajs");
const { z } = require("zod");

// Initialize Kafka client & producer
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "ai-secretary",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});
const producer = kafka.producer();

async function start() {
  const app = Fastify({ logger: true });

  // Connect Kafka producer
  await producer.connect();

  // Zod schema for incoming payloads
  const messageSchema = z.object({
    phone: z.string().min(5),
    text: z.string().min(1),
  });

  // Health-check endpoint
  app.get("/health", async () => ({ status: "OK" }));

  // POST /message → enqueue to Kafka
  app.post("/message", async (req, reply) => {
    let payload;
    try {
      payload = messageSchema.parse(req.body);
    } catch (err) {
      return reply.status(400).send({ error: err.errors });
    }

    const { phone, text } = payload;
    await producer.send({
      topic: "incoming.messages",
      messages: [{ key: phone, value: JSON.stringify({ phone, text }) }],
    });

    return { status: "queued" };
  });

  // Start server
  const port = process.env.PORT || 4000;
  await app.listen({ port });
  app.log.info(`🚀 API Gateway listening on http://localhost:${port}`);
}

start().catch((err) => {
  console.error("API Gateway failed to start:", err);
  process.exit(1);
});
