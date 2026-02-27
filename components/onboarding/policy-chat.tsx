"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

/**
 * Renders assistant message content as safe markdown.
 *
 * @param text - Assistant response text, potentially markdown formatted.
 * @returns Markdown-rendered content with chat-friendly styles.
 */
function AssistantMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[11px]">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded bg-background/70 p-2 font-mono text-[11px]">
            {children}
          </pre>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

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
                {message.role === "assistant" ? (
                  <AssistantMarkdown text={message.text} />
                ) : (
                  message.text
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
