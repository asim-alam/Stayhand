import { analyzeReplyDraft } from "./lib/real-mode/reply-service";

async function test() {
  const result = await analyzeReplyDraft({
    draft: "you always do this, you never care about my feelings. this is ridiculous.",
    context: "conversation: human",
    conversationKind: "human",
    otherPartyName: "Alex",
    userName: "You",
    conversation_context: [
      { speaker_name: "Alex", speaker_type: "user", message: "i can't make it tonight, sorry.", id: "1", created_at: "now" }
    ],
    latest_incoming_message: { speaker_name: "Alex", speaker_type: "user", message: "i can't make it tonight, sorry.", id: "1", created_at: "now" },
    user_draft: { speaker_name: "You", speaker_type: "user", message: "you always do this, you never care about my feelings. this is ridiculous.", id: "2", created_at: "now" }
  });
  console.log(JSON.stringify(result, null, 2));
}

test();
