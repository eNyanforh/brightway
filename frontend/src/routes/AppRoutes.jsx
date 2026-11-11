const ManagementDirectoryPage = lazy(() => import("../pages/ManagementDirectoryPage"));
const ManagementCasesPage = lazy(() => import("../pages/ManagementCasesPage"));
const ManagementPostReviewsPage = lazy(() => import("../pages/ManagementPostReviewsPage"));
const ManagementOperationsPage = lazy(() => import("../pages/ManagementOperationsPage"));
function ManagementTool({ children }) { return <Suspense fallback={<p role="status">Loading management tool…</p>}>{children}</Suspense>; }
import ManagementProvider from "../auth/ManagementProvider";
import ManagementGate from "../auth/ManagementGate";
import ManagementLayout from "../layouts/ManagementLayout";
import ManagementLoginPage from "../pages/ManagementLoginPage";
import ManagementSecurityPage from "../pages/ManagementSecurityPage";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { memberProfilePath } from "../../../shared/member-profile-paths.mjs";
import { lazy, Suspense } from "react";
const OrganizationSetupGate = lazy(() => import("../components/organizations/OrganizationSetupGate"));
const OrganizationWorkspacePage = lazy(() => import("../pages/OrganizationWorkspacePage"));
function WorkspaceRoute({ section }) { return <Suspense fallback={<p role="status">Loading organization workspace…</p>}><OrganizationSetupGate><OrganizationWorkspacePage section={section} /></OrganizationSetupGate></Suspense>; }
const WorkPage = lazy(() => import("../pages/WorkPage"));
const ManagementPage = lazy(() => import("../pages/ManagementPage"));
import OrganizationRequestsPage from "../pages/OrganizationRequestsPage";
import OrganizationReviewPage from "../pages/OrganizationReviewPage";
import OrganizationPage from "../pages/OrganizationPage";
import ProfilePhotoReviewsPage from "../pages/ProfilePhotoReviewsPage";
import NameChangePage from "../pages/NameChangePage";
import NameChangeReviewsPage from "../pages/NameChangeReviewsPage";
import ManualIdentityPage from "../pages/ManualIdentityPage";
import ManualIdentityReviewsPage from "../pages/ManualIdentityReviewsPage";
import AccountSecurityPage from "../pages/AccountSecurityPage";
import PasswordRecoveryPage from "../pages/PasswordRecoveryPage";
import MyCredentialReviewsPage from "../pages/MyCredentialReviewsPage";
import CredentialPage from "../pages/CredentialPage";
const CredentialReviewsPage = lazy(() => import("../pages/CredentialReviewsPage"));
import { Navigate, Routes, Route } from "react-router-dom";

import PublicLayout from "../layouts/PublicLayout";
import AppLayout from "../layouts/AppLayout";
import AuthGate from "../auth/AuthGate";

import HomePage from "../pages/HomePage";
import PartnersPage from "../pages/PartnersPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";

import MemberPostsPage from "../pages/MemberPostsPage";
import ExplorePage from "../pages/ExplorePage";
const NetworkPage = lazy(() => import("../pages/NetworkPage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));
const DirectorySearchPage = lazy(() => import("../pages/DirectorySearchPage"));
const PublicPersonPage = lazy(() => import("../pages/PublicPersonPage"));
const OpportunitiesPage = lazy(() => import("../pages/OpportunitiesPage"));
const ProgramDetailPage = lazy(() => import("../pages/ProgramDetailPage"));
const AdmissionDetailPage = lazy(() => import("../pages/AdmissionDetailPage"));
const OpportunityDetailPage = lazy(() => import("../pages/OpportunityDetailPage"));
import ProfilePage from "../pages/ProfilePage";
import LearningPage from "../pages/LearningPage";

function LegacyMemberProfileRedirect() {
  const { username = "" } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: memberProfilePath(username), search, hash }} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>

      <Route path="/superadmin" element={<ManagementProvider><Outlet /></ManagementProvider>}>
        <Route path="login" element={<ManagementLoginPage />} />
        <Route element={<ManagementGate />}><Route element={<ManagementLayout />}>
          <Route path="" element={<Suspense fallback={<p role="status">Loading BrightWay management…</p>}><ManagementPage /></Suspense>}>
            <Route path="users" element={<ManagementTool><ManagementDirectoryPage kind="users" /></ManagementTool>} />
            <Route path="directory" element={<ManagementTool><ManagementDirectoryPage kind="organizations" /></ManagementTool>} />
            <Route path="team" element={<ManagementTool><ManagementDirectoryPage kind="team" /></ManagementTool>} />
            <Route path="support" element={<ManagementTool><ManagementCasesPage /></ManagementTool>} />
            <Route path="reports" element={<ManagementTool><ManagementCasesPage kind="REPORT" /></ManagementTool>} />
            <Route path="post-reviews" element={<ManagementTool><ManagementPostReviewsPage /></ManagementTool>} />
            <Route path="audit" element={<ManagementTool><ManagementOperationsPage audit /></ManagementTool>} />
            <Route path="operations" element={<ManagementTool><ManagementOperationsPage /></ManagementTool>} />
            <Route path="credentials" element={<Suspense fallback={<p role="status">Loading credential reviews…</p>}><CredentialReviewsPage /></Suspense>} />
            <Route path="identity" element={<ManualIdentityReviewsPage />} />
            <Route path="photos" element={<ProfilePhotoReviewsPage />} />
            <Route path="names" element={<NameChangeReviewsPage />} />
            <Route path="organizations" element={<OrganizationReviewPage />} />
          </Route>
        <Route path="security" element={<ManagementSecurityPage />} />
        </Route></Route>
      </Route>
          <Route path="/admin/organizations" element={<Navigate to="/superadmin/organizations" replace />} />
          <Route path="/admin/credentials" element={<Navigate to="/superadmin/credentials" replace />} />
          <Route path="/admin/manual-identity" element={<Navigate to="/superadmin/identity" replace />} />
          <Route path="/admin/profile-photos" element={<Navigate to="/superadmin/photos" replace />} />
          <Route path="/admin/name-changes" element={<Navigate to="/superadmin/names" replace />} />
      <Route path="/management" element={<Navigate to="/superadmin" replace />} />
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/partners" element={<PartnersPage />} />
        <Route path="/organizations/:id" element={<OrganizationPage />} />

        <Route path="/forgot-password" element={<PasswordRecoveryPage />} />

        <Route element={<AuthGate guest />}>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<AuthGate />}>
        <Route element={<AppLayout />}>
          <Route path="/organization-workspace" element={<Navigate to="/work" replace />} />
          <Route path="/organization-workspace/:organizationId/credentials" element={<Suspense fallback={<p role="status">Loading organization workspace…</p>}><OrganizationSetupGate><CredentialReviewsPage /></OrganizationSetupGate></Suspense>} />
          <Route path="/organization-workspace/:id/profile" element={<WorkspaceRoute section="profile" />} />
          <Route path="/organization-workspace/:id/campus" element={<WorkspaceRoute section="campus" />} />
          <Route path="/organization-workspace/:id/staff" element={<WorkspaceRoute section="staff" />} />
          <Route path="/organization-workspace/:id/posts" element={<WorkspaceRoute section="posts" />} />
          <Route path="/organization-workspace/:id/opportunities" element={<WorkspaceRoute section="opportunities" />} />
          <Route path="/organization-workspace/:id/programs" element={<WorkspaceRoute section="programs" />} />
          <Route path="/organization-workspace/:id/admissions" element={<WorkspaceRoute section="admissions" />} />
          <Route path="/organization-workspace/:id/applications" element={<WorkspaceRoute section="applications" />} />
          <Route path="/organization-workspace/:id" element={<WorkspaceRoute />} />
          <Route path="/work" element={<Suspense fallback={<p role="status">Loading My Workspace…</p>}><WorkPage /></Suspense>} />
          <Route path="/work/requests/:id/edit" element={<OrganizationRequestsPage />} />
          <Route path="/organizations/new" element={<OrganizationRequestsPage />} />
          <Route path="/credentials" element={<MyCredentialReviewsPage />} />
          <Route path="/credentials/:kind/:recordId" element={<CredentialPage />} />
          <Route path="/manual-identity" element={<ManualIdentityPage />} />
          <Route path="/manual-identity/name-change" element={<NameChangePage />} />
          <Route path="/help" element={<ManagementTool><ManagementCasesPage personal /></ManagementTool>} />
          <Route path="/help/reports" element={<ManagementTool><ManagementCasesPage kind="REPORT" personal /></ManagementTool>} />
          <Route path="/security" element={<AccountSecurityPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/search" element={<Suspense fallback={<p role="status">Opening search…</p>}><DirectorySearchPage /></Suspense>} />
          <Route path="/posts" element={<MemberPostsPage />} />

          <Route path="/network" element={<Suspense fallback={<p role="status">Loading your network…</p>}><NetworkPage /></Suspense>} />
          <Route path="/notifications" element={<Suspense fallback={<p role="status">Loading notifications…</p>}><NotificationsPage /></Suspense>} />
          <Route path="/people/:username" element={<LegacyMemberProfileRedirect />} />

          <Route path="/opportunities" element={<Suspense fallback={<p role="status">Loading opportunities…</p>}><OpportunitiesPage /></Suspense>} />
          <Route path="/opportunities/:id" element={<Suspense fallback={<p role="status">Opening opportunity…</p>}><OpportunityDetailPage /></Suspense>} />
          <Route path="/applications/:id" element={<Suspense fallback={<p role="status">Opening application…</p>}><OpportunityDetailPage application /></Suspense>} />

          <Route path="/learning/programs/:id" element={<Suspense fallback={<p role="status">Opening program…</p>}><ProgramDetailPage /></Suspense>} />
          <Route path="/learning/cycles/:id" element={<Suspense fallback={<p role="status">Opening admission cycle…</p>}><AdmissionDetailPage /></Suspense>} />
          <Route path="/learning/applications/:id" element={<Suspense fallback={<p role="status">Opening application…</p>}><AdmissionDetailPage application /></Suspense>} />
          <Route path="/learning" element={<LearningPage />} />
          <Route path="/:username" element={<Suspense fallback={<p role="status">Opening profile…</p>}><PublicPersonPage /></Suspense>} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
