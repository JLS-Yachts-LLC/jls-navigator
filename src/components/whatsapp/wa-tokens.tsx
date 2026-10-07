/**
 * Personal fields for template values — Name, First name, Yacht name.
 *
 * Wrap the form in <TokenScope>, show a <TokenBar>, and use <TokenInput> for the
 * value boxes. A chip can be dragged into any box (dropped where the cursor
 * lands), or clicked to insert into the box last typed in, at the cursor.
 * The token ({{vessel}} etc.) is filled in per recipient when the message sends.
 */
import { createContext, useContext, useRef, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PERSONAL_TOKENS } from "@/lib/whatsapp/shared";

const DRAG_TYPE = "text/plain";

interface Target {
  el: HTMLInputElement;
  value: string;
  onChange: (v: string) => void;
}

const Ctx = createContext<{ last: React.MutableRefObject<Target | null> } | null>(null);

export function TokenScope({ children }: { children: ReactNode }) {
  const last = useRef<Target | null>(null);
  return <Ctx.Provider value={{ last }}>{children}</Ctx.Provider>;
}

/** Insert `text` into a target at its cursor (or the end), then put the cursor after it. */
function insertAt(t: Target, text: string) {
  const start = t.el.selectionStart ?? t.value.length;
  const end = t.el.selectionEnd ?? start;
  const next = t.value.slice(0, start) + text + t.value.slice(end);
  t.onChange(next);
  requestAnimationFrame(() => {
    t.el.focus();
    const caret = start + text.length;
    t.el.setSelectionRange(caret, caret);
  });
}

export function TokenBar({ className, hint = true }: { className?: string; hint?: boolean }) {
  const ctx = useContext(Ctx);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {hint && <span className="text-[11px] text-muted-foreground">Drag or click to insert:</span>}
      {PERSONAL_TOKENS.map((t) => (
        <button
          key={t.token}
          type="button"
          draggable
          title={`Inserts ${t.token} — becomes each person's ${t.label.toLowerCase()}, e.g. "${t.sample}"`}
          // No preventDefault on mousedown: it also cancels the browser's drag
          // (dragstart never fires), which is what broke drag-and-drop. A click
          // still lands in the right box — the last-used box is remembered, and
          // insertAt() refocuses it at the caret it kept.
          onClick={() => {
            const target = ctx?.last.current;
            if (target && target.el.isConnected) insertAt(target, t.token);
            else toast.info("Click into a value box first, or drag the field onto it.");
          }}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, t.token);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="inline-flex cursor-grab items-center gap-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 py-0.5 pl-1 pr-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 active:cursor-grabbing dark:text-emerald-300"
        >
          <GripVertical className="h-3 w-3 opacity-60" />
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** An Input that personal-field chips can be dropped or clicked into. */
export function TokenInput({ value, onChange, className, ...rest }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
}) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLInputElement>(null);
  const remember = () => {
    if (ref.current && ctx) ctx.last.current = { el: ref.current, value, onChange };
  };
  return (
    <Input
      {...rest}
      ref={ref}
      value={value}
      className={className}
      onFocus={remember}
      onSelect={remember}
      onChange={(e) => {
        onChange(e.target.value);
        if (ref.current && ctx) ctx.last.current = { el: ref.current, value: e.target.value, onChange };
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
      }}
      onDrop={(e) => {
        const text = e.dataTransfer.getData(DRAG_TYPE);
        if (!text || !ref.current) return;
        e.preventDefault();
        // Drop where the pointer is: place the caret there first, where the browser supports it.
        const el = ref.current;
        const wasFocused = document.activeElement === el;
        el.focus();
        // Only trust the position if the browser resolved it inside this box;
        // otherwise it goes where the cursor already was, or at the end.
        const cp = (document as any).caretPositionFromPoint?.(e.clientX, e.clientY);
        if (cp && cp.offsetNode === el && typeof cp.offset === "number") el.setSelectionRange(cp.offset, cp.offset);
        else if (!wasFocused) el.setSelectionRange(value.length, value.length);
        insertAt({ el, value, onChange }, text);
      }}
    />
  );
}
