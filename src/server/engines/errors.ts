/** Errors whose message is safe to show to the user. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "invalid" | "conflict" | "forbidden" = "invalid",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function notFound(what: string): never {
  throw new DomainError(`${what} not found`, "not_found");
}
