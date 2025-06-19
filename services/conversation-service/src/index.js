// services/conversation-service/src/index.js
require("dotenv").config();
const { consumer, producer } = require("./kafka");
const { runAgent } = require("./agent");
const { VapiClient } = require("@vapi-ai/server-sdk");
const Twilio = require("twilio");

async function start() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({
    topic: "incoming.messages",
    fromBeginning: false,
  });

  const vapi = new VapiClient({ token: process.env.VAPI_API_TOKEN });
  const twilio = Twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  console.log("🗣️ Conversation Service listening…");

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const { phone, text } = JSON.parse(message.value.toString());
      const agentResponse = await runAgent(phone, text);

      if (text.startsWith("call:")) {
        await vapi.calls.create({
          customer: { number: phone },
          assistant: {
            firstMessage: agentResponse.output,
            voice: {
              provider: "vapi",
              voiceId: process.env.VAPI_VOICE_ID || "Elliot",
            },
          },
        });
      } else {
        await twilio.messages.create({
          body: agentResponse.output,
          to: phone,
          from: process.env.TWILIO_PHONE_NUMBER,
        });
      }

    },
  });
}

start().catch(console.error);
