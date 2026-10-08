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
      food: {
        Row: {
          emoji: string
          food_category_id: number | null
          food_description: string
          food_id: number
          food_name: string
          food_picture: string | null
          nutrition: Json
          pairs: number[]
          price: number
          serving_size: number
          unit: string
        }
        Insert: {
          emoji?: string
          food_category_id?: number | null
          food_description?: string
          food_id?: number
          food_name: string
          food_picture?: string | null
          nutrition?: Json
          pairs?: number[]
          price?: number
          serving_size?: number
          unit?: string
        }
        Update: {
          emoji?: string
          food_category_id?: number | null
          food_description?: string
          food_id?: number
          food_name?: string
          food_picture?: string | null
          nutrition?: Json
          pairs?: number[]
          price?: number
          serving_size?: number
          unit?: string
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
      [_ in never]: never
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
