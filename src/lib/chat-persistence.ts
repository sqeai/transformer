import { createAdminClient } from "@/lib/supabase/admin";
import type { UIMessage } from "ai";

interface SaveChatOnFinishOptions {
  chatId: string | null;
  userId: string;
}

export async function markChatStreaming(chatId: string, userId: string) {
  const supabase = createAdminClient();
  await supabase
    .from("chat_history")
    .update({ streaming_status: "streaming" })
    .eq("id", chatId)
    .eq("user_id", userId);
}

/**
 * Returns an `onFinish` handler for `createUIMessageStream` that persists
 * the completed message list to the `chat_history` table.
 *
 * Because this runs inside the server-side stream pipeline, it executes
 * even when the client disconnects mid-stream — ensuring no work is lost.
 */
export function saveChatOnFinish({ chatId, userId }: SaveChatOnFinishOptions) {
  return async ({
    messages,
  }: {
    messages: UIMessage[];
    isContinuation: boolean;
    isAborted: boolean;
    responseMessage: UIMessage;
  }) => {
    if (!chatId || messages.length === 0) return;

    try {
      const supabase = createAdminClient();
      await supabase
        .from("chat_history")
        .update({ messages, streaming_status: "idle" })
        .eq("id", chatId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("[chat-persistence] Failed to save chat:", err);
    }
  };
}
