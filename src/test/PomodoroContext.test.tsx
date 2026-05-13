import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { PomodoroProvider, usePomodoro } from "@/components/aura/PomodoroContext";
import type { ReactNode } from "react";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }), update: () => ({ eq: () => Promise.resolve({}) }) }) },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <PomodoroProvider>{children}</PomodoroProvider>
);

describe("usePomodoro", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in focus mode with 25 minutes on the clock", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    expect(result.current.running).toBe(false);
    expect(result.current.mode).toBe("focus");
    expect(result.current.secondsLeft).toBe(25 * 60);
  });

  it("starts the timer when start() is called", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    act(() => {
      result.current.start();
    });

    expect(result.current.running).toBe(true);
  });

  it("pauses the timer when pause() is called", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.pause();
    });

    expect(result.current.running).toBe(false);
  });

  it("counts down seconds while running", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.secondsLeft).toBe(25 * 60 - 3);
  });

  it("does not count down while paused", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });
    const initial = result.current.secondsLeft;

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.secondsLeft).toBe(initial);
  });

  it("resets to focus mode and full time when reset() is called", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.running).toBe(false);
    expect(result.current.mode).toBe("focus");
    expect(result.current.secondsLeft).toBe(25 * 60);
  });

  it("character state is 'working' during a focus session", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    act(() => {
      result.current.start();
    });

    expect(result.current.characterState).toBe("working");
  });

  it("character state is 'idle' when paused and recently active", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    expect(result.current.characterState).toBe("idle");
  });

  it("switches to break mode after focus completes", () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });

    expect(result.current.mode).toBe("break");
    expect(result.current.secondsLeft).toBe(5 * 60);
  });

  it("calls onFocusComplete when the focus session ends", () => {
    const onFocusComplete = vi.fn();
    const wrapperWithCb = ({ children }: { children: ReactNode }) => (
      <PomodoroProvider onFocusComplete={onFocusComplete}>{children}</PomodoroProvider>
    );

    const { result } = renderHook(() => usePomodoro(), { wrapper: wrapperWithCb });

    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });

    expect(onFocusComplete).toHaveBeenCalledOnce();
  });

  it("throws when used outside PomodoroProvider", () => {
    // suppress console.error for this test
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => usePomodoro())).toThrow(
      "usePomodoro outside provider",
    );
    vi.restoreAllMocks();
  });
});
