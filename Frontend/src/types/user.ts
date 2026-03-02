
export type UserRole = "public" | "responder";

export interface UserProfile {
  role: UserRole;
  displayName?: string;
  photoURL?: string;
}