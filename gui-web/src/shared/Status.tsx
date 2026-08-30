export function Status({ value }: { value: string }) {
  return (
    <span
      className={`wb-status ${value.toLowerCase()}`}
      data-testid={`status-${value.toLowerCase()}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
