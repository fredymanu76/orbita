-- Migration: Provisional graph nodes + fact/inference separation
-- Prevents low-confidence graph pollution and separates facts from inferences

-- Add provisional/confirmed/deprecated status to cognitive graph nodes
ALTER TABLE cognitive_graph_nodes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS mention_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- Add fact/inference source_type to commitments
ALTER TABLE commitments
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'fact';

-- Index for querying confirmed vs provisional nodes
CREATE INDEX IF NOT EXISTS idx_graph_nodes_status
  ON cognitive_graph_nodes(user_id, status);

-- Index for promotion queries (finding provisional nodes with high co-occurrence)
CREATE INDEX IF NOT EXISTS idx_graph_nodes_provisional
  ON cognitive_graph_nodes(user_id, status, mention_count)
  WHERE status = 'provisional';

-- Add constraint for valid status values
ALTER TABLE cognitive_graph_nodes
  ADD CONSTRAINT chk_node_status CHECK (status IN ('provisional', 'confirmed', 'deprecated'));

-- Add constraint for valid source_type values
ALTER TABLE commitments
  ADD CONSTRAINT chk_commitment_source_type CHECK (source_type IN ('fact', 'inference'));
