export const mustBeDefined = <T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): T => {
  if (value == null) {
    throw new Error(message);
  }

  return value;
};

export const mustGetAt = <T>(
  values: readonly T[],
  index: number,
  message = `Expected item at index ${index}`,
): T => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
};
