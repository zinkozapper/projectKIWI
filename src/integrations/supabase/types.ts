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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_admin: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      food: {
        Row: {
          added_by: string | null
          calcium_mg: number
          calories_kcal: number
          carbohydrate_g: number
          choline_mg: number
          cook_ratio: number | null
          copper_mg: number
          created_at: string
          emoji: string
          factor: number
          fat_g: number
          fdc_id: number | null
          fiber_g: number
          flavor_profile: string[]
          folate_b9_mg: number
          food_category_id: number | null
          food_description: string
          food_group: string | null
          food_id: number
          food_name: string
          food_picture: string | null
          iron_mg: number
          magnesium_mg: number
          needs_review: boolean
          niacin_b3_mg: number
          nutrition: Json
          omega3_ala_g: number
          omega6_g: number
          pairs: number[]
          phosphorus_mg: number
          potassium_mg: number
          price: number
          protein_g: number
          raw_fdc_id: number | null
          review_notes: string | null
          riboflavin_b2_mg: number
          selenium_mg: number
          serving_size: number
          sodium_mg: number
          source: string | null
          thiamin_b1_mg: number
          unit: string
          vitamin_a_mg: number
          vitamin_b12_mg: number
          vitamin_b6_mg: number
          vitamin_c_mg: number
          vitamin_e_mg: number
          vitamin_k_mg: number
          zinc_mg: number
        }
        Insert: {
          added_by?: string | null
          calcium_mg?: number
          calories_kcal?: number
          carbohydrate_g?: number
          choline_mg?: number
          cook_ratio?: number | null
          copper_mg?: number
          created_at?: string
          emoji?: string
          factor?: number
          fat_g?: number
          fdc_id?: number | null
          fiber_g?: number
          flavor_profile?: string[]
          folate_b9_mg?: number
          food_category_id?: number | null
          food_description?: string
          food_group?: string | null
          food_id?: number
          food_name: string
          food_picture?: string | null
          iron_mg?: number
          magnesium_mg?: number
          needs_review?: boolean
          niacin_b3_mg?: number
          nutrition?: Json
          omega3_ala_g?: number
          omega6_g?: number
          pairs?: number[]
          phosphorus_mg?: number
          potassium_mg?: number
          price?: number
          protein_g?: number
          raw_fdc_id?: number | null
          review_notes?: string | null
          riboflavin_b2_mg?: number
          selenium_mg?: number
          serving_size?: number
          sodium_mg?: number
          source?: string | null
          thiamin_b1_mg?: number
          unit?: string
          vitamin_a_mg?: number
          vitamin_b12_mg?: number
          vitamin_b6_mg?: number
          vitamin_c_mg?: number
          vitamin_e_mg?: number
          vitamin_k_mg?: number
          zinc_mg?: number
        }
        Update: {
          added_by?: string | null
          calcium_mg?: number
          calories_kcal?: number
          carbohydrate_g?: number
          choline_mg?: number
          cook_ratio?: number | null
          copper_mg?: number
          created_at?: string
          emoji?: string
          factor?: number
          fat_g?: number
          fdc_id?: number | null
          fiber_g?: number
          flavor_profile?: string[]
          folate_b9_mg?: number
          food_category_id?: number | null
          food_description?: string
          food_group?: string | null
          food_id?: number
          food_name?: string
          food_picture?: string | null
          iron_mg?: number
          magnesium_mg?: number
          needs_review?: boolean
          niacin_b3_mg?: number
          nutrition?: Json
          omega3_ala_g?: number
          omega6_g?: number
          pairs?: number[]
          phosphorus_mg?: number
          potassium_mg?: number
          price?: number
          protein_g?: number
          raw_fdc_id?: number | null
          review_notes?: string | null
          riboflavin_b2_mg?: number
          selenium_mg?: number
          serving_size?: number
          sodium_mg?: number
          source?: string | null
          thiamin_b1_mg?: number
          unit?: string
          vitamin_a_mg?: number
          vitamin_b12_mg?: number
          vitamin_b6_mg?: number
          vitamin_c_mg?: number
          vitamin_e_mg?: number
          vitamin_k_mg?: number
          zinc_mg?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_food_category_id_fkey"
            columns: ["food_category_id"]
            isOneToOne: false
            referencedRelation: "food_category"
            referencedColumns: ["food_category_id"]
          },
        ]
      }
      food_category: {
        Row: {
          category_description: string
          category_serving_modifier: number
          food_category_id: number
        }
        Insert: {
          category_description: string
          category_serving_modifier?: number
          food_category_id?: number
        }
        Update: {
          category_description?: string
          category_serving_modifier?: number
          food_category_id?: number
        }
        Relationships: []
      }
      food_import_request: {
        Row: {
          admin_note: string | null
          chosen_fdc_id: number | null
          created_at: string
          food_id: number | null
          how_bought: string | null
          kind: string
          notes: string | null
          query: string
          raw_fdc_id: number | null
          request_id: number
          resolved_at: string | null
          resolved_by: string | null
          rounds: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          chosen_fdc_id?: number | null
          created_at?: string
          food_id?: number | null
          how_bought?: string | null
          kind?: string
          notes?: string | null
          query?: string
          raw_fdc_id?: number | null
          request_id?: never
          resolved_at?: string | null
          resolved_by?: string | null
          rounds?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          chosen_fdc_id?: number | null
          created_at?: string
          food_id?: number | null
          how_bought?: string | null
          kind?: string
          notes?: string | null
          query?: string
          raw_fdc_id?: number | null
          request_id?: never
          resolved_at?: string | null
          resolved_by?: string | null
          rounds?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_import_request_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["food_id"]
          },
        ]
      }
      food_preferences: {
        Row: {
          user_id: string
          food_id: number
          liked: boolean
          updated_at: string
        }
        Insert: {
          user_id: string
          food_id: number
          liked: boolean
          updated_at?: string
        }
        Update: {
          user_id?: string
          food_id?: number
          liked?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "food_preferences_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["food_id"]
          },
        ]
      }
      nutrient_profile_snapshot: {
        Row: {
          achievement_pct: number
          avg_coverage_pct: number
          created_at: string
          goal_met: boolean
          nutrient_profile_snapshot_id: number
          nutrients: Json
          nutrients_met: number
          nutrients_total: number
          pantry_food_ids: number[]
          pantry_id: number
          pantry_signature: string
          plan_days: number
          recommended_food_ids: number[]
          user_id: string
        }
        Insert: {
          achievement_pct: number
          avg_coverage_pct: number
          created_at?: string
          goal_met: boolean
          nutrient_profile_snapshot_id?: number
          nutrients: Json
          nutrients_met: number
          nutrients_total: number
          pantry_food_ids?: number[]
          pantry_id: number
          pantry_signature: string
          plan_days: number
          recommended_food_ids?: number[]
          user_id?: string
        }
        Update: {
          achievement_pct?: number
          avg_coverage_pct?: number
          created_at?: string
          goal_met?: boolean
          nutrient_profile_snapshot_id?: number
          nutrients?: Json
          nutrients_met?: number
          nutrients_total?: number
          pantry_food_ids?: number[]
          pantry_id?: number
          pantry_signature?: string
          plan_days?: number
          recommended_food_ids?: number[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrient_profile_snapshot_pantry_id_fkey"
            columns: ["pantry_id"]
            isOneToOne: false
            referencedRelation: "pantry"
            referencedColumns: ["pantry_id"]
          },
          {
            foreignKeyName: "nutrient_profile_snapshot_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pantry: {
        Row: {
          pantry_id: number
          user_id: string
        }
        Insert: {
          pantry_id?: number
          user_id: string
        }
        Update: {
          pantry_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pantry_item: {
        Row: {
          expiration_date: string | null
          food_id: number
          pantry_id: number
          pantry_item_id: number
          quantity: number
          unit: string | null
        }
        Insert: {
          expiration_date?: string | null
          food_id: number
          pantry_id: number
          pantry_item_id?: number
          quantity?: number
          unit?: string | null
        }
        Update: {
          expiration_date?: string | null
          food_id?: number
          pantry_id?: number
          pantry_item_id?: number
          quantity?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pantry_item_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "pantry_item_pantry_id_fkey"
            columns: ["pantry_id"]
            isOneToOne: false
            referencedRelation: "pantry"
            referencedColumns: ["pantry_id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          created_at: string
          food_id: string
          id: string
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          quantity?: number
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity: string
          age: number | null
          budget: number
          budget_period_start: string
          budget_period_weeks: number
          created_at: string
          display_name: string
          gender: string | null
          goal: string
          height_cm: number | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          activity?: string
          age?: number | null
          budget?: number
          budget_period_start?: string
          budget_period_weeks?: number
          created_at?: string
          display_name?: string
          gender?: string | null
          goal?: string
          height_cm?: number | null
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          activity?: string
          age?: number | null
          budget?: number
          budget_period_start?: string
          budget_period_weeks?: number
          created_at?: string
          display_name?: string
          gender?: string | null
          goal?: string
          height_cm?: number | null
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      recommendation_event: {
        Row: {
          anchor_food_id: number | null
          created_at: string
          event_type: string
          food_id: number
          impression_id: string
          rank: number | null
          recommendation_event_id: number
          shopping_list_id: number | null
          shopping_list_item_id: number | null
          source: string
          user_id: string
        }
        Insert: {
          anchor_food_id?: number | null
          created_at?: string
          event_type: string
          food_id: number
          impression_id: string
          rank?: number | null
          recommendation_event_id?: number
          shopping_list_id?: number | null
          shopping_list_item_id?: number | null
          source: string
          user_id?: string
        }
        Update: {
          anchor_food_id?: number | null
          created_at?: string
          event_type?: string
          food_id?: number
          impression_id?: string
          rank?: number | null
          recommendation_event_id?: number
          shopping_list_id?: number | null
          shopping_list_item_id?: number | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_event_anchor_food_id_fkey"
            columns: ["anchor_food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "recommendation_event_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "recommendation_event_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list"
            referencedColumns: ["shopping_list_id"]
          },
          {
            foreignKeyName: "recommendation_event_shopping_list_item_id_fkey"
            columns: ["shopping_list_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_item"
            referencedColumns: ["shopping_list_item_id"]
          },
          {
            foreignKeyName: "recommendation_event_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      shopping_list: {
        Row: {
          budget: number
          completed_at: string | null
          created_at: string
          days: number
          shopping_list_id: number
          status: string
          user_id: string
        }
        Insert: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          days?: number
          shopping_list_id?: number
          status?: string
          user_id: string
        }
        Update: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          days?: number
          shopping_list_id?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      shopping_list_item: {
        Row: {
          food_id: number
          is_purchased: boolean
          quantity: number
          shopping_list_id: number
          shopping_list_item_id: number
          unit: string | null
        }
        Insert: {
          food_id: number
          is_purchased?: boolean
          quantity?: number
          shopping_list_id: number
          shopping_list_item_id?: number
          unit?: string | null
        }
        Update: {
          food_id?: number
          is_purchased?: boolean
          quantity?: number
          shopping_list_id?: number
          shopping_list_item_id?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_item_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "shopping_list_item_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list"
            referencedColumns: ["shopping_list_id"]
          },
        ]
      }
      trip_items: {
        Row: {
          created_at: string
          food_id: string
          id: string
          purchased: boolean
          quantity: number
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          purchased?: boolean
          quantity?: number
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          purchased?: boolean
          quantity?: number
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget: number
          completed_at: string | null
          created_at: string
          days: number
          id: string
          status: string
          user_id: string
        }
        Insert: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          days?: number
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          days?: number
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_food_quota: {
        Row: {
          food_limit: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          food_limit?: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          food_limit?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_login_events: {
        Row: {
          created_at: string
          event_type: string
          login_event_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          login_event_id?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          login_event_id?: number
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          email: string
          first_name: string
          last_name: string
          user_id: string
          user_picture: string | null
        }
        Insert: {
          email?: string
          first_name?: string
          last_name?: string
          user_id: string
          user_picture?: string | null
        }
        Update: {
          email?: string
          first_name?: string
          last_name?: string
          user_id?: string
          user_picture?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_food_queue: { Args: never; Returns: Json }
      admin_mark_food_reviewed: {
        Args: { p_food_id: number }
        Returns: undefined
      }
      admin_dashboard: {
        Args: { p_window_days?: number }
        Returns: Json
      }
      admin_refresh_snapshots: {
        Args: never
        Returns: undefined
      }
      admin_resolve_food_request: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: number }
        Returns: undefined
      }
      admin_set_admin: {
        Args: { p_is_admin: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_users: {
        Args: never
        Returns: {
          days_inactive: number | null
          email: string
          first_name: string
          has_profile: boolean
          is_admin: boolean
          last_active_date: string | null
          last_name: string
          last_sign_in_at: string | null
          logon_days: number
          recs_added: number
          signed_up_at: string
          status: string
          tier: string
          trips_completed: number
          user_id: string
        }[]
      }
      is_kiwi_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
