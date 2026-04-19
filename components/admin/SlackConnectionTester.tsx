"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface TestResult {
  ok: boolean;
  botName?: string;
  teamName?: string;
  error?: string;
}

export function SlackConnectionTester() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function test() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/slack", { method: "POST" });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <Button size="sm" variant="secondary" onClick={test} loading={loading}>
        Test Connection
      </Button>
      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.ok ? (
            <p>
              Connected as <span className="font-medium">{result.botName}</span> in workspace{" "}
              <span className="font-medium">{result.teamName}</span>
            </p>
          ) : (
            <p>
              Connection failed: <span className="font-medium">{result.error}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
