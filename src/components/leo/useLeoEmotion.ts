/**
 * useLeoEmotion — Polaris Leo AI Assistant
 *
 * Drives Leo's expression based on the current AI interaction lifecycle
 * (idle -> listening -> thinking -> speaking) plus an optional semantic
 * trigger (greeting, warning, celebrating, etc.) per the Emotional Engine
 * spec.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LeoBehaviorState,
  LeoEmotionTrigger,
  LeoExpression,
  LEO_EMOTION_MAP,
} from "./leo.types";

interface UseLeoEmotionOptions {
  /** Lifecycle state coming from your chat/voice pipeline */
  behaviorState: LeoBehaviorState;
  /** Optional semantic trigger for the current AI turn */
  trigger?: LeoEmotionTrigger;
  /** How long an "excited"/"laughing"/"proud" reaction should hold before
   * settling back to neutral/listening, in ms. Default 2200ms. */
  reactionHoldMs?: number;
}

interface UseLeoEmotionResult {
  expression: LeoExpression;
  isBlinking: boolean;
}

/**
 * Lifecycle states (idle, listening, thinking, speaking) map directly to
 * an expression. Semantic triggers (greeting, celebrating, warning, joke,
 * encouraging) are short-lived overlays that play on top of the lifecycle
 * state and then decay back to it.
 */
const LIFECYCLE_EXPRESSION: Partial<Record<LeoBehaviorState, LeoExpression>> = {
  idle: "neutral",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  happy: "happy",
  congratulating: "proud",
  confused: "curious",
  waiting: "neutral",
};

export function useLeoEmotion({
  behaviorState,
  trigger,
  reactionHoldMs = 2200,
}: UseLeoEmotionOptions): UseLeoEmotionResult {
  const [overlay, setOverlay] = useState<LeoExpression | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Semantic trigger overlay (e.g. a "celebrating" turn briefly shows
  // "excited" even if the lifecycle state is "speaking").
  useEffect(() => {
    if (!trigger) return;
    const mapped = LEO_EMOTION_MAP[trigger];
    setOverlay(mapped);

    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlay(null), reactionHoldMs);

    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, [trigger, reactionHoldMs]);

  const expression = useMemo<LeoExpression>(() => {
    if (overlay) return overlay;
    return LIFECYCLE_EXPRESSION[behaviorState] ?? "neutral";
  }, [overlay, behaviorState]);

  // Idle blink loop — random interval between 3–6s, per spec.
  const [isBlinking, setIsBlinking] = useState(false);
  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 3000;
      timeout = setTimeout(() => {
        if (!active) return;
        setIsBlinking(true);
        setTimeout(() => active && setIsBlinking(false), 150);
        scheduleBlink();
      }, delay);
    };

    scheduleBlink();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  return { expression, isBlinking };
}
