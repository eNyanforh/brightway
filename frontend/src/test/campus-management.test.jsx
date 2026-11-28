import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CampusManagement } from '../pages/CampusManagementPage';
import { campusApi } from '../api/campus';
import { campusAreas } from '../../../shared/campus-workspace.mjs';
vi.mock('../api/campus', () => ({ campusApi: { workspace: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const snapshot = { organization: { id: 'a', name: 'Training NGO' }, campus: { displayName: 'Community Campus', enabledEngines: ['TVET'], engineConfigurations: [] }, counts: {}, permissions: [], enginePermissions: { TVET: ['organization.campus.teach'] }, organizationPermissions: [] };
snapshot.areas = campusAreas(snapshot);
it('shows only authorized engine and functional navigation before academic setup', async () => {
  campusApi.workspace.mockResolvedValue(snapshot);
  render(<MemoryRouter><CampusManagement id="a" section="overview" /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(screen.queryByRole('link', { name: 'Finance & billing' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Grade School' })).toBeNull();
  expect(screen.getByRole('link', { name: 'TVET' })).toBeTruthy();
  expect(screen.getByText('Campus Management Workspace')).toBeTruthy();
});
it('clears sensitive workspace content when current access is denied', async () => {
  campusApi.workspace.mockResolvedValueOnce(snapshot).mockRejectedValue(Object.assign(Error('Membership withdrawn'), { status: 403 }));
  render(<MemoryRouter><CampusManagement id="a" section="overview" /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Dashboard' });
  window.dispatchEvent(new Event('focus'));
  await screen.findByRole('alert');
  expect(screen.queryByRole('navigation', { name: 'Campus management' })).toBeNull();
});
it('ignores a response from the previous institutional context', async () => {
  let resolve;
  campusApi.workspace.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockRejectedValue(Object.assign(Error('Other institution denied'), { status: 403 }));
  const view = render(<MemoryRouter><CampusManagement key="a" id="a" section="overview" /></MemoryRouter>);
  view.rerender(<MemoryRouter><CampusManagement key="b" id="b" section="overview" /></MemoryRouter>);
  await screen.findByRole('alert'); resolve(snapshot);
  await waitFor(() => expect(screen.queryByText('Community Campus')).toBeNull());
});
it('does not infer sensitive capabilities from membership role names', () => {
  expect(campusAreas({ role: 'PRIMARY_ADMIN' })).toEqual([]);
  const areas = campusAreas({ enginePermissions: { GRADE_SCHOOL: ['organization.campus.teach'] } }).map(a => a.key);
  expect(areas).toEqual(['overview', 'grade-school', 'announcements']);
});
