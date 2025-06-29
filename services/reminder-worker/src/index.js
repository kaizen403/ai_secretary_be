// services/reminder-worker/src/index.js
require("dotenv").config();
const { Kafka } = require("kafkajs");
const { VapiClient } = require("@vapi-ai/server-sdk");
const { parseISO, isBefore } = require("date-fns");

async function start() {
  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "ai-secretary",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  });
  const consumer = kafka.consumer({ groupId: "reminder-worker" });
  await consumer.connect();
  await consumer.subscribe({ topic: "reminders", fromBeginning: false });

  const vapi = new VapiClient({ token: process.env.VAPI_API_TOKEN });

  console.log("⏰ Reminder Worker listening…");

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const reminders = JSON.parse(message.value.toString());
      for (const r of reminders) {
        const when = parseISO(r.metadata.when);
        if (isBefore(when, new Date())) continue;
        setTimeout(async () => {
          await vapi.calls.create({
            customer: { number: r.metadata.phone },
            assistant: {
              firstMessage: r.metadata.text,
              voice: {
                provider: "vapi",
                voiceId: process.env.VAPI_VOICE_ID || "Elliot",
              },
            },
          });
        }, when.getTime() - Date.now());
      }
    },
  });
}

start().catch((err) => {
  console.error("Reminder Worker failed to start:", err);
  process.exit(1);
});
