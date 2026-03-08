import { useEffect, useState } from "react";

const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BRL_DECIMAL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toFiniteNumber(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

export function formatMoneyBRL(value: number | null | undefined): string {
  return BRL_CURRENCY_FORMATTER.format(toFiniteNumber(value));
}

export function parseMoneyBRL(rawInput: string): number {
  const raw = String(rawInput || "").trim();
  if (!raw) return 0;

  const sign = raw.includes("-") ? -1 : 1;
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;

  const decimalSepPos = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  let intPart = cleaned;
  let fracPart = "";
  if (decimalSepPos >= 0) {
    intPart = cleaned.slice(0, decimalSepPos);
    fracPart = cleaned.slice(decimalSepPos + 1);
  }

  const intDigits = intPart.replace(/[^\d]/g, "");
  const fracDigits = fracPart.replace(/[^\d]/g, "").slice(0, 2);
  const normalized = fracDigits ? `${intDigits || "0"}.${fracDigits}` : intDigits || "0";
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;

  return sign * parsed;
}

type MoneyInputProps = {
  value: number | null | undefined;
  onChange: (next: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
};

export function MoneyInput(props: MoneyInputProps) {
  const { value, onChange, className, disabled, placeholder, min } = props;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(formatMoneyBRL(value));

  useEffect(() => {
    if (!focused) {
      setDraft(formatMoneyBRL(value));
    }
  }, [value, focused]);

  function applyMin(next: number): number {
    if (typeof min === "number" && Number.isFinite(min) && next < min) return min;
    return next;
  }

  function handleChange(nextRaw: string) {
    setDraft(nextRaw);
    onChange(applyMin(parseMoneyBRL(nextRaw)));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => {
        setFocused(true);
        setDraft(BRL_DECIMAL_FORMATTER.format(toFiniteNumber(value)));
      }}
      onBlur={() => {
        const parsed = applyMin(parseMoneyBRL(draft));
        onChange(parsed);
        setFocused(false);
        setDraft(formatMoneyBRL(parsed));
      }}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
