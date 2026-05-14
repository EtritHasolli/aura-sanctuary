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
      chat_messages: {
        Row: {
          content: string
          created_at: string
          display_name: string
          id: string
          party_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          display_name: string
          id?: string
          party_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          display_name?: string
          id?: string
          party_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_wordle_progress: {
        Row: {
          day_key: string
          guesses: string[]
          play_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          day_key: string
          guesses?: string[]
          play_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          day_key?: string
          guesses?: string[]
          play_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string
          created_at: string
          id: string
          source_task_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          source_task_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          source_task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          boss_hp: number
          boss_max_hp: number
          boss_name: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          boss_hp?: number
          boss_max_hp?: number
          boss_name?: string
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          boss_hp?: number
          boss_max_hp?: number
          boss_name?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      party_members: {
        Row: {
          joined_at: string
          party_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          party_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          party_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aura_path: string | null
          avatar_url: string | null
          constitution: number
          created_at: string
          dexterity: number
          display_name: string
          equip_con_bonus: number
          equip_dex_bonus: number
          equip_gold_bonus_pct: number
          equip_int_bonus: number
          equip_max_stamina_bonus: number
          equip_str_bonus: number
          equip_xp_bonus_pct: number
          friend_code: string
          gold: number
          hp: number
          id: string
          intelligence: number
          last_stamina_regen_at: string
          last_stamina_reset_on: string
          level: number
          max_stamina: number
          max_hp: number
          path_reroll_used: boolean
          path_testing_override: boolean
          pet_name: string
          pet_state: string
          pomodoro_settings: Json | null
          stamina: number
          strength: number
          updated_at: string
          xp: number
        }
        Insert: {
          aura_path?: string | null
          avatar_url?: string | null
          constitution?: number
          created_at?: string
          dexterity?: number
          display_name?: string
          equip_con_bonus?: number
          equip_dex_bonus?: number
          equip_gold_bonus_pct?: number
          equip_int_bonus?: number
          equip_max_stamina_bonus?: number
          equip_str_bonus?: number
          equip_xp_bonus_pct?: number
          friend_code?: string
          gold?: number
          hp?: number
          id: string
          intelligence?: number
          last_stamina_regen_at?: string
          last_stamina_reset_on?: string
          level?: number
          max_stamina?: number
          max_hp?: number
          path_reroll_used?: boolean
          path_testing_override?: boolean
          pet_name?: string
          pet_state?: string
          pomodoro_settings?: Json | null
          stamina?: number
          strength?: number
          updated_at?: string
          xp?: number
        }
        Update: {
          aura_path?: string | null
          avatar_url?: string | null
          constitution?: number
          created_at?: string
          dexterity?: number
          display_name?: string
          equip_con_bonus?: number
          equip_dex_bonus?: number
          equip_gold_bonus_pct?: number
          equip_int_bonus?: number
          equip_max_stamina_bonus?: number
          equip_str_bonus?: number
          equip_xp_bonus_pct?: number
          friend_code?: string
          gold?: number
          hp?: number
          id?: string
          intelligence?: number
          last_stamina_regen_at?: string
          last_stamina_reset_on?: string
          level?: number
          max_stamina?: number
          max_hp?: number
          path_reroll_used?: boolean
          path_testing_override?: boolean
          pet_name?: string
          pet_state?: string
          pomodoro_settings?: Json | null
          stamina?: number
          strength?: number
          updated_at?: string
          xp?: number
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          category: string
          created_at: string
          description: string
          forge_exclusive: boolean
          id: string
          is_active: boolean
          metadata: Json
          name: string
          price: number
          rarity: string
          slug: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          forge_exclusive?: boolean
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          price: number
          rarity?: string
          slug: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          forge_exclusive?: boolean
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          price?: number
          rarity?: string
          slug?: string
        }
        Relationships: []
      }
      shop_purchases: {
        Row: {
          created_at: string
          id: string
          item_id: string
          quantity: number
          total_cost: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          quantity: number
          total_cost: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          quantity?: number
          total_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_items: {
        Row: {
          acquired_at: string
          equipped: boolean
          id: string
          item_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          equipped?: boolean
          id?: string
          item_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          equipped?: boolean
          id?: string
          item_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed: boolean
          created_at: string
          difficulty: Database["public"]["Enums"]["task_difficulty"]
          id: string
          last_completed_at: string | null
          negative_count: number
          notes: string | null
          position: number
          positive_count: number
          source_note_id: string | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          difficulty?: Database["public"]["Enums"]["task_difficulty"]
          id?: string
          last_completed_at?: string | null
          negative_count?: number
          notes?: string | null
          position?: number
          positive_count?: number
          source_note_id?: string | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          difficulty?: Database["public"]["Enums"]["task_difficulty"]
          id?: string
          last_completed_at?: string | null
          negative_count?: number
          notes?: string | null
          position?: number
          positive_count?: number
          source_note_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_party_member: {
        Args: { _party_id: string; _user_id: string }
        Returns: boolean
      }
      purchase_shop_item: {
        Args: { p_item_slug: string; p_quantity?: number }
        Returns: {
          gold_left: number
          item_slug: string
          new_quantity: number
          quantity_purchased: number
        }[]
      }
      apply_stamina_regen: {
        Args: { p_gain_per_tick?: number; p_tick_minutes?: number }
        Returns: {
          max_stamina: number
          regen_applied: number
          reset_applied: boolean
          stamina: number
        }[]
      }
      consume_user_item: {
        Args: { p_item_slug: string; p_quantity?: number }
        Returns: {
          consumed_quantity: number
          hp_after: number
          item_slug: string
          quantity_left: number
          stamina_after: number
        }[]
      }
      sync_party_boss_scaling: {
        Args: { p_party_id: string }
        Returns: {
          boss_hp: number
          boss_max_hp: number
        }[]
      }
      strike_party_boss: {
        Args: { p_party_id: string }
        Returns: Json
      }
      equip_user_item: {
        Args: { p_user_item_id: string }
        Returns: undefined
      }
      unequip_user_item: {
        Args: { p_user_item_id: string }
        Returns: undefined
      }
      forge_three_equipment: {
        Args: {
          p_user_item_id_a: string
          p_user_item_id_b: string
          p_user_item_id_c: string
        }
        Returns: Json
      }
    }
    Enums: {
      task_difficulty: "trivial" | "easy" | "medium" | "hard"
      task_type: "habit" | "daily" | "todo"
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
      task_difficulty: ["trivial", "easy", "medium", "hard"],
      task_type: ["habit", "daily", "todo"],
    },
  },
} as const
