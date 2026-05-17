export type MemoryType = 'text' | 'voice' | 'image' | 'task'

export type CommitmentStatus = 'active' | 'completed' | 'cancelled' | 'overdue'
export type CommitmentDirection = 'outgoing' | 'incoming'

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type ReminderStatus = 'pending' | 'sent' | 'dismissed' | 'snoozed'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface MemoryItem {
  id: string
  user_id: string
  type: MemoryType
  raw_content: string
  summary: string | null
  audio_url: string | null
  image_url: string | null
  emotional_tone: string | null
  importance: number | null
  embedding: number[] | null
  processed: boolean
  created_at: string
  updated_at: string
  people?: Person[]
  commitments?: Commitment[]
  tasks?: Task[]
}

export interface Person {
  id: string
  user_id: string
  name: string
  relationship: string | null
  context: string | null
  mention_count: number
  last_mentioned_at: string | null
  created_at: string
  updated_at: string
}

export interface Commitment {
  id: string
  user_id: string
  description: string
  status: CommitmentStatus
  due_date: string | null
  direction: CommitmentDirection
  source_memory_id: string | null
  person_id: string | null
  person?: Person
  importance: number | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  linked_commitment_id: string | null
  source_memory_id: string | null
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: string
  user_id: string
  message: string
  remind_at: string
  status: ReminderStatus
  task_id: string | null
  commitment_id: string | null
  created_at: string
}

export interface MemoryPerson {
  memory_id: string
  person_id: string
  role: string | null
}

export interface DailyBrief {
  id: string
  user_id: string
  brief_date: string
  content: string
  commitments_due: Commitment[] | null
  created_at: string
}

export interface RecallQuery {
  id: string
  user_id: string
  query_text: string
  response_text: string
  source_memory_ids: string[]
  created_at: string
}

export interface ExtractedEntities {
  summary: string
  importance: number
  emotional_tone: string
  people: {
    name: string
    relationship: string | null
    role: string | null
  }[]
  commitments: {
    description: string
    direction: CommitmentDirection
    due_date_text: string | null
    person_name: string | null
  }[]
  tasks: {
    title: string
    priority: TaskPriority
    due_date_text: string | null
  }[]
  dates_mentioned: {
    raw_text: string
    context: string
  }[]
  follow_up_intents: {
    description: string
    expected_timeframe: string | null
    confidence: number
  }[]
  emotional_analysis: {
    primary_emotion: string
    intensity: number
    valence: number
  } | null
}

// --- Continuity Intelligence Types ---

export type ContinuityEventType =
  | 'thought'
  | 'voice_note'
  | 'promise'
  | 'image'
  | 'location'
  | 'conversation'
  | 'interruption'
  | 'emotional_shift'

export type ContinuityState =
  | 'stable'
  | 'mild_fragmentation'
  | 'overload_emerging'
  | 'high_discontinuity'
  | 'critical'

export type CognitiveGraphNodeType =
  | 'person'
  | 'conversation'
  | 'emotion'
  | 'commitment'
  | 'location'
  | 'time_period'
  | 'decision'
  | 'goal'

export interface CognitiveGraphNode {
  id: string
  user_id: string
  node_type: CognitiveGraphNodeType
  label: string
  properties: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CognitiveGraphEdge {
  id: string
  user_id: string
  source_node_id: string
  target_node_id: string
  edge_type: string
  weight: number
  properties: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface InterruptedThread {
  id: string
  user_id: string
  title: string
  thread_summary: string | null
  originating_memory_id: string | null
  related_memory_ids: string[]
  last_activity_at: string
  interruption_score: number
  recovery_probability: number
  thread_continuity_score: number
  decay_coefficient: number
  continuity_retention: number
  status: 'active' | 'paused' | 'interrupted' | 'dormant' | 'resolved' | 'forgotten' | 'restored' | 'dismissed'
  recovered_at: string | null
  created_at: string
  updated_at: string
}

export interface RelationshipEdge {
  id: string
  user_id: string
  person_a: string
  person_b: string
  relationship_strength: number
  emotional_weight: number
  interaction_frequency: number
  continuity_score: number
  last_interaction: string | null
  created_at: string
  updated_at: string
}

export interface ContinuitySnapshot {
  id: string
  user_id: string
  snapshot_date: string
  continuity_score: number
  unresolved_commitments_penalty: number
  overdue_obligations_penalty: number
  interruption_rate_penalty: number
  cognitive_fragmentation_penalty: number
  decision_discontinuity_penalty: number
  state: ContinuityState
  created_at: string
}

export interface CognitiveLoadReading {
  id: string
  user_id: string
  measured_at: string
  active_contexts: number
  unresolved_obligations: number
  emotional_intensity: number
  interruption_frequency: number
  decision_density: number
  communication_burden: number
  load_score: number
  created_at: string
}

export interface FollowUpCandidate {
  id: string
  user_id: string
  source_memory_id: string | null
  description: string
  detected_intent: string
  expected_window_days: number
  detected_at: string
  follow_up_due_at: string | null
  decay_coefficient: number
  continuity_retention: number
  status: 'pending' | 'surfaced' | 'completed' | 'dismissed'
  surfaced_at: string | null
  created_at: string
  updated_at: string
}

export interface EmotionalReading {
  id: string
  user_id: string
  emotion: string
  intensity: number
  valence: number
  embedding: number[] | null
  source_memory_id: string | null
  measured_at: string
  created_at: string
}

export interface BehaviouralBaseline {
  id: string
  user_id: string
  metric_name: string
  baseline_value: number
  current_value: number
  drift_score: number
  window_days: number
  created_at: string
  updated_at: string
}

export interface ForgottenIntentPrediction {
  id: string
  user_id: string
  intent_description: string
  probability_forgotten: number
  intent_urgency: number
  cognitive_load_at_detection: number
  historical_pattern_score: number
  decay_adjusted_priority: number
  status: 'predicted' | 'surfaced' | 'confirmed_forgotten' | 'resolved' | 'false_positive'
  created_at: string
  updated_at: string
}

export interface ContinuityWindow {
  id: string
  user_id: string
  window_type: string
  life_state: Record<string, unknown>
  unresolved_threads: Record<string, unknown>
  emotional_context: Record<string, unknown>
  continuity_trajectory: Record<string, unknown>
  active_at: string
  expires_at: string | null
  created_at: string
}

export interface ContinuityWindowMessage {
  id: string
  window_id: string
  role: 'system' | 'assistant' | 'user'
  content: string
  source_memory_ids: string[]
  context_nodes: Record<string, unknown>
  created_at: string
}

export interface ContextWindow {
  life_state: {
    active_threads: InterruptedThread[]
    recent_emotions: EmotionalReading[]
    key_people: Person[]
    continuity_score: number
    continuity_state: ContinuityState
  }
  unresolved_threads: InterruptedThread[]
  emotional_context: {
    trajectory: string
    dominant_emotion: string
    volatility: number
  }
  continuity_trajectory: {
    trend: 'improving' | 'stable' | 'declining'
    recent_scores: number[]
  }
}
