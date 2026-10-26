"use client";

import type { KeyboardEvent } from "react";

type QuantityInputProps = {
  quantity: number;
  onChange: (quantity: number) => void;
  className?: string;
};

export function QuantityInput({ quantity, onChange, className = "" }: QuantityInputProps) {
  const commitValue = (rawValue: string, input: HTMLInputElement) => {
    const nextQuantity = Number(rawValue.trim());

    if (Number.isSafeInteger(nextQuantity) && nextQuantity > 0) {
      onChange(nextQuantity);
      return;
    }

    input.value = String(quantity);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  return (
    <input
      key={quantity}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      defaultValue={quantity}
      onFocus={(event) => event.currentTarget.select()}
      onInput={(event) => {
        event.currentTarget.style.width = `${Math.max(event.currentTarget.value.length, 1)}ch`;
      }}
      onBlur={(event) => commitValue(event.currentTarget.value, event.currentTarget)}
      onKeyDown={handleKeyDown}
      style={{ width: `${Math.max(String(quantity).length, 1)}ch` }}
      className={className}
    />
  );
}
