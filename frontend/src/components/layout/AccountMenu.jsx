import { useState } from "react";
import styled from "styled-components";

import { useAuth } from "../../auth/useAuth";

const Bar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid
    ${({ theme }) => theme.colors.border};

  button {
    padding: 8px 14px;
    border: 1px solid
      ${({ theme }) => theme.colors.border};
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.text};
  }

  p {
    margin: 0;
  }

  small {
    color: ${({ theme }) => theme.colors.textMuted};
  }

  [role="alert"] {
    width: 100%;
    color: #b42318;
  }
`;

export default function AccountMenu() {
  const { account, logout } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (busy) return;

    setError("");
    setBusy(true);

    try {
      await logout();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Bar>
      <div>
        <p>
          {account.person.firstName}{" "}
          {account.person.lastName}
        </p>

        <small>@{account.username}</small>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={signOut}
      >
        {busy ? "Logging out…" : "Log out"}
      </button>

      {error && <p role="alert">{error}</p>}
    </Bar>
  );
}