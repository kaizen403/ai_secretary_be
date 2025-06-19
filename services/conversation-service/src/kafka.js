// services/conversation-service/src/kafka.js
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "ai-secretary",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "conversation-service" });
const producer = kafka.producer();

module.exports = { consumer, producer };
