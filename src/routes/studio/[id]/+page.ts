import { error } from '@sveltejs/kit';
import { workspaceById, workspaces } from '#lib/core/workspaces.ts';

export const entries = () => workspaces.map((w) => ({ id: w.id }));

export function load({ params }) {
  const workspace = workspaceById(params.id);
  if (!workspace) error(404, 'Studio not found');
  return { workspace };
}
