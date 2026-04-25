const fetch = require("node-fetch");

async function test() {
  const start = Date.now();
  try {
    const res = await fetch("http://localhost:3000/api/reply/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "test",
        draft: "you always do this, you never care about my feelings. this is ridiculous.",
        context: "conversation: human",
        conversationKind: "human",
        otherPartyName: "Alex",
        userName: "You",
        conversation_context: [
          { speaker_name: "Alex", speaker_type: "user", message: "i can't make it tonight, sorry." }
        ],
        latest_incoming_message: { speaker_name: "Alex", speaker_type: "user", message: "i can't make it tonight, sorry." },
        user_draft: { speaker_name: "You", speaker_type: "user", message: "you always do this, you never care about my feelings. this is ridiculous." }
      })
    });
    const data = await res.json();
    console.log(`Time: ${Date.now() - start}ms`);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Error after ${Date.now() - start}ms:`, e);
  }
}

test();
