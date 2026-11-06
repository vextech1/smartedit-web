import { error, redirect } from '@sveltejs/kit';
import { currentWorkspaceId, workspaceById, workspaces } from '#lib/core/workspaces.ts';

export const entries = () => workspaces.map((w) => ({ id: w.id }));

export function load({ params, url }) {
  // A studio that was folded into another: keep old links, and the tab and work they name, working.
  if (currentWorkspaceId(params.id) !== params.id) redirect(308, `/studio/${currentWorkspaceId(params.id)}${url.search}`);
  const workspace = workspaceById(params.id);
  if (!workspace) error(404, 'Studio not found');
  return { workspace };
}
