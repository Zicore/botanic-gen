import React from 'react';
import { Settings2, TreeDeciduous, GitBranch, Leaf, TreePalm, Wheat, Layers } from 'lucide-react';

const ICONS = {
  tree: Settings2,
  trunk: TreeDeciduous,
  branches: GitBranch,
  leaves: Leaf,
  fronds: TreePalm,
  grass: Wheat,
  bark: Layers,
  leaf: Leaf,
};

export function NodeIcon({ type, size = 14 }) {
  const I = ICONS[type] ?? Settings2;
  return <I size={size} strokeWidth={2} />;
}
