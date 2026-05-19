export type MemoryType = 'text' | 'voice' | 'image' | 'task'

export type CommitmentStatus = 'active' | 'completed' | 'cancelled' | 'overdue'
export type CommitmentDirection = 'outgoing' | 'incoming'

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type ReminderStatus = 'pending' | 'sent' | 'dismissed' | 'snoozed'

// --- Fact vs Inference Separation ---
// Facts: explicitly stated in content. Inferences: system-derived assumptions.
// These must NEVER be mixed in storage or display.
export type SourceType = 'fact' | 'inference'

// Dimensional confidence — replaces single-scalar confidence
export interface DimensionalConfidence {
  entity: number       // How certain are we about extracted entities (people, orgs)?
  intent: number       // How certain are we about the user's intent?
  temporal: number     // How certain are we about time references?
  relationship: number // How certain are we about person relationships?
  commitment: number   // How certain are we about detected commitments?
}

// Graph node lifecycle status
export type GraphNodeStatus = 'provisional' | 'confirmed' | 'deprecated'

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
  extraction_confidence: number | null
  processing_error: string | null
  primary_thread_id: string | null
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

export type IntentClassification =
  | 'commitment'
  | 'promise'
  | 'unresolved_thought'
  | 'concern'
  | 'reflection'
  | 'planning'
  | 'reminder'
  | 'relationship'
  | 'follow_up'
  | 'idea'
  | 'emotional_support'
  | 'admin_obligation'
  | 'risk'

export interface ExtractedEntities {
  summary: string
  importance: number
  emotional_tone: string
  people: {
    name: string
    relationship: string | null
    role: string | null
    source_type: SourceType // 'fact' if name explicitly stated, 'inference' if implied
  }[]
  commitments: {
    description: string
    direction: CommitmentDirection
    due_date_text: string | null
    person_name: string | null
    source_type: SourceType // 'fact' if explicitly promised, 'inference' if implied
    has_explicit_verb: boolean // deterministic verification: "I will call" vs "Andy mentioned"
    has_future_orientation: boolean // "tomorrow", "next week", "by Friday"
    has_identifiable_actor: boolean // clear who is committing
  }[]
  tasks: {
    title: string
    priority: TaskPriority
    due_date_text: string | null
    source_type: SourceType
  }[]
  dates_mentioned: {
    raw_text: string
    context: string
  }[]
  follow_up_intents: {
    description: string
    expected_timeframe: string | null
    confidence: number
    source_type: SourceType
  }[]
  emotional_signals: {
    signal_type: 'frustration' | 'urgency' | 'stress' | 'concern' | 'excitement' | 'relief'
    trigger_text: string // the exact text that triggered this signal
    intensity: number // 0-1 based on language strength
  }[]
  intent_classifications: IntentClassification[]
  organizations: {
    name: string
    role: string | null
  }[]
  projects: {
    name: string
    context: string | null
  }[]
  thread_hint: string | null
  extraction_confidence: number
  dimensional_confidence: DimensionalConfidence
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
  status: GraphNodeStatus
  mention_count: number
  first_seen_at: string
  last_seen_at: string
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

// --- Thread Types ---

export type ThreadType =
  | 'relationship'
  | 'project'
  | 'obligation'
  | 'concern'
  | 'planning'
  | 'idea'
  | 'emotional'
  | 'admin'
  | 'recurring'
  | 'general'

export type ThreadStatus =
  | 'active'
  | 'unresolved'
  | 'paused'
  | 'completed'
  | 'forgotten_risk'
  | 'emotionally_sensitive'
  | 'time_sensitive'

export interface Thread {
  id: string
  user_id: string
  title: string
  summary: string | null
  thread_type: ThreadType
  status: ThreadStatus
  continuity_score: number
  decay_coefficient: number
  continuity_retention: number
  last_activity_at: string
  capture_count: number
  entity_count: number
  commitment_count: number
  embedding: number[] | null
  importance: number
  emotional_valence: number
  created_at: string
  updated_at: string
  // Joined data
  captures?: ThreadCapture[]
  entities?: ThreadEntity[]
  people?: Person[]
  commitments?: Commitment[]
}

export interface ThreadCapture {
  id: string
  thread_id: string
  memory_id: string
  link_confidence: number
  link_type: SourceType // 'fact' if manually linked or very high CLC, 'inference' if auto-linked
  created_at: string
  memory?: MemoryItem
}

// Surfacing reason — deterministic explainability for every surfaced item
export interface SurfacingReason {
  primary: string        // e.g. "Contains unresolved commitment"
  factors: string[]      // e.g. ["Referenced 3 times this week", "Last updated 5 days ago"]
  data_source: 'thread' | 'commitment' | 'person' | 'follow_up' | 'decay'
}

export interface ThreadEntity {
  id: string
  thread_id: string
  entity_type: 'person' | 'commitment' | 'task' | 'follow_up'
  entity_id: string
  created_at: string
}

// --- Intent Router Types ---

export type InputIntent = 'capture' | 'ask' | 'reflect' | 'converse' | 'action'

export interface IntentRouterResult {
  intent: InputIntent
  confidence: number
  should_store: boolean
  response_needed: boolean
  reasoning: string
}

// --- Self Model Engine Types ---

export type PersonaMode = 'carer' | 'worker' | 'parent' | 'founder' | 'faith_community' | 'student' | 'general'

export type PatternType =
  | 'role'
  | 'recurring_area'
  | 'relationship_pattern'
  | 'pressure_signal'
  | 'support_preference'
  | 'daily_rhythm'
  | 'emotional_pattern'
  | 'commitment_pattern'
  | 'social_pattern'
  | 'relational_gravity'
  | 'identity_reflection'

export type PatternStatus = 'emerging' | 'established' | 'confirmed' | 'dismissed' | 'corrected'

export type SupportNeedCategory =
  | 'people_relying'
  | 'things_slipping'
  | 'closure_opportunity'
  | 'new_pattern'
  | 'pressure_building'
  | 'relationship_health'
  | 'forgotten_obligation'
  | 'emotional_load'
  | 'identity_neglect'

export type MorningSection = 'people_relying' | 'may_slip' | 'one_to_close' | 'pattern_noticed' | 'question'

export type QuestionStatus = 'pending' | 'shown' | 'answered' | 'dismissed' | 'expired'

export type SupportNeedStatus = 'active' | 'accepted' | 'dismissed' | 'corrected' | 'expired'

export type UserState = 'overwhelmed' | 'isolated' | 'drifting' | 'in_flow' | 'recovering' | 'stable' | 'stretched'

export type ReflectionType = 'value' | 'aspiration' | 'identity_anchor' | 'emotional_anchor' | 'belief' | 'boundary'

export interface UserLifeProfile {
  id: string
  user_id: string
  roles: { role: string; confidence: number; evidence_count: number; first_seen: string; last_seen: string }[]
  life_areas: { area: string; label: string; people: string[]; thread_count: number; confidence: number }[]
  active_persona: PersonaMode | null
  persona_confidence: number
  persona_source: 'inference' | 'user_confirmed' | null
  daily_rhythm: { peak_hours: number[]; quiet_hours: number[]; weekend_pattern: string | null }
  support_style: { prefers_questions: boolean; prefers_direct: boolean; morning_detail_level: string; emotional_sensitivity: string }
  completeness_score: number
  last_inference_at: string | null
  created_at: string
  updated_at: string
}

export interface UserStateRecord {
  id: string
  user_id: string
  current_state: UserState
  state_confidence: number
  state_signals: Record<string, unknown>[]
  previous_state: UserState | null
  state_changed_at: string
  created_at: string
  updated_at: string
}

export interface UserPattern {
  id: string
  user_id: string
  pattern_type: PatternType
  title: string
  description: string
  confidence: number
  evidence_count: number
  evidence_refs: Record<string, unknown>[]
  status: PatternStatus
  user_response: 'accepted' | 'dismissed' | 'corrected' | null
  user_correction: string | null
  created_at: string
  updated_at: string
}

export interface UserSupportNeed {
  id: string
  user_id: string
  title: string
  why_it_matters: string
  evidence_summary: string | null
  suggested_action: string | null
  confidence: number
  evidence_refs: Record<string, unknown>[]
  category: SupportNeedCategory
  morning_section: MorningSection | null
  priority: number
  status: SupportNeedStatus
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface OrbitaQuestion {
  id: string
  user_id: string
  question: string
  reason: string
  target_field: string
  expected_improvement: string | null
  status: QuestionStatus
  answer: string | null
  processed: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface ReflectionMemory {
  id: string
  user_id: string
  memory_type: ReflectionType
  content: string
  source_memory_id: string | null
  confidence: number
  source_type: SourceType
  active: boolean
  created_at: string
  updated_at: string
}
