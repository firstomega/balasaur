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
      media: {
        Row: {
          award_nominations: number | null
          award_nominee: boolean
          award_winner: boolean
          award_wins: number | null
          fetched_at: string
          genres: string[]
          length_label: string | null
          media_id: string
          media_type: string
          origins: string[]
          overview: string | null
          people: Json
          popularity: number | null
          poster_url: string | null
          rating_imdb: number | null
          rating_metacritic: number | null
          rating_rotten_tomatoes: number | null
          rating_tmdb: number | null
          raw_omdb: Json | null
          raw_tmdb: Json | null
          release_date: string | null
          seasons: Json | null
          streaming: string[]
          title: string
          updated_at: string
          year: string | null
        }
        Insert: {
          award_nominations?: number | null
          award_nominee?: boolean
          award_winner?: boolean
          award_wins?: number | null
          fetched_at?: string
          genres?: string[]
          length_label?: string | null
          media_id: string
          media_type: string
          origins?: string[]
          overview?: string | null
          people?: Json
          popularity?: number | null
          poster_url?: string | null
          rating_imdb?: number | null
          rating_metacritic?: number | null
          rating_rotten_tomatoes?: number | null
          rating_tmdb?: number | null
          raw_omdb?: Json | null
          raw_tmdb?: Json | null
          release_date?: string | null
          seasons?: Json | null
          streaming?: string[]
          title: string
          updated_at?: string
          year?: string | null
        }
        Update: {
          award_nominations?: number | null
          award_nominee?: boolean
          award_winner?: boolean
          award_wins?: number | null
          fetched_at?: string
          genres?: string[]
          length_label?: string | null
          media_id?: string
          media_type?: string
          origins?: string[]
          overview?: string | null
          people?: Json
          popularity?: number | null
          poster_url?: string | null
          rating_imdb?: number | null
          rating_metacritic?: number | null
          rating_rotten_tomatoes?: number | null
          rating_tmdb?: number | null
          raw_omdb?: Json | null
          raw_tmdb?: Json | null
          release_date?: string | null
          seasons?: Json | null
          streaming?: string[]
          title?: string
          updated_at?: string
          year?: string | null
        }
        Relationships: []
      }
      media_cache: {
        Row: {
          detail_fetched_at: string | null
          detail_payload: Json | null
          id: string
          media_type: string
          popularity: number | null
          summary_fetched_at: string | null
          summary_payload: Json | null
          title: string | null
          tmdb_id: number
          updated_at: string
          year: string | null
        }
        Insert: {
          detail_fetched_at?: string | null
          detail_payload?: Json | null
          id: string
          media_type: string
          popularity?: number | null
          summary_fetched_at?: string | null
          summary_payload?: Json | null
          title?: string | null
          tmdb_id: number
          updated_at?: string
          year?: string | null
        }
        Update: {
          detail_fetched_at?: string | null
          detail_payload?: Json | null
          id?: string
          media_type?: string
          popularity?: number | null
          summary_fetched_at?: string | null
          summary_payload?: Json | null
          title?: string | null
          tmdb_id?: number
          updated_at?: string
          year?: string | null
        }
        Relationships: []
      }
      person_cache: {
        Row: {
          fetched_at: string
          id: number
          name: string
          payload: Json
          updated_at: string
        }
        Insert: {
          fetched_at?: string
          id: number
          name: string
          payload: Json
          updated_at?: string
        }
        Update: {
          fetched_at?: string
          id?: number
          name?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_preset: string | null
          bio: string
          created_at: string
          display_name: string
          favorite_genres: string[]
          id: string
          is_public: boolean
          updated_at: string
          username: string
        }
        Insert: {
          avatar_preset?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          favorite_genres?: string[]
          id: string
          is_public?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          avatar_preset?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          favorite_genres?: string[]
          id?: string
          is_public?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      trending_cache: {
        Row: {
          fetched_at: string
          ids: string[]
          key: string
        }
        Insert: {
          fetched_at?: string
          ids: string[]
          key: string
        }
        Update: {
          fetched_at?: string
          ids?: string[]
          key?: string
        }
        Relationships: []
      }
      user_media_status: {
        Row: {
          id: string
          intent: string | null
          media_id: string
          media_type: string
          poster_url: string | null
          rewatch_ok: boolean | null
          sentiment: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          year: string | null
        }
        Insert: {
          id?: string
          intent?: string | null
          media_id: string
          media_type: string
          poster_url?: string | null
          rewatch_ok?: boolean | null
          sentiment?: string | null
          status: string
          title: string
          updated_at?: string
          user_id: string
          year?: string | null
        }
        Update: {
          id?: string
          intent?: string | null
          media_id?: string
          media_type?: string
          poster_url?: string | null
          rewatch_ok?: boolean | null
          sentiment?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          year?: string | null
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
    Enums: {},
  },
} as const
