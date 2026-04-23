import { runtimeService } from "@/lib/runtime/service";

export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (type: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      const unsubscribe = runtimeService.subscribe((update) => send(update.type, update.payload));
      send("bootstrap", await runtimeService.bootstrap());

      const heartbeat = setInterval(() => {
        send("heartbeat", { at: new Date().toISOString() });
      }, 15000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // stream may already be closed
        }
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
