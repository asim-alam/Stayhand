function tokenize(text: string): string[] {
  const tokens = text.match(/\S+\s*/g);
  return tokens?.length ? tokens : [text];
}

export function createTextSseStream(text: string, paceMs = 32): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const tokens = tokenize(text);
  let timer: ReturnType<typeof setTimeout> | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
      };

      const finish = () => {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      const push = (index: number) => {
        if (index >= tokens.length) {
          finish();
          return;
        }
        send(tokens[index]);
        timer = setTimeout(() => push(index + 1), paceMs);
      };

      push(0);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
      }
    },
  });
}
