import React, { useState } from "react";
import SignupModal from "./SignupModal";
import SetupModal from "./SetupModal";
import UserHomepage from "./UserHomepage";
import { useUser } from "./UserContext";

export default function OnboardingFlow() {
  const { user, completeSetup } = useUser();
  const [signupOpen, setSignupOpen] = useState(!user);
  const [setupOpen, setSetupOpen] = useState(false);

  // Show SetupModal automatically after signup
  const handleSignupClose = () => {
    setSignupOpen(false);
    if (user?.onboardingStatus === "SIGNUP_COMPLETE") {
      setSetupOpen(true);
    }
  };

  const handleSetupComplete = (data) => {
    completeSetup(data);
    setSetupOpen(false);
  };

  return (
    <>
      {!user || signupOpen ? (
        <SignupModal onClose={handleSignupClose} />
      ) : null}

      {user && setupOpen ? (
        <SetupModal onComplete={handleSetupComplete} />
      ) : null}

      {user && user.onboardingStatus === "COMPLETED" ? (
        <UserHomepage />
      ) : null}
    </>
  );
}
