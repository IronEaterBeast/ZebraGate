import type { FastifyReply } from "fastify";
import type { OpenAICompatibleChatResponseChunk } from "@zebragate/shared";

export function setupSse(reply: FastifyReply): void {
  reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.flushHeaders();
}

export function writeSseChunk(reply: FastifyReply, chunk: OpenAICompatibleChatResponseChunk): void {
  reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

export function writeSseRawChunk(reply: FastifyReply, chunk: Uint8Array): void {
  reply.raw.write(chunk);
}

export function endSse(reply: FastifyReply): void {
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}
