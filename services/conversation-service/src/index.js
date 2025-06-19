// services/conversation-service/src/index.js
require("dotenv").config();
const { consumer, producer } = require("./kafka");
const { runAgent } = require("./agent");
const ElevenLabs = require("elevenlabs");
const Twilio = require("twilio");

async function start() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({
    topic: "incoming.messages",
    fromBeginning: false,
  });

  const eleven = new ElevenLabs({ apiKey: process.env.ELEVEN_API_KEY });
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

      // generate TTS
      const audio = await eleven.textToSpeech.generate({
        prompt: agentResponse.output,
        voiceId: process.env.ELEVEN_VOICE_ID,
        format: "mp3",
      });

      // send via Twilio
      if (text.startsWith("call:")) {
        await twilio.calls.create({
          url: `https://handler.twilio.com/twiml/EH_XYZ?MediaUrl=${encodeURIComponent(audio.url)}`,
          to: phone,
          from: process.env.TWILIO_PHONE_NUMBER,
        });
      } else {
        await twilio.messages.create({
          body: agentResponse.output,
          to: phone,
          from: process.env.TWILIO_PHONE_NUMBER,
        });
      }

      // schedule reminders if any
      if (
        agentResponse.toolInvocations?.some((t) => t.name === "createReminder")
      ) {
        await producer.send({
          topic: "reminders",
          messages: [
            {
              key: phone,
              value: JSON.stringify(agentResponse.toolInvocations),
            },
          ],
        });
      }
    },
  });
}

start().catch(console.error);
