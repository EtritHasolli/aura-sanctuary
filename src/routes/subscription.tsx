import { createFileRoute } from "@tanstack/react-router";
import { Crown } from "lucide-react";
import {
  SubscriptionPanel,
  SubscriptionStatusBadges,
} from "@/components/aura/SubscriptionPanel";

export const Route = createFileRoute("/subscription")({
  head: () => ({ meta: [{ title: "Subscription — Aura" }] }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Crown className="text-primary shrink-0" size={24} />
          <div className="min-w-0">
            <h1
              className="text-2xl text-primary"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              SUBSCRIPTION
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose your plan to unlock larger fellowships and a monthly moonshard stipend.
            </p>
          </div>
        </div>
        <SubscriptionStatusBadges />
      </div>

      <SubscriptionPanel />
    </div>
  );
}
