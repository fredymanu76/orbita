import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CognitiveGraphNode,
  CognitiveGraphEdge,
  CognitiveGraphNodeType,
  GraphNodeStatus,
  ExtractedEntities,
  ContextWindow,
  ContinuityState,
} from '@/lib/types'

// Promotion thresholds for provisional → confirmed
const PROMOTION_MENTION_COUNT = 3  // Mentioned at least 3 times
const PROMOTION_CO_OCCURRENCE = 2  // Co-occurred with confirmed nodes at least 2 times

/**
 * Find or create a cognitive graph node.
 *
 * New nodes enter as PROVISIONAL unless:
 * - They are people with high entity confidence (>= 0.8)
 * - They are conversations (always confirmed — represents a specific memory)
 *
 * Provisional nodes are promoted to confirmed when:
 * - mention_count >= PROMOTION_MENTION_COUNT
 * - co_occurrence with confirmed nodes >= PROMOTION_CO_OCCURRENCE
 * - User explicitly confirms (future feature)
 *
 * This prevents low-confidence graph pollution from accumulating over time.
 */
async function upsertNode(
  userId: string,
  nodeType: CognitiveGraphNodeType,
  label: string,
  properties: Record<string, unknown> = {},
  initialStatus: GraphNodeStatus = 'provisional'
): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Try to find existing node
  const { data: existing } = await supabase
    .from('cognitive_graph_nodes')
    .select('id, status, mention_count')
    .eq('user_id', userId)
    .eq('node_type', nodeType)
    .eq('label', label)
    .single()

  if (existing) {
    const newMentionCount = (existing.mention_count || 0) + 1
    let newStatus = existing.status

    // Auto-promote provisional → confirmed on repeated mentions
    if (existing.status === 'provisional' && newMentionCount >= PROMOTION_MENTION_COUNT) {
      newStatus = 'confirmed'
    }

    await supabase
      .from('cognitive_graph_nodes')
      .update({
        properties: { ...properties },
        mention_count: newMentionCount,
        last_seen_at: now,
        status: newStatus,
        updated_at: now,
      })
      .eq('id', existing.id)
    return existing.id
  }

  const { data: created } = await supabase
    .from('cognitive_graph_nodes')
    .insert({
      user_id: userId,
      node_type: nodeType,
      label,
      properties,
      status: initialStatus,
      mention_count: 1,
      first_seen_at: now,
      last_seen_at: now,
    })
    .select('id')
    .single()

  return created!.id
}

/**
 * Create or update an edge between two nodes.
 *
 * Edges involving provisional nodes get lower initial weight.
 * Edges only form between confirmed nodes at full weight.
 */
async function upsertEdge(
  userId: string,
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: string,
  weight: number = 1.0,
  properties: Record<string, unknown> = {}
): Promise<string> {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('cognitive_graph_edges')
    .select('id, weight')
    .eq('user_id', userId)
    .eq('source_node_id', sourceNodeId)
    .eq('target_node_id', targetNodeId)
    .eq('edge_type', edgeType)
    .single()

  if (existing) {
    await supabase
      .from('cognitive_graph_edges')
      .update({
        weight: Math.min(10, existing.weight + weight * 0.1),
        properties,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return existing.id
  }

  const { data: created } = await supabase
    .from('cognitive_graph_edges')
    .insert({
      user_id: userId,
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      edge_type: edgeType,
      weight,
      properties,
    })
    .select('id')
    .single()

  return created!.id
}

/**
 * After entity extraction, create/update nodes for detected entities
 * and connect them with edges.
 *
 * Gating rules:
 * - Conversation nodes: always confirmed (represents specific memory)
 * - Person nodes from facts: confirmed if entity_confidence >= 0.8, else provisional
 * - Person nodes from inferences: always provisional
 * - Commitment nodes: confirmed only if the commitment passed verification
 * - Emotion nodes: REMOVED — replaced by emotional signals (no graph pollution)
 * - Goal nodes: provisional until repeated mention
 */
export async function buildGraphNodes(
  userId: string,
  memoryId: string,
  entities: ExtractedEntities
): Promise<string[]> {
  const nodeIds: string[] = []
  const dimConf = entities.dimensional_confidence

  // Create conversation node for this memory — always confirmed
  const conversationNodeId = await upsertNode(userId, 'conversation', memoryId, {
    summary: entities.summary,
    emotional_tone: entities.emotional_tone,
  }, 'confirmed')
  nodeIds.push(conversationNodeId)

  // Create person nodes — status depends on source_type and confidence
  for (const person of entities.people) {
    const status: GraphNodeStatus =
      person.source_type === 'fact' && dimConf.entity >= 0.8
        ? 'confirmed'
        : 'provisional'

    const personNodeId = await upsertNode(userId, 'person', person.name, {
      relationship: person.relationship,
      role: person.role,
      source_type: person.source_type,
    }, status)
    nodeIds.push(personNodeId)
  }

  // Create commitment nodes — only for verified commitments (facts with explicit verbs)
  for (const commitment of entities.commitments) {
    if (commitment.source_type !== 'fact' || !commitment.has_explicit_verb) {
      continue // Don't pollute graph with unverified commitments
    }

    const commitmentNodeId = await upsertNode(userId, 'commitment', commitment.description, {
      direction: commitment.direction,
      due_date_text: commitment.due_date_text,
      source_type: commitment.source_type,
    }, dimConf.commitment >= 0.7 ? 'confirmed' : 'provisional')
    nodeIds.push(commitmentNodeId)
  }

  // NO emotion nodes — emotional signals are stored separately, not in graph
  // This prevents phantom emotional entities from polluting the graph

  // Create time period nodes from dates — only with temporal confidence
  if (dimConf.temporal >= 0.5) {
    for (const date of entities.dates_mentioned) {
      const timeNodeId = await upsertNode(userId, 'time_period', date.raw_text, {
        context: date.context,
      }, 'provisional')
      nodeIds.push(timeNodeId)
    }
  }

  // Create goal nodes from follow-up intents — only facts with high confidence
  if (entities.follow_up_intents) {
    for (const intent of entities.follow_up_intents) {
      if (intent.confidence > 0.7 && intent.source_type === 'fact') {
        const goalNodeId = await upsertNode(userId, 'goal', intent.description, {
          expected_timeframe: intent.expected_timeframe,
          confidence: intent.confidence,
          source_type: intent.source_type,
        }, 'provisional')
        nodeIds.push(goalNodeId)
      }
    }
  }

  return nodeIds
}

/**
 * Connect co-occurring nodes with edges.
 *
 * Edges between provisional nodes get reduced weight (0.3x).
 * Edges between confirmed nodes get full weight.
 * Mixed edges (provisional-confirmed) get 0.6x weight.
 */
export async function createEdges(
  userId: string,
  memoryId: string,
  entities: ExtractedEntities
): Promise<void> {
  const supabase = createAdminClient()

  // Get conversation node
  const { data: convNode } = await supabase
    .from('cognitive_graph_nodes')
    .select('id, status')
    .eq('user_id', userId)
    .eq('node_type', 'conversation')
    .eq('label', memoryId)
    .single()

  if (!convNode) return

  // Helper: get edge weight based on node statuses
  const getEdgeWeight = (statusA: string, statusB: string): number => {
    if (statusA === 'confirmed' && statusB === 'confirmed') return 1.0
    if (statusA === 'provisional' && statusB === 'provisional') return 0.3
    return 0.6 // mixed
  }

  // Connect people to conversation
  for (const person of entities.people) {
    const { data: personNode } = await supabase
      .from('cognitive_graph_nodes')
      .select('id, status')
      .eq('user_id', userId)
      .eq('node_type', 'person')
      .eq('label', person.name)
      .single()

    if (personNode) {
      const weight = getEdgeWeight(personNode.status, convNode.status)
      await upsertEdge(userId, personNode.id, convNode.id, 'participated_in', weight)

      // Check if this co-occurrence should promote the provisional node
      if (personNode.status === 'provisional') {
        await checkPromotion(supabase, userId, personNode.id)
      }
    }
  }

  // Connect verified commitments to people and conversation
  for (const commitment of entities.commitments) {
    if (commitment.source_type !== 'fact' || !commitment.has_explicit_verb) continue

    const { data: commitNode } = await supabase
      .from('cognitive_graph_nodes')
      .select('id, status')
      .eq('user_id', userId)
      .eq('node_type', 'commitment')
      .eq('label', commitment.description)
      .single()

    if (commitNode) {
      const weight = getEdgeWeight(commitNode.status, convNode.status)
      await upsertEdge(userId, commitNode.id, convNode.id, 'originates_from', weight)

      if (commitment.person_name) {
        const { data: personNode } = await supabase
          .from('cognitive_graph_nodes')
          .select('id, status')
          .eq('user_id', userId)
          .eq('node_type', 'person')
          .eq('label', commitment.person_name)
          .single()

        if (personNode) {
          const edgeType = commitment.direction === 'outgoing' ? 'committed_to' : 'received_from'
          const personWeight = getEdgeWeight(commitNode.status, personNode.status)
          await upsertEdge(userId, commitNode.id, personNode.id, edgeType, personWeight)
        }
      }
    }
  }

  // Connect people to each other when co-occurring — only fact-classified people
  const factPeople = entities.people.filter(p => p.source_type === 'fact')
  for (let i = 0; i < factPeople.length; i++) {
    for (let j = i + 1; j < factPeople.length; j++) {
      const { data: nodeA } = await supabase
        .from('cognitive_graph_nodes')
        .select('id, status')
        .eq('user_id', userId)
        .eq('node_type', 'person')
        .eq('label', factPeople[i].name)
        .single()

      const { data: nodeB } = await supabase
        .from('cognitive_graph_nodes')
        .select('id, status')
        .eq('user_id', userId)
        .eq('node_type', 'person')
        .eq('label', factPeople[j].name)
        .single()

      if (nodeA && nodeB) {
        const weight = getEdgeWeight(nodeA.status, nodeB.status)
        await upsertEdge(userId, nodeA.id, nodeB.id, 'co_occurred', weight)
      }
    }
  }

  // Connect time periods to conversation
  for (const date of entities.dates_mentioned) {
    const { data: timeNode } = await supabase
      .from('cognitive_graph_nodes')
      .select('id, status')
      .eq('user_id', userId)
      .eq('node_type', 'time_period')
      .eq('label', date.raw_text)
      .single()

    if (timeNode) {
      const weight = getEdgeWeight(timeNode.status, convNode.status)
      await upsertEdge(userId, timeNode.id, convNode.id, 'referenced_in', weight)
    }
  }
}

/**
 * Check if a provisional node should be promoted based on co-occurrence
 * with confirmed nodes.
 */
async function checkPromotion(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  nodeId: string
): Promise<void> {
  // Count edges to confirmed nodes
  const { data: edges } = await supabase
    .from('cognitive_graph_edges')
    .select('source_node_id, target_node_id')
    .eq('user_id', userId)
    .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`)

  if (!edges || edges.length < PROMOTION_CO_OCCURRENCE) return

  // Check how many neighbors are confirmed
  const neighborIds = edges.map(e =>
    e.source_node_id === nodeId ? e.target_node_id : e.source_node_id
  )

  const { count: confirmedNeighbors } = await supabase
    .from('cognitive_graph_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('id', neighborIds)
    .eq('status', 'confirmed')

  if ((confirmedNeighbors || 0) >= PROMOTION_CO_OCCURRENCE) {
    await supabase
      .from('cognitive_graph_nodes')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', nodeId)
  }
}

/**
 * Traverse graph edges to find connected context.
 * Only traverses through confirmed nodes by default.
 */
export async function queryGraph(
  userId: string,
  nodeId: string,
  depth: number = 2,
  includeProvisional: boolean = false
): Promise<{ nodes: CognitiveGraphNode[]; edges: CognitiveGraphEdge[] }> {
  const supabase = createAdminClient()
  const visitedNodes = new Set<string>()
  const allNodes: CognitiveGraphNode[] = []
  const allEdges: CognitiveGraphEdge[] = []
  let currentLayer = [nodeId]

  for (let d = 0; d < depth; d++) {
    if (currentLayer.length === 0) break

    const { data: edges } = await supabase
      .from('cognitive_graph_edges')
      .select('*')
      .eq('user_id', userId)
      .or(`source_node_id.in.(${currentLayer.join(',')}),target_node_id.in.(${currentLayer.join(',')})`)

    if (!edges) break

    const nextLayer: string[] = []
    for (const edge of edges) {
      allEdges.push(edge)
      const neighborId = currentLayer.includes(edge.source_node_id)
        ? edge.target_node_id
        : edge.source_node_id
      if (!visitedNodes.has(neighborId)) {
        visitedNodes.add(neighborId)
        nextLayer.push(neighborId)
      }
    }

    if (nextLayer.length > 0) {
      let query = supabase
        .from('cognitive_graph_nodes')
        .select('*')
        .eq('user_id', userId)
        .in('id', nextLayer)

      // Filter out provisional nodes unless explicitly requested
      if (!includeProvisional) {
        query = query.eq('status', 'confirmed')
      }

      const { data: nodes } = await query

      if (nodes) allNodes.push(...nodes)
    }

    currentLayer = nextLayer
  }

  return { nodes: allNodes, edges: allEdges }
}

/**
 * Build current life state from the cognitive graph for the companion context window.
 */
export async function getContextWindow(userId: string): Promise<ContextWindow> {
  const supabase = createAdminClient()

  // Active interrupted threads sorted by decay-adjusted priority
  const { data: threads } = await supabase
    .from('interrupted_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'interrupted')
    .order('last_activity_at', { ascending: false })
    .limit(10)

  // Recent emotional readings
  const { data: emotions } = await supabase
    .from('emotional_readings')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(10)

  // Key people (most mentioned recently) — only confirmed graph nodes
  const { data: people } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .order('last_mentioned_at', { ascending: false })
    .limit(5)

  // Latest continuity snapshot
  const { data: latestSnapshot } = await supabase
    .from('continuity_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  // Recent snapshots for trajectory
  const { data: recentSnapshots } = await supabase
    .from('continuity_snapshots')
    .select('continuity_score')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(7)

  const scores = (recentSnapshots || []).map(s => s.continuity_score).reverse()
  const score = latestSnapshot?.continuity_score ?? 85
  const state: ContinuityState = latestSnapshot?.state ?? 'stable'

  // Determine emotional trajectory from signals (not GPT-interpreted readings)
  const emotionList = emotions || []
  const dominantEmotion = emotionList.length > 0 ? emotionList[0].emotion : 'neutral'
  const volatility = emotionList.length > 1
    ? emotionList.reduce((sum, e, i) => {
        if (i === 0) return 0
        return sum + Math.abs(e.intensity - emotionList[i - 1].intensity)
      }, 0) / (emotionList.length - 1)
    : 0

  // Trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable'
  if (scores.length >= 3) {
    const recent = scores.slice(-3)
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length
    const older = scores.slice(0, -3)
    if (older.length > 0) {
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length
      if (avg - olderAvg > 5) trend = 'improving'
      else if (olderAvg - avg > 5) trend = 'declining'
    }
  }

  return {
    life_state: {
      active_threads: threads || [],
      recent_emotions: emotionList,
      key_people: people || [],
      continuity_score: score,
      continuity_state: state,
    },
    unresolved_threads: (threads || []).filter(t => t.continuity_retention > 0.2),
    emotional_context: {
      trajectory: volatility > 0.3 ? 'volatile' : 'steady',
      dominant_emotion: dominantEmotion,
      volatility,
    },
    continuity_trajectory: {
      trend,
      recent_scores: scores,
    },
  }
}
