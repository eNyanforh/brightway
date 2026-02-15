// src/components/GoogleLoginButton.js
import React, { useEffect } from "react";

export default function GoogleLoginButton({ onSuccess, onError }) {
  useEffect(() => {
    /* global google */
    if (window.google) {
      google.accounts.id.initialize({
        client_id: "185992953218-8tppic8lrjfep0qquhtaeh3hpoiljctf.apps.googleusercontent.com",
        callback: handleCredentialResponse,
      });

      google.accounts.id.renderButton(
        document.getElementById("googleSignInDiv"),
        {
          theme: "outline",
          size: "large",
          shape: "pill",
        }
      );
    }
  }, []);

  const handleCredentialResponse = (response) => {
    console.log("Encoded JWT ID token: " + response.credential);

    // send to backend
    fetch("http://localhost:5000/verify-google-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: response.credential }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("Server response:", data);
      })
      .catch((err) => {
        console.error(err);
      });
  };

  return (
    <div>
      <div id="googleSignInDiv"></div>
    </div>
  );
}








