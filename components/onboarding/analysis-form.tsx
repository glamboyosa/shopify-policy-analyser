"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AnalysisFormProps = {
  storeUrl: string;
  storeName: string;
  storeId: string | null;
  isSubmitting: boolean;
  onStoreUrlChange: (value: string) => void;
  onStoreNameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function AnalysisForm({
  storeUrl,
  storeName,
  storeId,
  isSubmitting,
  onStoreUrlChange,
  onStoreNameChange,
  onSubmit,
}: AnalysisFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Store Policy Analyzer</CardTitle>
        <CardDescription>
          Enter a Shopify store URL to run discovery, extraction, and onboarding
          insights. Project repo:{" "}
          <a
            className="text-primary underline"
            href="https://github.com/glamboyosa/shopify-policy-analyser"
            target="_blank"
            rel="noreferrer noopener"
          >
            github.com/glamboyosa/shopify-policy-analyser
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Input
            value={storeUrl}
            onChange={(event) => onStoreUrlChange(event.target.value)}
            placeholder="https://example.com"
            className="md:col-span-2"
            required
          />
          <Input
            value={storeName}
            onChange={(event) => onStoreNameChange(event.target.value)}
            placeholder="Store name (optional)"
          />
          <div className="md:col-span-3 flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Analyzing..." : "Analyze Store"}
            </Button>
            {storeId ? <Badge variant="outline">Store ID: {storeId}</Badge> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
