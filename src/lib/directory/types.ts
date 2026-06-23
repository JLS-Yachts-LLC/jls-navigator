// Team Directory shared types — mirror the schema in
// supabase/migrations/20260623000010_team_directory.sql.

export type Department = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  icon: string | null;
  display_order: number | null;
  visible_to_vessel_users: boolean;
  is_active: boolean;
};

export type StaffProfile = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  position: string;
  department_id: string | null;
  office_location: string | null;
  profile_photo_url: string | null;
  direct_mobile: string | null;
  office_number: string | null;
  whatsapp_number: string | null;
  email: string;
  teams_upn: string | null;
  languages: string[] | null;
  areas_of_expertise: string[] | null;
  office_hours: string | null;
  emergency_available: boolean;
  emergency_hours: string | null;
  is_emergency_contact: boolean;
  display_order: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceRoute = {
  id: string;
  service_keyword: string;
  department_id: string | null;
  primary_contact_id: string | null;
  secondary_contact_id: string | null;
  emergency_contact_id: string | null;
  notes: string | null;
};

// Priority order for the Emergency / Quick Reaction Force list (§10.2).
export const QRF_PRIORITY = [
  "Managing Director",
  "CEO",
  "Operations Manager",
  "Agency Manager",
  "Emergency Duty Officer",
] as const;
