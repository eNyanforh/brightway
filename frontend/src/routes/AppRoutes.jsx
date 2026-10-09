
import { Routes, Route } from "react-router-dom";

// Shared page layouts
import PublicLayout from "../layouts/PublicLayout";
import AppLayout from "../layouts/AppLayout";

// Public pages
import HomePage from "../pages/HomePage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";

// Application pages
import ExplorePage from "../pages/ExplorePage";
import NetworkPage from "../pages/NetworkPage";
import OpportunitiesPage from "../pages/OpportunitiesPage";
import LearningPage from "../pages/LearningPage";

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/*
        Application routes.

        These are NOT protected yet.
        Authentication guards will be added
        after implementing the identity system.
      */}
      <Route element={<AppLayout />}>
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route
          path="/opportunities"
          element={<OpportunitiesPage />}
        />
        <Route path="/learning" element={<LearningPage />} />
      </Route>

      {/* Unknown routes */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default AppRoutes;
