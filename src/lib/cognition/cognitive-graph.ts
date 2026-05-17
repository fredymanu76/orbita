import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CognitiveGraphNode,
  CognitiveGraphEdge,
  CognitiveGraphNodeType,
  ExtractedEntities,
  ContextWindow,
  ContinuityState,
} from '@/lib/types'

/**
 * Find or create a cognitive graph node.
 */
async function upsertNode(
  userId: string,
  nodeType: CognitiveGraphNodeType,
  label: string,
  properties: Record<string, unknown> = {}
): Promise<string> {
  const supabase = createAdminClient()

  // Try to find existing node
  const { data: existing } = await supabase
    .from('cognitive_graph_nodes')
    .select('id')
    .eq('user_id', userId)
    .eq('node_type', nodeType)
    .eq('label', label)
    .single()

  if (existing) {
    await supabase
      .from('cognitive_graph_nodes')
      .update({
        properties: { ...properties },
        updated_at: new Date().toISOString(),
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
    })
    .select('id')
    .single()

  return created!.id
}

/**
 * Create or update an edge between two nodes.
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
 */
export async function buildGraphNodes(
  userId: string,
  memoryId: string,
  entities: ExtractedEntities
): Promise<string[]> {
  const nodeIds: string[] = []

  // Create conversation node for this memory
  const conversationNodeId = await upsertNode(userId, 'conversation', memoryId, {
    summary: entities.summary,
    emotional_tone: entities.emotional_tone,
  })
  nodeIds.push(conversationNodeId)

  // Create person nodes
  for (const person of entities.people) {
    const personNodeId = await upsertNode(userId, 'person', person.name, {
      relationship: person.relationship,
      role: person.role,
    })
    nodeIds.push(personNodeId)
  }

  // Create commitment nodes
  for (const commitment of entities.commitments) {
    const commitmentNodeId = await upsertNode(userId, 'commitment', commitment.description, {
      direction: commitment.direction,
      due_date_text: commitment.due_date_text,
    })
    nodeIds.push(commitmentNodeId)
  }

  // Create emotion node if emotional analysis available
  if (entities.emotional_analysis) {
    const emotionNodeId = await upsertNode(
      userId,
      'emotion',
      entities.emotional_analysis.primary_emotion,
      {
        intensity: entities.emotional_analysis.intensity,
        valence: entities.emotional_analysis.valence,
      }
    )
    nodeIds.push(emotionNodeId)
  }

  // Create time period nodes from dates
  for (const date of entities.dates_mentioned) {
    const timeNodeId = await upsertNode(userId, 'time_period', date.raw_text, {
      context: date.context,
    })
    nodeIds.push(timeNodeId)
  }

  // Create goal nodes from follow-up intents
  if (entities.follow_up_intents) {
    for (const intent of entities.follow_up_intents) {
      if (intent.confidence > 0.5) {
        const goalNodeId = await upsertNode(userId, 'goal', intent.description, {
          expected_timeframe: intent.expected_timeframe,
          confidence: intent.confidence,
        })
        nodeIds.push(goalNodeId)
      }
    }
  }

  return nodeIds
}

/**
 * Connect co-occurring nodes with edges.
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
    .select('id')
    .eq('user_id', userId)
    .eq('node_type', 'conversation')
    .eq('label', memoryId)
    .single()

  if (!convNode) return

  // Connect people to conversation
  for (const person of entities.people) {
    const { data: personNode } = await supabase
      .from('cognitive_graph_nodes')
      .select('id')
      .eq('user_id', userId)
      .eq('node_type', 'person')
      .eq('label', person.name)
      .single()

    if (personNode) {
      await upsertEdge(userId, personNode.id, convNode.id, 'participated_in')
    }
  }

  // Connect commitments to people and conversation
  for (const commitment of entities.commitments) {
    const { data: commitNode } = await supabase
      .from('cognitive_graph_nodes')
      .select('id')
      .eq('user_id', userId)
      .eq('node_type', 'commitment')
      .eq('label', commitment.description)
      .single()

    if (commitNode) {
      await upsertEdge(userId, commitNode.id, convNode.id, 'originates_from')

      if (commitment.person_name) {
        const { data: personNode } = await supabase
          .from('cognitive_graph_nodes')
          .select('id')
          .eq('user_id', userId)
          .eq('node_type', 'person')
          .eq('label', commitment.person_name)
          .single()

        if (personNode) {
          const edgeType = commitment.direction === 'outgoing' ? 'committed_to' : 'received_from'
          await upsertEdge(userId, commitNode.id, personNode.id, edgeType)
        }
      }
    }
  }

  // Connect people to each other when co-occurring
  for (let i = 0; i < entities.people.length; i++) {
    for (let j = i + 1; j < entities.people.length; j++) {
      const { data: nodeA } = await supabase
        .from('cognitive_graph_nodes')
        .select('id')
        .eq('user_id', userId)
        .eq('node_type', 'person')
        .eq('label', entities.people[i].name)
        .single()

      const { data: nodeB } = await supabase
        .from('cognitive_graph_nodes')
        .select('id')
        .eq('user_id', userId)
        .eq('node_type', 'person')
        .eq('label', entities.people[j].name)
        .single()

      if (nodeA && nodeB) {
        await upsertEdge(userId, nodeA.id, nodeB.id, 'co_occurred')
      }
    }
  }

  // Connect emotion to conversation and people
  if (entities.emotional_analysis) {
    const { data: emotionNode } = await supabase
      .from('cognitive_graph_nodes')
      .select('id')
      .eq('user_id', userId)
      .eq('node_type', 'emotion')
      .eq('label', entities.emotional_analysis.primary_emotion)
      .single()

    if (emotionNode) {
      await upsertEdge(userId, emotionNode.id, convNode.id, 'felt_during')

      for (const person of entities.people) {
        const { data: personNode } = await supabase
          .from('cognitive_graph_nodes')
          .select('id')
          .eq('user_id', userId)
          .eq('node_type', 'person')
          .eq('label', person.name)
          .single()

        if (personNode) {
          await upsertEdge(userId, emotionNode.id, personNode.id, 'associated_with')
        }
      }
    }
  }

  // Connect time periods to commitments
  for (const date of entities.dates_mentioned) {
    const { data: timeNode } = await supabase
      .from('cognitive_graph_nodes')
      .select('id')
      .eq('user_id', userId)
      .eq('node_type', 'time_period')
      .eq('label', date.raw_text)
      .single()

    if (timeNode) {
      await upsertEdge(userId, timeNode.id, convNode.id, 'referenced_in')
    }
  }
}

/**
 * Traverse graph edges to find connected context.
 */
export async function queryGraph(
  userId: string,
  nodeId: string,
  depth: number = 2
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
      const { data: nodes } = await supabase
        .from('cognitive_graph_nodes')
        .select('*')
        .eq('user_id', userId)
        .in('id', nextLayer)

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

  // Key people (most mentioned recently)
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

  // Determine emotional trajectory
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
