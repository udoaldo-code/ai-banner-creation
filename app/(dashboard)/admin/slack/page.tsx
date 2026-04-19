import { redirect } from "next/navigation";
import { getSession, canAdmin } from "@/lib/auth";
import { isSlackConfigured } from "@/lib/slack";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SlackConnectionTester } from "@/components/admin/SlackConnectionTester";
import type { Role } from "@/types";

export default async function SlackSettingsPage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canAdmin(session.user.role as Role)) redirect("/");

  const configured = isSlackConfigured();

  const envVars = [
    {
      name: "SLACK_BOT_TOKEN",
      set: !!process.env.SLACK_BOT_TOKEN,
      description: "Bot token (xoxb-…). Required for posting messages.",
      scope: "chat:write, chat:write.public, im:write, users:read, views:open",
    },
    {
      name: "SLACK_SIGNING_SECRET",
      set: !!process.env.SLACK_SIGNING_SECRET,
      description: "Request signing secret. Required to verify interactive callbacks.",
    },
    {
      name: "SLACK_NOTIFY_CHANNEL",
      set: !!process.env.SLACK_NOTIFY_CHANNEL,
      description: "Channel for request submission + decision alerts.",
      default: "#banner-requests",
    },
    {
      name: "SLACK_APPROVER_CHANNEL",
      set: !!process.env.SLACK_APPROVER_CHANNEL,
      description: "Channel where interactive approval messages are posted.",
      default: "#banner-approvals",
    },
    {
      name: "NEXT_PUBLIC_APP_URL",
      set: !!process.env.NEXT_PUBLIC_APP_URL,
      description: "Full public URL of the web app — used in deep links.",
      default: "http://localhost:3000",
    },
  ];

  return (
    <div>
      <Header
        title="Slack Integration"
        description="Configure and test the Slack notification integration"
      />

      <div className="space-y-6 max-w-2xl">
        {/* Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${configured ? "bg-green-500" : "bg-red-400"}`}
              />
              <h2 className="text-sm font-semibold text-gray-900">
                {configured ? "Slack is configured" : "Slack is not configured"}
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {configured
                ? "Bot token and signing secret are set. Use the connection tester to verify the token is valid."
                : "Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in your environment to enable Slack notifications."}
            </p>
            {configured && <SlackConnectionTester />}
          </CardContent>
        </Card>

        {/* Environment variables */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Environment Variables</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {envVars.map((v) => (
                <div key={v.name} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 text-xs font-bold ${v.set ? "text-green-600" : "text-gray-400"}`}
                  >
                    {v.set ? "✓" : "○"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-medium text-gray-800">{v.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{v.description}</p>
                    {"scope" in v && (
                      <p className="text-xs text-blue-600 mt-0.5 font-mono">
                        Scopes: {v.scope}
                      </p>
                    )}
                    {"default" in v && !v.set && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Default: <span className="font-mono">{v.default}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Slack App Configuration</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Interactivity Request URL
              </p>
              <p className="text-sm font-mono bg-gray-50 rounded px-3 py-2 text-gray-700 border border-gray-200">
                {process.env.NEXT_PUBLIC_APP_URL ?? "https://your-domain.com"}/api/webhooks/slack
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Set this in your Slack app under{" "}
                <span className="font-mono">Interactivity &amp; Shortcuts → Request URL</span>.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Required Bot OAuth Scopes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "chat:write",
                  "chat:write.public",
                  "im:write",
                  "users:read",
                  "users:read.email",
                  "views:open",
                ].map((scope) => (
                  <span
                    key={scope}
                    className="text-xs font-mono bg-blue-50 text-blue-700 rounded px-2 py-0.5"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Notification Flows
              </p>
              <div className="space-y-1.5 text-xs text-gray-600">
                {[
                  ["Request submitted", "→ SLACK_NOTIFY_CHANNEL"],
                  ["Banners ready for review", "→ SLACK_APPROVER_CHANNEL (with action buttons)"],
                  ["Approve from Slack", "→ direct action, updates message"],
                  ["Reject / Revision from Slack", "→ opens notes modal, then updates message"],
                  ["Decision notification to requester", "→ SLACK_NOTIFY_CHANNEL (DM: TODO)"],
                ].map(([flow, destination]) => (
                  <div key={flow} className="flex gap-2">
                    <span className="text-gray-400 shrink-0">•</span>
                    <span>
                      <span className="font-medium">{flow}</span>{" "}
                      <span className="text-gray-400">{destination}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
