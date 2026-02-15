import React, { createContext, useContext, useState } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);

  // Call this after SignupModal is complete
  const setSignupUser = (signupData) => {
    setUser({
      ...signupData,
      onboardingStatus: "SIGNUP_COMPLETE", // new state
    });
  };

  // Call this after SetupModal is complete
  const completeSetup = (setupData) => {
    setUser((prev) => ({
      ...prev,
      ...setupData,
      onboardingStatus: "COMPLETED",
    }));
  };

  return (
    <UserContext.Provider value={{ user, setSignupUser, completeSetup }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
