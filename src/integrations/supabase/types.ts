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
      chapters: {
        Row: {
          class_level: number | null
          created_at: string
          display_order: number
          id: string
          name: string
          subject_id: string
        }
        Insert: {
          class_level?: number | null
          created_at?: string
          display_order?: number
          id?: string
          name: string
          subject_id: string
        }
        Update: {
          class_level?: number | null
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_questions: {
        Row: {
          chapter_ids: string[]
          created_at: string
          expires_at: string
          id: string
          profession: string
          question_count: number
          questions: Json
          user_id: string
        }
        Insert: {
          chapter_ids: string[]
          created_at?: string
          expires_at?: string
          id?: string
          profession: string
          question_count: number
          questions: Json
          user_id: string
        }
        Update: {
          chapter_ids?: string[]
          created_at?: string
          expires_at?: string
          id?: string
          profession?: string
          question_count?: number
          questions?: Json
          user_id?: string
        }
        Relationships: []
      }
      question_reports: {
        Row: {
          created_at: string
          id: string
          message: string | null
          question_id: string
          question_text: string | null
          reason: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          question_id: string
          question_text?: string | null
          reason: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          question_id?: string
          question_text?: string | null
          reason?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quiz_sessions: {
        Row: {
          accuracy: number | null
          answers: Json
          chapter_ids: string[]
          correct_count: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          incorrect_count: number | null
          last_heartbeat: string | null
          question_count: number
          questions: Json
          score: number | null
          start_time: string
          submitted_at: string | null
          time_taken_seconds: number | null
          timer_enabled: boolean
          user_id: string
          was_auto_submitted: boolean
        }
        Insert: {
          accuracy?: number | null
          answers?: Json
          chapter_ids: string[]
          correct_count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          incorrect_count?: number | null
          last_heartbeat?: string | null
          question_count: number
          questions: Json
          score?: number | null
          start_time?: string
          submitted_at?: string | null
          time_taken_seconds?: number | null
          timer_enabled?: boolean
          user_id: string
          was_auto_submitted?: boolean
        }
        Update: {
          accuracy?: number | null
          answers?: Json
          chapter_ids?: string[]
          correct_count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          incorrect_count?: number | null
          last_heartbeat?: string | null
          question_count?: number
          questions?: Json
          score?: number | null
          start_time?: string
          submitted_at?: string | null
          time_taken_seconds?: number | null
          timer_enabled?: boolean
          user_id?: string
          was_auto_submitted?: boolean
        }
        Relationships: []
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
          profession: Database["public"]["Enums"]["profession"]
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          profession: Database["public"]["Enums"]["profession"]
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          profession?: Database["public"]["Enums"]["profession"]
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          country_code: string
          created_at: string
          daily_question_limit: number
          email: string | null
          full_name: string | null
          id: string
          last_active_date: string | null
          last_streak_date: string | null
          onboarded: boolean
          phone: string | null
          profession: Database["public"]["Enums"]["profession"] | null
          streak: number
          total_accuracy: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          country_code?: string
          created_at?: string
          daily_question_limit?: number
          email?: string | null
          full_name?: string | null
          id: string
          last_active_date?: string | null
          last_streak_date?: string | null
          onboarded?: boolean
          phone?: string | null
          profession?: Database["public"]["Enums"]["profession"] | null
          streak?: number
          total_accuracy?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          country_code?: string
          created_at?: string
          daily_question_limit?: number
          email?: string | null
          full_name?: string | null
          id?: string
          last_active_date?: string | null
          last_streak_date?: string | null
          onboarded?: boolean
          phone?: string | null
          profession?: Database["public"]["Enums"]["profession"] | null
          streak?: number
          total_accuracy?: number
          updated_at?: string
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
      profession: "pcm" | "pcb"
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
      profession: ["pcm", "pcb"],
    },
  },
} as const
