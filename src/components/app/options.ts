export interface Option {
  id: string;
  title: string;
  ref?: string;
}

export interface EntityOptions {
  projects: Option[];
  goals: Option[];
  skills: Option[];
  lifeAreas: (Option & { color: string })[];
  /** Today in the user's timezone (YYYY-MM-DD). */
  today: string;
  /** AI provider label when configured, else null. */
  ai: string | null;
}
