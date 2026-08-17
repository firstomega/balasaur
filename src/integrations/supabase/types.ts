export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      collection_items: {
        Row: {
          media_id: string;
          rank: number;
          slug: string;
        };
        Insert: {
          media_id: string;
          rank: number;
          slug: string;
        };
        Update: {
          media_id?: string;
          rank?: number;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media";
            referencedColumns: ["media_id"];
          },
          {
            foreignKeyName: "collection_items_slug_fkey";
            columns: ["slug"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["slug"];
          },
        ];
      };
      collection_recipes: {
        Row: {
          slug: string;
          title: string;
          section: string;
          season_months: number[] | null;
          criteria: Json;
          min_items: number;
          active: boolean;
          sort_order: number;
        };
        Insert: {
          slug: string;
          title: string;
          section: string;
          season_months?: number[] | null;
          criteria: Json;
          min_items?: number;
          active?: boolean;
          sort_order?: number;
        };
        Update: {
          slug?: string;
          title?: string;
          section?: string;
          season_months?: number[] | null;
          criteria?: Json;
          min_items?: number;
          active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      collection_redirects: {
        Row: { from_slug: string; to_slug: string };
        Insert: { from_slug: string; to_slug: string };
        Update: { from_slug?: string; to_slug?: string };
        Relationships: [];
      };
      collections: {
        Row: {
          media_type: string | null;
          season_months: number[] | null;
          item_count: number;
          kind: string;
          median_score: number | null;
          newest_date: string | null;
          newest_title: string | null;
          poster_ids: string[];
          slug: string;
          title: string;
          top_score: number | null;
          top_titles: Json;
          updated_at: string;
        };
        Insert: {
          media_type?: string | null;
          season_months?: number[] | null;
          item_count: number;
          kind: string;
          median_score?: number | null;
          newest_date?: string | null;
          newest_title?: string | null;
          poster_ids?: string[];
          slug: string;
          title: string;
          top_score?: number | null;
          top_titles?: Json;
          updated_at?: string;
        };
        Update: {
          media_type?: string | null;
          season_months?: number[] | null;
          item_count?: number;
          kind?: string;
          median_score?: number | null;
          newest_date?: string | null;
          newest_title?: string | null;
          poster_ids?: string[];
          slug?: string;
          title?: string;
          top_score?: number | null;
          top_titles?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      media: {
        Row: {
          audience: string[];
          award_nominations: number | null;
          award_nominee: boolean;
          award_winner: boolean;
          award_wins: number | null;
          awards_nominated: string[];
          awards_won: string[];
          completion_status: string | null;
          facets_derived_at: string | null;
          fetched_at: string;
          film_length_minutes: number | null;
          genres: string[];
          length_label: string | null;
          media_id: string;
          media_type: string;
          origins: string[];
          overview: string | null;
          people: Json;
          popularity: number | null;
          poster_url: string | null;
          quality_score: number | null;
          rank_score: number | null;
          rating_balasaur: number | null;
          rating_imdb: number | null;
          rating_metacritic: number | null;
          rating_rotten_tomatoes: number | null;
          rating_tmdb: number | null;
          rating_user_avg: number | null;
          raw_omdb: Json | null;
          raw_tmdb: Json | null;
          release_date: string | null;
          seasons: Json | null;
          sensitive: boolean;
          streaming: string[];
          streaming_regions: string[];
          sub_genres: string[];
          themes: string[];
          title: string;
          updated_at: string;
          vote_count: number | null;
          year: string | null;
        };
        Insert: {
          audience?: string[];
          award_nominations?: number | null;
          award_nominee?: boolean;
          award_winner?: boolean;
          award_wins?: number | null;
          awards_nominated?: string[];
          awards_won?: string[];
          completion_status?: string | null;
          facets_derived_at?: string | null;
          fetched_at?: string;
          film_length_minutes?: number | null;
          genres?: string[];
          length_label?: string | null;
          media_id: string;
          media_type: string;
          origins?: string[];
          overview?: string | null;
          people?: Json;
          popularity?: number | null;
          poster_url?: string | null;
          quality_score?: number | null;
          rank_score?: number | null;
          rating_balasaur?: number | null;
          rating_imdb?: number | null;
          rating_metacritic?: number | null;
          rating_rotten_tomatoes?: number | null;
          rating_tmdb?: number | null;
          rating_user_avg?: number | null;
          raw_omdb?: Json | null;
          raw_tmdb?: Json | null;
          release_date?: string | null;
          seasons?: Json | null;
          sensitive?: boolean;
          streaming?: string[];
          streaming_regions?: string[];
          sub_genres?: string[];
          themes?: string[];
          title: string;
          updated_at?: string;
          vote_count?: number | null;
          year?: string | null;
        };
        Update: {
          audience?: string[];
          award_nominations?: number | null;
          award_nominee?: boolean;
          award_winner?: boolean;
          award_wins?: number | null;
          awards_nominated?: string[];
          awards_won?: string[];
          completion_status?: string | null;
          facets_derived_at?: string | null;
          fetched_at?: string;
          film_length_minutes?: number | null;
          genres?: string[];
          length_label?: string | null;
          media_id?: string;
          media_type?: string;
          origins?: string[];
          overview?: string | null;
          people?: Json;
          popularity?: number | null;
          poster_url?: string | null;
          quality_score?: number | null;
          rank_score?: number | null;
          rating_balasaur?: number | null;
          rating_imdb?: number | null;
          rating_metacritic?: number | null;
          rating_rotten_tomatoes?: number | null;
          rating_tmdb?: number | null;
          rating_user_avg?: number | null;
          raw_omdb?: Json | null;
          raw_tmdb?: Json | null;
          release_date?: string | null;
          seasons?: Json | null;
          sensitive?: boolean;
          streaming?: string[];
          streaming_regions?: string[];
          sub_genres?: string[];
          themes?: string[];
          title?: string;
          updated_at?: string;
          vote_count?: number | null;
          year?: string | null;
        };
        Relationships: [];
      };
      media_cache: {
        Row: {
          detail_fetched_at: string | null;
          detail_payload: Json | null;
          id: string;
          media_type: string;
          popularity: number | null;
          summary_fetched_at: string | null;
          summary_payload: Json | null;
          title: string | null;
          tmdb_id: number;
          updated_at: string;
          year: string | null;
        };
        Insert: {
          detail_fetched_at?: string | null;
          detail_payload?: Json | null;
          id: string;
          media_type: string;
          popularity?: number | null;
          summary_fetched_at?: string | null;
          summary_payload?: Json | null;
          title?: string | null;
          tmdb_id: number;
          updated_at?: string;
          year?: string | null;
        };
        Update: {
          detail_fetched_at?: string | null;
          detail_payload?: Json | null;
          id?: string;
          media_type?: string;
          popularity?: number | null;
          summary_fetched_at?: string | null;
          summary_payload?: Json | null;
          title?: string | null;
          tmdb_id?: number;
          updated_at?: string;
          year?: string | null;
        };
        Relationships: [];
      };
      person_cache: {
        Row: {
          fetched_at: string;
          id: number;
          name: string;
          payload: Json;
          updated_at: string;
        };
        Insert: {
          fetched_at?: string;
          id: number;
          name: string;
          payload: Json;
          updated_at?: string;
        };
        Update: {
          fetched_at?: string;
          id?: number;
          name?: string;
          payload?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_preset: string | null;
          bio: string;
          created_at: string;
          display_name: string;
          favorite_genres: string[];
          id: string;
          is_public: boolean;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_preset?: string | null;
          bio?: string;
          created_at?: string;
          display_name?: string;
          favorite_genres?: string[];
          id: string;
          is_public?: boolean;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_preset?: string | null;
          bio?: string;
          created_at?: string;
          display_name?: string;
          favorite_genres?: string[];
          id?: string;
          is_public?: boolean;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      saved_filters: {
        Row: {
          created_at: string;
          filter_state: Json;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filter_state: Json;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filter_state?: Json;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trending_cache: {
        Row: {
          fetched_at: string;
          ids: string[];
          key: string;
        };
        Insert: {
          fetched_at?: string;
          ids: string[];
          key: string;
        };
        Update: {
          fetched_at?: string;
          ids?: string[];
          key?: string;
        };
        Relationships: [];
      };
      user_media_status: {
        Row: {
          id: string;
          intent: string | null;
          media_id: string;
          media_type: string;
          poster_url: string | null;
          rewatch_ok: boolean | null;
          sentiment: string | null;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
          year: string | null;
        };
        Insert: {
          id?: string;
          intent?: string | null;
          media_id: string;
          media_type: string;
          poster_url?: string | null;
          rewatch_ok?: boolean | null;
          sentiment?: string | null;
          status: string;
          title: string;
          updated_at?: string;
          user_id: string;
          year?: string | null;
        };
        Update: {
          id?: string;
          intent?: string | null;
          media_id?: string;
          media_type?: string;
          poster_url?: string | null;
          rewatch_ok?: boolean | null;
          sentiment?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          year?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      // People with 3+ leading or directing credits in indexable titles.
      // Materialized, refreshed nightly at 09:30.
      person_index: {
        Row: {
          person_id: number;
          name: string;
          profile_path: string | null;
          titles: number;
        };
        Relationships: [];
      };
      // Titles eligible for search indexing: the SQL mirror of isCorroborated()
      // in src/lib/indexability.ts. Every column of a view is nullable, which is
      // what the generator emits column by column; expressed as a mapped type so
      // it cannot drift from `media` when a column is added.
      indexable_media: {
        Row: {
          [K in keyof Database["public"]["Tables"]["media"]["Row"]]:
            | Database["public"]["Tables"]["media"]["Row"][K]
            | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      canonical_media_path: {
        Args: { p_media_id: string; p_media_type: string; p_title: string };
        Returns: string;
      };
      catalog_facets: { Args: never; Returns: Json };
      catalog_facets_filtered: { Args: { p: Json }; Returns: Json };
      genre_plural: { Args: { g: string }; Returns: string };
      ping_indexnow: { Args: { p_full?: boolean }; Returns: Json };
      search_persons: {
        Args: { p_q: string };
        Returns: {
          person_id: number;
          name: string;
          profile_path: string | null;
          titles: number;
        }[];
      };
      rebuild_collections: { Args: never; Returns: undefined };
      search_cast: {
        Args: { p_exclude?: string[]; p_q: string };
        Returns: {
          name: string;
        }[];
      };
      search_titles: {
        Args: { p_q: string };
        Returns: {
          media_id: string;
          media_type: string;
          poster_url: string;
          rating_imdb: number;
          rating_metacritic: number;
          rating_rotten_tomatoes: number;
          rating_tmdb: number;
          title: string;
          year: string;
        }[];
      };
      slugify: { Args: { t: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
