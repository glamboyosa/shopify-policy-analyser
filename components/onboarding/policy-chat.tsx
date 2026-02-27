"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/policies/client-types";

type PolicyChatProps = {
  storeId: string | null;
  isAsking: boolean;
  messages: ChatMessage[];
  onAsk: (question: string) => Promise<void>;
};

export function PolicyChat({
  storeId,
  isAsking,
  messages,
  onAsk,
}: PolicyChatProps) {
  const [question, setQuestion] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tiny Policy Q&amp;A</CardTitle>
        <CardDescription>
          Ask freeform questions grounded in persisted `policy_text`. Messages stay local.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = question.trim();
            if (!trimmed || !storeId) {
              return;
            }
            setQuestion("");
            await onAsk(trimmed);
          }}
        >
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Can customers exchange sale items?"
            disabled={!storeId || isAsking}
          />
          <Button type="submit" disabled={!storeId || !question.trim() || isAsking}>
            Ask
          </Button>
        </form>

        <div className="max-h-64 space-y-2 overflow-auto rounded border p-3">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Ask a policy question after analysis completes.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`rounded px-2 py-1 text-xs ${
                  message.role === "user"
                    ? "bg-primary/10 text-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                <strong className="mr-1">
                  {message.role === "user" ? "You:" : "Assistant:"}
                </strong>
                {message.text}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
