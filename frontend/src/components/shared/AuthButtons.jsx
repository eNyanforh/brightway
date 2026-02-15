import React from "react";
import styled from "styled-components";

const Button = styled.button`
  background-color: rgba(217, 217, 217, 0.4);
  background-repeat: no-repeat;
  background-position: left 1.2rem center;
  background-size: 1.4rem;
  color: #111;
  border: 1px solid #ccc;
  width: 100%;
  height: 50px;
  padding: 0;
  font-weight: 600;
  font-size: 1rem;
  border-radius: 30px;
  margin-top: 0.6rem;
  cursor: pointer;

  &:hover {
    border: 1.5px solid #888;
    background-color: rgba(217, 217, 217, 0.6);
  }
`;

const GoogleBtn = styled(Button)`
  background-image: url("/google.svg");
`;

const FacebookBtn = styled(Button)`
  background-image: url("/facebook.svg");
`;

const AuthButtons = ({ onClick }) => (
  <>
    <GoogleBtn onClick={onClick}>Continue with Google</GoogleBtn>
    <FacebookBtn onClick={onClick}>Continue with Facebook</FacebookBtn>
  </>
);

export default AuthButtons;
