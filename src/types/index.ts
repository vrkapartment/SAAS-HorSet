export type UserRole = "super_admin" | "admin" | "staff" | "tenant"

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  tfa_enabled: boolean
  created_at: string
}
