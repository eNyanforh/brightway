import styled from "styled-components"

export const Hero = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f9f9f9;
  height: 100vh;
  font-family: 'Inter', sans-serif;
`;

export const FormContainer = styled.div`
  z-index: 1;
  width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.9rem;
  justify-content: center;
  padding: 1rem;

  a {
    margin-top: 1rem;
    color: #3b82f6;
    text-decoration: none;
    font-weight: 500;

      &:hover {
      text-decoration:underline;
      transform: scale(1.01);
  }

  @media (max-width: 480px) {
    width: 90%;
    
  }
`;

export const FormDetail = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const Agreement = styled.div`
  text-align: center;
  margin-top: 1rem;
  width: 300px;
  font-size: 0.8rem;
  color: #444;
`;

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2222222222222222222222;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const Modal = styled.div`
  background:white;
  width: 100%;
  max-width: 420px;
  height:auto;
  border-radius: 14px;
  padding: 32px;
  position: relative;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  font-family: "Inter", sans-serif;
`;

export const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  left: 16px;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  &:hover {
    color: #ffffff;
  }
`;


export const PasswordContainer = styled.div`
  position: relative;
  width: 100%;
  margin-top: 1rem;
`;

export const PasswordInput = styled.input`
  width: 100%;
  font-weight:bold;
  padding: 0.75rem 1rem;
  border-radius: 30px;
  border: 1.5px solid #ccc;
  font-size: 1rem;
  font-family: "Inter", sans-serif;
  background-color: rgba(217, 217, 217, 0.3);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: #eff6ff;
  }
`;

export const TogglePassword = styled.span`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: #3b82f6;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
`;