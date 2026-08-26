export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      permits: {
        Row: {
          contact_email: string | null
          created_at: string
          created_by: string | null
          dma_phase: string | null
          document_url: string | null
          email_sent_at: string | null
          email_sent_by: string | null
          expiry_alert_sent_at: string | null
          expiry_date: string | null
          holder_name: string | null
          id: string
          issue_date: string | null
          issuing_authority: string | null
          jls_quotation_number: string | null
          license_no: string | null
          notes: string | null
          permit_number: string | null
          permit_type: Database["public"]["Enums"]["permit_type"]
          preferred_inspection_date: string | null
          requested_by: string | null
          sharepoint_item_id: string | null
          sharepoint_synced_at: string | null
          status: Database["public"]["Enums"]["permit_status"]
          updated_at: string
          yacht_id: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          dma_phase?: string | null
          document_url?: string | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          expiry_alert_sent_at?: string | null
          expiry_date?: string | null
          holder_name?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          jls_quotation_number?: string | null
          license_no?: string | null
          notes?: string | null
          permit_number?: string | null
          permit_type: Database["public"]["Enums"]["permit_type"]
          preferred_inspection_date?: string | null
          requested_by?: string | null
          sharepoint_item_id?: string | null
          sharepoint_synced_at?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          updated_at?: string
          yacht_id?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          dma_phase?: string | null
          document_url?: string | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          expiry_alert_sent_at?: string | null
          expiry_date?: string | null
          holder_name?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          jls_quotation_number?: string | null
          license_no?: string | null
          notes?: string | null
          permit_number?: string | null
          permit_type?: Database["public"]["Enums"]["permit_type"]
          preferred_inspection_date?: string | null
          requested_by?: string | null
          sharepoint_item_id?: string | null
          sharepoint_synced_at?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          updated_at?: string
          yacht_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permits_yacht_id_fkey"
            columns: ["yacht_id"]
            isOneToOne: false
            referencedRelation: "yachts"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_arrival_form_confirmations: {
        Row: {
          confirmed: boolean
          confirmed_at: string | null
          field_key: string
          pre_arrival_form_id: string
        }
        Insert: {
          confirmed?: boolean
          confirmed_at?: string | null
          field_key: string
          pre_arrival_form_id: string
        }
        Update: {
          confirmed?: boolean
          confirmed_at?: string | null
          field_key?: string
          pre_arrival_form_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_arrival_form_confirmations_pre_arrival_form_id_fkey"
            columns: ["pre_arrival_form_id"]
            isOneToOne: false
            referencedRelation: "pre_arrival_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_arrival_forms: {
        Row: {
          arrival_date: string | null
          arrival_emirate: string | null
          arrival_port: string | null
          beam_m: number | null
          captain_email: string | null
          captain_name: string | null
          chief_engineer_email: string | null
          chief_engineer_name: string | null
          created_at: string
          dead_weight_tn: number | null
          displacement_tn: number | null
          engine_serial_no: string | null
          fuel_type: string | null
          generators_kw: number | null
          hull_id_number: string | null
          id: string
          last_port_of_call: string | null
          main_propulsion_kw: number | null
          max_air_draft_m: number | null
          max_forward_draft_m: number | null
          max_stern_draft_m: number | null
          purser_email: string | null
          purser_name: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          summer_dead_weight_tn: number | null
          yacht_id: string
        }
        Insert: {
          arrival_date?: string | null
          arrival_emirate?: string | null
          arrival_port?: string | null
          beam_m?: number | null
          captain_email?: string | null
          captain_name?: string | null
          chief_engineer_email?: string | null
          chief_engineer_name?: string | null
          created_at?: string
          dead_weight_tn?: number | null
          displacement_tn?: number | null
          engine_serial_no?: string | null
          fuel_type?: string | null
          generators_kw?: number | null
          hull_id_number?: string | null
          id?: string
          last_port_of_call?: string | null
          main_propulsion_kw?: number | null
          max_air_draft_m?: number | null
          max_forward_draft_m?: number | null
          max_stern_draft_m?: number | null
          purser_email?: string | null
          purser_name?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          summer_dead_weight_tn?: number | null
          yacht_id: string
        }
        Update: {
          arrival_date?: string | null
          arrival_emirate?: string | null
          arrival_port?: string | null
          beam_m?: number | null
          captain_email?: string | null
          captain_name?: string | null
          chief_engineer_email?: string | null
          chief_engineer_name?: string | null
          created_at?: string
          dead_weight_tn?: number | null
          displacement_tn?: number | null
          engine_serial_no?: string | null
          fuel_type?: string | null
          generators_kw?: number | null
          hull_id_number?: string | null
          id?: string
          last_port_of_call?: string | null
          main_propulsion_kw?: number | null
          max_air_draft_m?: number | null
          max_forward_draft_m?: number | null
          max_stern_draft_m?: number | null
          purser_email?: string | null
          purser_name?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          summer_dead_weight_tn?: number | null
          yacht_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_arrival_forms_yacht_id_fkey"
            columns: ["yacht_id"]
            isOneToOne: false
            referencedRelation: "yachts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      yacht_tenders: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          fuel_type: string | null
          id: string
          id_serial_no: string | null
          length_m: number | null
          manufacturer_model: string | null
          yacht_id: string
          year_of_build: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          fuel_type?: string | null
          id?: string
          id_serial_no?: string | null
          length_m?: number | null
          manufacturer_model?: string | null
          yacht_id: string
          year_of_build?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          fuel_type?: string | null
          id?: string
          id_serial_no?: string | null
          length_m?: number | null
          manufacturer_model?: string | null
          yacht_id?: string
          year_of_build?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "yacht_tenders_yacht_id_fkey"
            columns: ["yacht_id"]
            isOneToOne: false
            referencedRelation: "yachts"
            referencedColumns: ["id"]
          },
        ]
      }
      yachts: {
        Row: {
          air_draft_m: number | null
          archive: boolean
          berth: string | null
          billing_address: string | null
          breadth_m: number | null
          builders_name: string | null
          built_place: string | null
          built_year: number | null
          company_name: string | null
          contact_no: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          cruising_permit_expiry: string | null
          departed_date: string | null
          dma_permit_phase_status: string | null
          draught_m: number | null
          email_address: string | null
          engine: string | null
          equipment_model: string | null
          eta: string | null
          etd: string | null
          flag: string | null
          frequency: string | null
          gross_tonnage: number | null
          id: string
          imo_no: string | null
          length_overall_m: number | null
          link_to_folder: string | null
          location: string | null
          manufacturer: string | null
          max_crew: number | null
          max_guests: number | null
          mmsi: string | null
          net_tonnage: number | null
          official_no: string | null
          owners_address: string | null
          owners_name: string | null
          owners_nationality: string | null
          planner_id: string | null
          port_of_registry: string | null
          radio_call_sign: string | null
          serial_no: string | null
          status: string | null
          updated_at: string
          vessel_image: string | null
          vessel_name: string
          vessel_type: string | null
        }
        Insert: {
          air_draft_m?: number | null
          archive?: boolean
          berth?: string | null
          billing_address?: string | null
          breadth_m?: number | null
          builders_name?: string | null
          built_place?: string | null
          built_year?: number | null
          company_name?: string | null
          contact_no?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          cruising_permit_expiry?: string | null
          departed_date?: string | null
          dma_permit_phase_status?: string | null
          draught_m?: number | null
          email_address?: string | null
          engine?: string | null
          equipment_model?: string | null
          eta?: string | null
          etd?: string | null
          flag?: string | null
          frequency?: string | null
          gross_tonnage?: number | null
          id?: string
          imo_no?: string | null
          length_overall_m?: number | null
          link_to_folder?: string | null
          location?: string | null
          manufacturer?: string | null
          max_crew?: number | null
          max_guests?: number | null
          mmsi?: string | null
          net_tonnage?: number | null
          official_no?: string | null
          owners_address?: string | null
          owners_name?: string | null
          owners_nationality?: string | null
          planner_id?: string | null
          port_of_registry?: string | null
          radio_call_sign?: string | null
          serial_no?: string | null
          status?: string | null
          updated_at?: string
          vessel_image?: string | null
          vessel_name: string
          vessel_type?: string | null
        }
        Update: {
          air_draft_m?: number | null
          archive?: boolean
          berth?: string | null
          billing_address?: string | null
          breadth_m?: number | null
          builders_name?: string | null
          built_place?: string | null
          built_year?: number | null
          company_name?: string | null
          contact_no?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          cruising_permit_expiry?: string | null
          departed_date?: string | null
          dma_permit_phase_status?: string | null
          draught_m?: number | null
          email_address?: string | null
          engine?: string | null
          equipment_model?: string | null
          eta?: string | null
          etd?: string | null
          flag?: string | null
          frequency?: string | null
          gross_tonnage?: number | null
          id?: string
          imo_no?: string | null
          length_overall_m?: number | null
          link_to_folder?: string | null
          location?: string | null
          manufacturer?: string | null
          max_crew?: number | null
          max_guests?: number | null
          mmsi?: string | null
          net_tonnage?: number | null
          official_no?: string | null
          owners_address?: string | null
          owners_name?: string | null
          owners_nationality?: string | null
          planner_id?: string | null
          port_of_registry?: string | null
          radio_call_sign?: string | null
          serial_no?: string | null
          status?: string | null
          updated_at?: string
          vessel_image?: string | null
          vessel_name?: string
          vessel_type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_prearrival_prefill: {
        Row: {
          air_draft_m: number | null
          billing_address: string | null
          breadth_m: number | null
          company_name: string | null
          contact_no: string | null
          contact_person: string | null
          draught_m: number | null
          email_address: string | null
          engine: string | null
          equipment_model: string | null
          flag: string | null
          frequency: string | null
          gross_tonnage: number | null
          imo_no: string | null
          length_overall_m: number | null
          manufacturer: string | null
          max_crew: number | null
          max_guests: number | null
          mmsi: string | null
          net_tonnage: number | null
          official_no: string | null
          owners_address: string | null
          owners_name: string | null
          owners_nationality: string | null
          port_of_registry: string | null
          radio_call_sign: string | null
          serial_no: string | null
          vessel_name: string | null
          vessel_type: string | null
          yacht_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
      permit_status: "pending" | "active" | "expired" | "cancelled"
      permit_type:
        | "exit_entry"
        | "sanitation"
        | "cruising_mothership"
        | "cruising_tenders"
        | "gate_pass"
        | "tdra"
        | "navigation_license"
        | "dma"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "user"],
      permit_status: ["pending", "active", "expired", "cancelled"],
      permit_type: [
        "exit_entry",
        "sanitation",
        "cruising_mothership",
        "cruising_tenders",
        "gate_pass",
        "tdra",
        "navigation_license",
        "dma",
      ],
    },
  },
} as const
