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
      ai_usage: {
        Row: {
          created_at: string
          id: string
          kind: string
          origin_hash: string
          session_id: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          origin_hash: string
          session_id?: string | null
          success: boolean
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          origin_hash?: string
          session_id?: string | null
          success?: boolean
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          ai_daily_global_limit: number
          ai_enabled: boolean
          ai_per_origin_day: number
          ai_per_origin_hour: number
          ai_per_session: number
          id: number
          submits_per_origin_hour: number
          updated_at: string
        }
        Insert: {
          ai_daily_global_limit?: number
          ai_enabled?: boolean
          ai_per_origin_day?: number
          ai_per_origin_hour?: number
          ai_per_session?: number
          id?: number
          submits_per_origin_hour?: number
          updated_at?: string
        }
        Update: {
          ai_daily_global_limit?: number
          ai_enabled?: boolean
          ai_per_origin_day?: number
          ai_per_origin_hour?: number
          ai_per_session?: number
          id?: number
          submits_per_origin_hour?: number
          updated_at?: string
        }
        Relationships: []
      }
      association_rules: {
        Row: {
          active: boolean
          category: string
          clarifying_question: string | null
          complement: string
          condition: string | null
          created_at: string
          explanation: string
          id: string
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          trigger: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          clarifying_question?: string | null
          complement: string
          condition?: string | null
          created_at?: string
          explanation: string
          id?: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          trigger: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          clarifying_question?: string | null
          complement?: string
          condition?: string | null
          created_at?: string
          explanation?: string
          id?: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      followups: {
        Row: {
          created_at: string
          id: string
          note: string | null
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followups_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          ai_failed: boolean
          ai_interpretation: Json | null
          category: string | null
          clarifications: Json
          consent_at: string
          created_at: string
          customer_name: string
          customer_notes: string | null
          customer_whatsapp: string
          id: string
          internal_notes: string | null
          is_test: boolean
          last_followup_at: string | null
          needs_followup_at: string | null
          original_text: string
          protocol: string
          status: Database["public"]["Enums"]["request_status"]
          store_id: string | null
          submission_hash: string | null
          submission_key: string | null
          submission_origin: string | null
          updated_at: string
        }
        Insert: {
          ai_failed?: boolean
          ai_interpretation?: Json | null
          category?: string | null
          clarifications?: Json
          consent_at: string
          created_at?: string
          customer_name: string
          customer_notes?: string | null
          customer_whatsapp: string
          id?: string
          internal_notes?: string | null
          is_test?: boolean
          last_followup_at?: string | null
          needs_followup_at?: string | null
          original_text: string
          protocol: string
          status?: Database["public"]["Enums"]["request_status"]
          store_id?: string | null
          submission_hash?: string | null
          submission_key?: string | null
          submission_origin?: string | null
          updated_at?: string
        }
        Update: {
          ai_failed?: boolean
          ai_interpretation?: Json | null
          category?: string | null
          clarifications?: Json
          consent_at?: string
          created_at?: string
          customer_name?: string
          customer_notes?: string | null
          customer_whatsapp?: string
          id?: string
          internal_notes?: string | null
          is_test?: boolean
          last_followup_at?: string | null
          needs_followup_at?: string | null
          original_text?: string
          protocol?: string
          status?: Database["public"]["Enums"]["request_status"]
          store_id?: string | null
          submission_hash?: string | null
          submission_key?: string | null
          submission_origin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      request_items: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          origin: string
          quantity: string | null
          request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          origin: string
          quantity?: string | null
          request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          origin?: string
          quantity?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["request_status"] | null
          id: string
          note: string | null
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          note?: string | null
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          note?: string | null
          request_id?: string
          to_status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          name: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      submit_log: {
        Row: {
          created_at: string
          id: string
          origin_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          origin_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          origin_hash?: string
        }
        Relationships: []
      }
      suggested_complements: {
        Row: {
          accepted: boolean
          created_at: string
          id: string
          name: string
          reason: string | null
          request_id: string
          rule_id: string | null
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          id?: string
          name: string
          reason?: string | null
          request_id: string
          rule_id?: string | null
        }
        Update: {
          accepted?: boolean
          created_at?: string
          id?: string
          name?: string
          reason?: string | null
          request_id?: string
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggested_complements_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_complements_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "association_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      submit_quote_request: { Args: { payload: Json }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "seller"
      request_status:
        | "recebido"
        | "esclarecimento"
        | "preparacao"
        | "orcamento_enviado"
        | "aguardando_retorno"
        | "convertido"
        | "perdido"
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
    Enums: {
      app_role: ["admin", "seller"],
      request_status: [
        "recebido",
        "esclarecimento",
        "preparacao",
        "orcamento_enviado",
        "aguardando_retorno",
        "convertido",
        "perdido",
      ],
    },
  },
} as const
