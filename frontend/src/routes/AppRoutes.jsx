import ProfilePhotoReviewsPage from "../pages/ProfilePhotoReviewsPage";
import ManualIdentityPage from "../pages/ManualIdentityPage";
import ManualIdentityReviewsPage from "../pages/ManualIdentityReviewsPage";
import AccountSecurityPage from "../pages/AccountSecurityPage";
import PasswordRecoveryPage from "../pages/PasswordRecoveryPage";
import MyCredentialReviewsPage from "../pages/MyCredentialReviewsPage";
import CredentialPage from "../pages/CredentialPage";
import CredentialReviewsPage from "../pages/CredentialReviewsPage";
import { Routes, Route } from "react-router-dom";

import PublicLayout from "../layouts/PublicLayout";
import AppLayout from "../layouts/AppLayout";
import AuthGate from "../auth/AuthGate";

import HomePage from "../pages/HomePage";
import PartnersPage from "../pages/PartnersPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";

import ExplorePage from "../pages/ExplorePage";
import NetworkPage from "../pages/NetworkPage";
import OpportunitiesPage from "../pages/OpportunitiesPage";
import ProfilePage from "../pages/ProfilePage";
import LearningPage from "../pages/LearningPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/partners" element={<PartnersPage />} />

        <Route path="/forgot-password" element={<PasswordRecoveryPage />} />

        <Route element={<AuthGate guest />}>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<AuthGate />}>
        <Route element={<AppLayout />}>
          <Route path="/credentials" element={<MyCredentialReviewsPage />} />
          <Route path="/credentials/:kind/:recordId" element={<CredentialPage />} />
          <Route path="/admin/credentials" element={<CredentialReviewsPage />} />
          <Route path="/manual-identity" element={<ManualIdentityPage />} />
          <Route path="/admin/manual-identity" element={<ManualIdentityReviewsPage />} />
          <Route path="/admin/profile-photos" element={<ProfilePhotoReviewsPage />} />
          <Route path="/security" element={<AccountSecurityPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/explore" element={<ExplorePage />} />

          <Route path="/network" element={<NetworkPage />} />

          <Route path="/opportunities" element={<OpportunitiesPage />} />

          <Route path="/learning" element={<LearningPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}