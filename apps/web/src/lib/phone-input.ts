export function formatPhone(value: string) {
  const rawDigits = value.replace(/\D/g, "");
  const localDigits =
    rawDigits.startsWith("7") || rawDigits.startsWith("8")
      ? rawDigits.slice(1, 11)
      : rawDigits.slice(0, 10);

  if (rawDigits === "7" || rawDigits === "8") return "+7";
  if (localDigits.length === 0) return "";

  const areaCode = localDigits.slice(0, 3);
  const firstPart = localDigits.slice(3, 6);
  const secondPart = localDigits.slice(6, 8);
  const thirdPart = localDigits.slice(8, 10);
  let formatted = `+7 (${areaCode}`;

  if (areaCode.length === 3) formatted += ")";
  if (firstPart) formatted += ` ${firstPart}`;
  if (secondPart) formatted += `-${secondPart}`;
  if (thirdPart) formatted += `-${thirdPart}`;

  return formatted;
}

export function getLocalPhoneDigits(value: string) {
  const rawDigits = value.replace(/\D/g, "");
  return rawDigits.startsWith("7") || rawDigits.startsWith("8") ? rawDigits.slice(1) : rawDigits;
}

function getCursorAfterDigits(value: string, digitsCount: number) {
  if (digitsCount === 0) return 0;

  let seenDigits = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) {
      seenDigits += 1;
      if (seenDigits === digitsCount) return index + 1;
    }
  }

  return value.length;
}

export function removePhoneDigitBeforeCursor(value: string, cursor: number) {
  let digitIndex = cursor - 1;

  while (digitIndex >= 0 && !/\d/.test(value[digitIndex])) {
    digitIndex -= 1;
  }

  if (digitIndex < 0) return null;

  const digitsBeforeRemoved = (value.slice(0, digitIndex).match(/\d/g) ?? []).length;
  const nextValue = formatPhone(`${value.slice(0, digitIndex)}${value.slice(digitIndex + 1)}`);

  return {
    value: nextValue,
    cursor: getCursorAfterDigits(nextValue, digitsBeforeRemoved),
  };
}
