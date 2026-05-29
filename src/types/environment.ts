export interface Environment {
  name: string;
  projectId: string;
  anonKey: string;
  /** Empty = allow all */
  allowedDomains: string[];
}
