import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { useStudyCallContext } from "@/components/aura/StudyCallContext";

/**
 * Deep link for study-call invites: /call?room=ABC123. Push notifications and the
 * notification bell point here; it joins the call and hands off to the Sanctuary.
 */
export const Route = createFileRoute("/call")({
  head: () => ({ meta: [{ title: "Joining call — Aura" }] }),
  validateSearch: z.object({
    room: z
      .string()
      .regex(/^[A-Za-z0-9]{4,12}$/)
      .optional(),
    from: z.string().optional(),
  }),
  component: CallDeepLink,
});

function CallDeepLink() {
  const { room } = Route.useSearch();
  const { joinCall } = useStudyCallContext();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (room) void joinCall(room);
    void navigate({ to: "/", replace: true });
  }, [room, joinCall, navigate]);

  return null;
}
