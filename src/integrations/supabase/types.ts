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
      activity_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          created_at: string
          created_by: string | null
          download_url: string
          id: string
          is_active: boolean
          mandatory: boolean
          notes: string | null
          updated_at: string
          version: string
          version_code: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          download_url: string
          id?: string
          is_active?: boolean
          mandatory?: boolean
          notes?: string | null
          updated_at?: string
          version: string
          version_code?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          download_url?: string
          id?: string
          is_active?: boolean
          mandatory?: boolean
          notes?: string | null
          updated_at?: string
          version?: string
          version_code?: number
        }
        Relationships: []
      }
      badges: {
        Row: {
          created_at: string
          description: string
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description: string
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      battle_sessions: {
        Row: {
          answers: Json
          correct_count: number
          created_at: string
          id: string
          mega_test_id: string | null
          mode: string
          profession: Database["public"]["Enums"]["profession"] | null
          questions: Json
          score: number
          start_time: string
          submitted_at: string | null
          time_taken_seconds: number | null
          user_id: string
        }
        Insert: {
          answers?: Json
          correct_count?: number
          created_at?: string
          id?: string
          mega_test_id?: string | null
          mode: string
          profession?: Database["public"]["Enums"]["profession"] | null
          questions: Json
          score?: number
          start_time?: string
          submitted_at?: string | null
          time_taken_seconds?: number | null
          user_id: string
        }
        Update: {
          answers?: Json
          correct_count?: number
          created_at?: string
          id?: string
          mega_test_id?: string | null
          mode?: string
          profession?: Database["public"]["Enums"]["profession"] | null
          questions?: Json
          score?: number
          start_time?: string
          submitted_at?: string | null
          time_taken_seconds?: number | null
          user_id?: string
        }
        Relationships: []
      }
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
      daily_challenge_attempts: {
        Row: {
          challenge_id: string
          completed_at: string | null
          correct_count: number
          created_at: string
          id: string
          reward_tc: number
          session_id: string | null
          total_count: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          correct_count?: number
          created_at?: string
          id?: string
          reward_tc?: number
          session_id?: string | null
          total_count?: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          correct_count?: number
          created_at?: string
          id?: string
          reward_tc?: number
          session_id?: string | null
          total_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_challenge_attempts_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "daily_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_challenges: {
        Row: {
          challenge_date: string
          created_at: string
          id: string
          profession: Database["public"]["Enums"]["profession"]
          questions: Json
        }
        Insert: {
          challenge_date: string
          created_at?: string
          id?: string
          profession: Database["public"]["Enums"]["profession"]
          questions?: Json
        }
        Update: {
          challenge_date?: string
          created_at?: string
          id?: string
          profession?: Database["public"]["Enums"]["profession"]
          questions?: Json
        }
        Relationships: []
      }
      demo_players: {
        Row: {
          avatar_url: string | null
          correct_count: number
          created_at: string
          full_name: string
          id: string
          score: number
          time_taken_seconds: number
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          correct_count?: number
          created_at?: string
          full_name: string
          id?: string
          score?: number
          time_taken_seconds?: number
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          correct_count?: number
          created_at?: string
          full_name?: string
          id?: string
          score?: number
          time_taken_seconds?: number
          xp?: number
        }
        Relationships: []
      }
      doubt_replies: {
        Row: {
          body: string
          created_at: string
          doubt_id: string
          id: string
          image_url: string | null
          is_accepted: boolean
          upvote_count: number
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          doubt_id: string
          id?: string
          image_url?: string | null
          is_accepted?: boolean
          upvote_count?: number
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          doubt_id?: string
          id?: string
          image_url?: string | null
          is_accepted?: boolean
          upvote_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doubt_replies_doubt_id_fkey"
            columns: ["doubt_id"]
            isOneToOne: false
            referencedRelation: "doubts"
            referencedColumns: ["id"]
          },
        ]
      }
      doubts: {
        Row: {
          body: string
          chapter_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_flagged: boolean
          reply_count: number
          resolved: boolean
          subject_id: string | null
          title: string
          updated_at: string
          upvote_count: number
          user_id: string
        }
        Insert: {
          body: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_flagged?: boolean
          reply_count?: number
          resolved?: boolean
          subject_id?: string | null
          title: string
          updated_at?: string
          upvote_count?: number
          user_id: string
        }
        Update: {
          body?: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_flagged?: boolean
          reply_count?: number
          resolved?: boolean
          subject_id?: string | null
          title?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doubts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doubts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      forum_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      forum_posts: {
        Row: {
          body: string
          category_id: string
          created_at: string
          id: string
          is_flagged: boolean
          reply_count: number
          title: string
          updated_at: string
          upvote_count: number
          user_id: string
          view_count: number
        }
        Insert: {
          body: string
          category_id: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          reply_count?: number
          title: string
          updated_at?: string
          upvote_count?: number
          user_id: string
          view_count?: number
        }
        Update: {
          body?: string
          category_id?: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          reply_count?: number
          title?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "forum_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          upvote_count: number
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          upvote_count?: number
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          upvote_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_votes: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
          value?: number
        }
        Relationships: []
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
      mega_test_entries: {
        Row: {
          correct_count: number | null
          created_at: string
          id: string
          mega_test_id: string
          paid: boolean
          prize: number
          rank: number | null
          refunded: boolean
          score: number | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          correct_count?: number | null
          created_at?: string
          id?: string
          mega_test_id: string
          paid?: boolean
          prize?: number
          rank?: number | null
          refunded?: boolean
          score?: number | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          correct_count?: number | null
          created_at?: string
          id?: string
          mega_test_id?: string
          paid?: boolean
          prize?: number
          rank?: number | null
          refunded?: boolean
          score?: number | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mega_test_entries_mega_test_id_fkey"
            columns: ["mega_test_id"]
            isOneToOne: false
            referencedRelation: "mega_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_tests: {
        Row: {
          created_at: string
          entry_fee: number
          id: string
          min_participants: number
          profession: Database["public"]["Enums"]["profession"]
          question_count: number
          questions: Json | null
          scheduled_end: string
          scheduled_start: string
          status: string
        }
        Insert: {
          created_at?: string
          entry_fee?: number
          id?: string
          min_participants?: number
          profession: Database["public"]["Enums"]["profession"]
          question_count?: number
          questions?: Json | null
          scheduled_end: string
          scheduled_start: string
          status?: string
        }
        Update: {
          created_at?: string
          entry_fee?: number
          id?: string
          min_participants?: number
          profession?: Database["public"]["Enums"]["profession"]
          question_count?: number
          questions?: Json | null
          scheduled_end?: string
          scheduled_start?: string
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      phone_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      post_reports: {
        Row: {
          created_at: string
          id: string
          message: string | null
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      pro_vouchers: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          note: string | null
          percent: number
          source: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          note?: string | null
          percent: number
          source?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          note?: string | null
          percent?: number
          source?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      promo_code_redemptions: {
        Row: {
          created_at: string
          id: string
          percent: number
          plan: string
          promo_code_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          percent: number
          plan: string
          promo_code_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          percent?: number
          plan?: string
          promo_code_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          note: string | null
          percent: number
          plans: string[]
          updated_at: string
          used_count: number
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          note?: string | null
          percent: number
          plans?: string[]
          updated_at?: string
          used_count?: number
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          note?: string | null
          percent?: number
          plans?: string[]
          updated_at?: string
          used_count?: number
          valid_until?: string | null
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          chapter_id: string | null
          correct: string
          created_at: string
          created_by: string | null
          exam: string | null
          exam_year: number | null
          explanation: string
          hint: string
          id: string
          options: Json
          profession: string | null
          question: string
          source: string
          subject_code: string | null
        }
        Insert: {
          chapter_id?: string | null
          correct: string
          created_at?: string
          created_by?: string | null
          exam?: string | null
          exam_year?: number | null
          explanation?: string
          hint?: string
          id?: string
          options: Json
          profession?: string | null
          question: string
          source?: string
          subject_code?: string | null
        }
        Update: {
          chapter_id?: string | null
          correct?: string
          created_at?: string
          created_by?: string | null
          exam?: string | null
          exam_year?: number | null
          explanation?: string
          hint?: string
          id?: string
          options?: Json
          profession?: string | null
          question?: string
          source?: string
          subject_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
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
      review_items: {
        Row: {
          box: number
          chapter_id: string | null
          created_at: string
          due_at: string
          id: string
          last_result: string | null
          question: Json
          question_key: string
          reviewed_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          box?: number
          chapter_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          last_result?: string | null
          question: Json
          question_key: string
          reviewed_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          box?: number
          chapter_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          last_result?: string | null
          question?: Json
          question_key?: string
          reviewed_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      revise_topics: {
        Row: {
          chapter_id: string
          created_at: string
          diagram: string | null
          diagram_caption: string | null
          display_order: number
          formulas: Json
          generated_at: string | null
          id: string
          key_points: Json
          refs: Json
          slug: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          diagram?: string | null
          diagram_caption?: string | null
          display_order?: number
          formulas?: Json
          generated_at?: string | null
          id?: string
          key_points?: Json
          refs?: Json
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          diagram?: string | null
          diagram_caption?: string | null
          display_order?: number
          formulas?: Json
          generated_at?: string | null
          id?: string
          key_points?: Json
          refs?: Json
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revise_topics_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      social_links: {
        Row: {
          created_at: string
          display_order: number
          enabled: boolean
          id: string
          label: string
          platform: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          enabled?: boolean
          id?: string
          label: string
          platform: string
          updated_at?: string
          url?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          enabled?: boolean
          id?: string
          label?: string
          platform?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      study_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      study_group_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      study_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_private: boolean
          member_count: number
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          member_count?: number
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          member_count?: number
          name?: string
          owner_id?: string
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
      user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
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
      users: {
        Row: {
          avatar_url: string | null
          balance: number
          best_streak: number
          bio: string | null
          country_code: string
          created_at: string
          daily_question_limit: number
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          id: string
          is_banned: boolean
          is_pro: boolean
          last_active_date: string | null
          last_streak_date: string | null
          mega_credits: number
          onboarded: boolean
          phone: string | null
          pro_since: string | null
          pro_until: string | null
          profession: Database["public"]["Enums"]["profession"] | null
          referral_code: string | null
          referral_credited: boolean
          referred_by: string | null
          reputation: number
          signup_alert_sent_at: string | null
          streak: number
          terms_accepted_at: string | null
          total_accuracy: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          best_streak?: number
          bio?: string | null
          country_code?: string
          created_at?: string
          daily_question_limit?: number
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_banned?: boolean
          is_pro?: boolean
          last_active_date?: string | null
          last_streak_date?: string | null
          mega_credits?: number
          onboarded?: boolean
          phone?: string | null
          pro_since?: string | null
          pro_until?: string | null
          profession?: Database["public"]["Enums"]["profession"] | null
          referral_code?: string | null
          referral_credited?: boolean
          referred_by?: string | null
          reputation?: number
          signup_alert_sent_at?: string | null
          streak?: number
          terms_accepted_at?: string | null
          total_accuracy?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          best_streak?: number
          bio?: string | null
          country_code?: string
          created_at?: string
          daily_question_limit?: number
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_banned?: boolean
          is_pro?: boolean
          last_active_date?: string | null
          last_streak_date?: string | null
          mega_credits?: number
          onboarded?: boolean
          phone?: string | null
          pro_since?: string | null
          pro_until?: string | null
          profession?: Database["public"]["Enums"]["profession"] | null
          referral_code?: string | null
          referral_credited?: boolean
          referred_by?: string | null
          reputation?: number
          signup_alert_sent_at?: string | null
          streak?: number
          terms_accepted_at?: string | null
          total_accuracy?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          category: string
          created_at: string
          id: string
          note: string | null
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          category: string
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          account_name: string | null
          account_number: string | null
          amount: number
          bank_name: string | null
          created_at: string
          id: string
          ifsc: string | null
          method: string
          process_after: string
          processed_at: string | null
          short_code: number
          status: string
          upi_id: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          amount: number
          bank_name?: string | null
          created_at?: string
          id?: string
          ifsc?: string | null
          method: string
          process_after?: string
          processed_at?: string | null
          short_code?: number
          status?: string
          upi_id?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          amount?: number
          bank_name?: string | null
          created_at?: string
          id?: string
          ifsc?: string | null
          method?: string
          process_after?: string
          processed_at?: string | null
          short_code?: number
          status?: string
          upi_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          is_pro: boolean | null
          profession: Database["public"]["Enums"]["profession"] | null
          reputation: number | null
          streak: number | null
          total_accuracy: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_pro?: boolean | null
          profession?: Database["public"]["Enums"]["profession"] | null
          reputation?: number | null
          streak?: number | null
          total_accuracy?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_pro?: boolean | null
          profession?: Database["public"]["Enums"]["profession"] | null
          reputation?: number | null
          streak?: number | null
          total_accuracy?: number | null
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
      is_group_member: {
        Args: { _group: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
      profession: ["pcm", "pcb"],
    },
  },
} as const
